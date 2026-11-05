<?php

namespace App\Http\Controllers\Workforce;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\DeductionRule;
use App\Models\Employee;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Admin-configured deductions. Every change records old and new values;
 * finalized payroll keeps its own snapshot, so history never changes.
 * Owner only (Permission::PayrollManage).
 */
class DeductionRuleController extends Controller
{
    private const AUDITED = [
        'code', 'name', 'enabled', 'method', 'basis', 'employee_rate_bps', 'employer_rate_bps', 'fixed_cents',
        'floor_cents', 'ceiling_cents', 'brackets', 'applies_to', 'employee_ids', 'total_limit_cents',
        'authorization_ref', 'effective_from', 'verified', 'source_note',
    ];

    public function index(): Response
    {
        $rules = DeductionRule::query()->orderByRaw(
            "case code when 'sss' then 0 when 'philhealth' then 1 when 'pagibig' then 2 when 'withholding_tax' then 3 else 4 end"
        )->orderByDesc('effective_from')->get();

        return Inertia::render('Workforce/Deductions', [
            'rules' => $rules->map(fn (DeductionRule $r) => [
                ...$r->only(self::AUDITED),
                'id' => $r->id,
                'effective_from' => $r->effective_from->toDateString(),
                'history' => AuditLog::trailFor($r)->take(10)->values(),
            ]),
            'employees' => Employee::query()->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $values = $this->validated($request);

        DB::transaction(function () use ($values, $request) {
            $rule = DeductionRule::create($values);
            AuditLog::record($rule, 'created', null, $rule->only(self::AUDITED), $request->input('change_reason'));
        });

        return back()->with('success', 'Deduction rule added.');
    }

    public function update(Request $request, DeductionRule $rule): RedirectResponse
    {
        $values = $this->validated($request);

        DB::transaction(function () use ($rule, $values, $request) {
            $old = $rule->only(self::AUDITED);
            $rule->update($values);
            AuditLog::record($rule, 'updated', $old, $rule->only(self::AUDITED), $request->input('change_reason'));
        });

        return back()->with('success', 'Deduction rule saved. Draft payrolls use it after you recalculate them; finalized payrolls keep their snapshot.');
    }

    public function destroy(Request $request, DeductionRule $rule): RedirectResponse
    {
        $data = $request->validate(['change_reason' => ['required', 'string', 'min:3', 'max:500']]);
        AuditLog::record($rule, 'deleted', $rule->only(self::AUDITED), null, $data['change_reason']);
        $rule->delete();

        return back()->with('success', 'Deduction rule removed.');
    }

    /**
     * @return array<string, mixed>
     *
     * @throws ValidationException
     */
    private function validated(Request $request): array
    {
        $money = ['nullable', 'numeric', 'min:0', 'max:999999999.99', 'decimal:0,2'];
        $percent = ['nullable', 'numeric', 'min:0', 'max:100', 'decimal:0,4'];

        $data = $request->validate([
            'code' => ['required', Rule::in(DeductionRule::CODES)],
            'name' => ['required', 'string', 'max:100'],
            'enabled' => ['required', 'boolean'],
            'method' => ['required', Rule::in(DeductionRule::METHODS)],
            'basis' => ['required', Rule::in(DeductionRule::BASES)],
            'employee_rate' => $percent,
            'employer_rate' => $percent,
            'fixed_amount' => $money,
            'floor' => $money,
            'ceiling' => $money,
            'brackets' => ['nullable', 'array', 'max:40'],
            'brackets.*.min' => ['required', 'numeric', 'min:0'],
            'brackets.*.max' => ['nullable', 'numeric', 'gt:brackets.*.min'],
            'brackets.*.employee' => ['nullable', 'numeric', 'min:0'],
            'brackets.*.employer' => ['nullable', 'numeric', 'min:0'],
            'brackets.*.base' => ['nullable', 'numeric', 'min:0'],
            'brackets.*.rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'applies_to' => ['required', Rule::in(['all', 'selected'])],
            'employee_ids' => ['nullable', 'required_if:applies_to,selected', 'array'],
            'employee_ids.*' => ['integer', Rule::exists('employees', 'id')->where('merchant_id', $request->user()->merchant_id)],
            'total_limit' => $money,
            'authorization_ref' => ['nullable', 'string', 'max:255'],
            'effective_from' => ['required', 'date_format:Y-m-d'],
            'verified' => ['required', 'boolean'],
            'source_note' => ['nullable', 'string', 'max:2000'],
            'change_reason' => ['required', 'string', 'min:3', 'max:500'],
        ], [
            'change_reason.required' => 'Say why this deduction is being added or changed.',
            'employee_ids.required_if' => 'Choose the employees this deduction applies to.',
        ]);

        // Custom deductions (loans, cash advances…) must be documented and limited to the people they cover.
        if ($data['code'] === 'custom') {
            if (blank($data['authorization_ref'] ?? null)) {
                throw ValidationException::withMessages(['authorization_ref' => 'Custom deductions need the reference of the signed authorization (e.g. loan agreement no.).']);
            }
            if (! in_array($data['method'], ['fixed', 'percentage'], true)) {
                throw ValidationException::withMessages(['method' => 'Custom deductions use a fixed amount or a percentage of pay.']);
            }
        }

        $needs = [
            'fixed' => 'fixed_amount',
            'percentage' => 'employee_rate',
        ][$data['method']] ?? null;
        if ($needs && ! isset($data[$needs])) {
            throw ValidationException::withMessages([$needs => 'This calculation method needs a value here.']);
        }
        if (in_array($data['method'], ['bracket', 'tax_table'], true) && empty($data['brackets'])) {
            throw ValidationException::withMessages(['brackets' => 'Add at least one bracket.']);
        }

        $cents = fn ($v) => $v === null || $v === '' ? null : (int) round($v * 100);
        $bps = fn ($v) => $v === null || $v === '' ? null : (int) round($v * 100);

        return [
            'code' => $data['code'],
            'name' => $data['name'],
            'enabled' => $data['enabled'],
            'method' => $data['method'],
            'basis' => $data['basis'],
            'employee_rate_bps' => $bps($data['employee_rate'] ?? null),
            'employer_rate_bps' => $data['code'] === 'custom' ? null : $bps($data['employer_rate'] ?? null),
            'fixed_cents' => $cents($data['fixed_amount'] ?? null),
            'floor_cents' => $cents($data['floor'] ?? null),
            'ceiling_cents' => $cents($data['ceiling'] ?? null),
            'brackets' => in_array($data['method'], ['bracket', 'tax_table'], true)
                ? collect($data['brackets'])->sortBy('min')->map(fn ($b) => [
                    'min_cents' => $cents($b['min']),
                    'max_cents' => $cents($b['max'] ?? null),
                    'employee_cents' => $cents($b['employee'] ?? null),
                    'employer_cents' => $cents($b['employer'] ?? null),
                    'base_cents' => $cents($b['base'] ?? null),
                    'rate_bps' => $bps($b['rate'] ?? null),
                ])->values()->all()
                : null,
            'applies_to' => $data['applies_to'],
            'employee_ids' => $data['applies_to'] === 'selected' ? array_values(array_map('intval', $data['employee_ids'])) : null,
            'total_limit_cents' => $data['code'] === 'custom' ? $cents($data['total_limit'] ?? null) : null,
            'authorization_ref' => $data['authorization_ref'] ?? null,
            'effective_from' => $data['effective_from'],
            'verified' => $data['verified'],
            'source_note' => $data['source_note'] ?? null,
        ];
    }
}
