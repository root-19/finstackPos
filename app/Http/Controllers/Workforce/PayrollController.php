<?php

namespace App\Http\Controllers\Workforce;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Employee;
use App\Models\PayrollItem;
use App\Models\PayrollItemLine;
use App\Models\PayrollRun;
use App\Models\SalaryRate;
use App\Services\Payroll\PayrollService;
use Illuminate\Http\RedirectResponse;
use App\Support\Csv;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Payroll runs, payslips, and exports. Owner only (Permission::PayrollManage).
 */
class PayrollController extends Controller
{
    public function __construct(private readonly PayrollService $payroll) {}

    public function index(): Response
    {
        return Inertia::render('Workforce/Payroll', [
            'runs' => PayrollRun::query()->withCount('items')->latest('period_start')->latest('id')->get()->map(fn (PayrollRun $r) => [
                'id' => $r->id,
                'period_start' => $r->period_start->toDateString(),
                'period_end' => $r->period_end->toDateString(),
                'pay_frequency' => $r->pay_frequency,
                'status' => $r->status,
                'items_count' => $r->items_count,
                'gross_cents' => $r->gross_cents,
                'deductions_cents' => $r->deductions_cents,
                'net_cents' => $r->net_cents,
                'employer_cents' => $r->employer_cents,
            ]),
            'employees' => Employee::query()
                ->with('salaryRates')
                ->where('status', 'active')
                ->orderBy('name')
                ->get()
                ->map(fn (Employee $e) => [
                    'id' => $e->id,
                    'name' => $e->name,
                    'pay_frequency' => $e->salaryRates->first()?->pay_frequency,
                    'has_salary' => $e->salaryRates->isNotEmpty(),
                ]),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'period_start' => ['required', 'date_format:Y-m-d'],
            'period_end' => ['required', 'date_format:Y-m-d', 'after_or_equal:period_start'],
            'pay_frequency' => ['required', Rule::in(SalaryRate::FREQUENCIES)],
            'employee_ids' => ['required', 'array', 'min:1'],
            'employee_ids.*' => ['integer', Rule::exists('employees', 'id')->where('merchant_id', $request->user()->merchant_id)->whereNull('deleted_at')],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $start = Carbon::parse($data['period_start']);
        $end = Carbon::parse($data['period_end']);
        abort_if($start->diffInDays($end) > 31, 422, 'A payroll period can be at most 31 days.');

        ['run' => $run, 'skipped' => $skipped] = $this->payroll->create($start, $end, $data['pay_frequency'], $data['employee_ids'], $data['notes'] ?? null);

        return redirect()->route('payroll.show', $run)->with(
            'success',
            $skipped ? 'Payroll created. Skipped: '.implode(' ', $skipped) : 'Payroll created as a draft.',
        );
    }

    public function show(PayrollRun $run): Response
    {
        $run->load(['items.employee', 'items.lines', 'approver:id,name']);

        return Inertia::render('Workforce/PayrollShow', [
            'run' => [
                'id' => $run->id,
                'period_start' => $run->period_start->toDateString(),
                'period_end' => $run->period_end->toDateString(),
                'pay_frequency' => $run->pay_frequency,
                'status' => $run->status,
                'notes' => $run->notes,
                'gross_cents' => $run->gross_cents,
                'deductions_cents' => $run->deductions_cents,
                'net_cents' => $run->net_cents,
                'employer_cents' => $run->employer_cents,
                'approved_by' => $run->approver?->name,
                'approved_at' => $run->approved_at?->toIso8601String(),
                'paid_at' => $run->paid_at?->toIso8601String(),
            ],
            'items' => $run->items->sortBy(fn ($i) => $i->employee->name)->values()->map(fn (PayrollItem $i) => self::presentItem($i)),
            'history' => AuditLog::trailFor($run),
        ]);
    }

    public function recalculate(PayrollRun $run): RedirectResponse
    {
        $this->payroll->recalculate($run);

        return back()->with('success', 'Payroll recalculated from current attendance, salaries, and deduction rules.');
    }

    public function transition(Request $request, PayrollRun $run): RedirectResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in([PayrollRun::DRAFT, PayrollRun::REVIEW, PayrollRun::APPROVED, PayrollRun::PAID])]]);
        $this->payroll->transition($run, $data['status']);

        return back()->with('success', match ($data['status']) {
            PayrollRun::REVIEW => 'Submitted for review.',
            PayrollRun::DRAFT => 'Returned to draft.',
            PayrollRun::APPROVED => 'Payroll approved. It is now final.',
            PayrollRun::PAID => 'Payroll marked as paid.',
        });
    }

    public function destroy(PayrollRun $run): RedirectResponse
    {
        $this->payroll->delete($run);

        return redirect()->route('payroll.index')->with('success', 'Draft payroll deleted.');
    }

    public function addEarning(Request $request, PayrollRun $run, PayrollItem $item): RedirectResponse
    {
        abort_unless($item->payroll_run_id === $run->id, 404);
        $data = $request->validate([
            'code' => ['required', Rule::in(['bonus', 'commission', 'other_earning'])],
            'label' => ['required', 'string', 'max:120'],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:99999999.99', 'decimal:0,2'],
        ]);
        $this->payroll->addEarning($item, $data['code'], $data['label'], (int) round($data['amount'] * 100));

        return back()->with('success', "{$data['label']} added.");
    }

    public function removeEarning(PayrollRun $run, PayrollItemLine $line): RedirectResponse
    {
        abort_unless($line->item->payroll_run_id === $run->id, 404);
        $this->payroll->removeEarning($line);

        return back()->with('success', 'Earning removed.');
    }

    /**
     * The payroll register as CSV (opens in Excel or Google Sheets).
     */
    public function export(PayrollRun $run): StreamedResponse
    {
        $run->load(['items.employee', 'items.lines']);
        $filename = "payroll-{$run->period_start->toDateString()}-to-{$run->period_end->toDateString()}.csv";

        return response()->streamDownload(function () use ($run) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Employee', 'Period', 'Status', 'Basic pay', 'Other earnings', 'Gross pay', 'SSS', 'PhilHealth', 'Pag-IBIG', 'Withholding tax', 'Other deductions', 'Total deductions', 'Net pay', 'Employer contributions']);
            $peso = fn (int $cents) => number_format($cents / 100, 2, '.', '');

            foreach ($run->items->sortBy(fn ($i) => $i->employee->name) as $item) {
                $row = self::presentItem($item);
                fputcsv($out, Csv::row([
                    $row['employee'], "{$run->period_start->toDateString()} to {$run->period_end->toDateString()}", $run->status,
                    $peso($row['basic_cents']), $peso($row['earnings_cents']), $peso($row['gross_cents']),
                    $peso($row['sss_cents']), $peso($row['philhealth_cents']), $peso($row['pagibig_cents']), $peso($row['tax_cents']),
                    $peso($row['other_deductions_cents']), $peso($row['deductions_cents']), $peso($row['net_cents']), $peso($row['employer_cents']),
                ]));
            }
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv']);
    }

    /**
     * @return array<string, mixed>
     */
    public static function presentItem(PayrollItem $item): array
    {
        $sss = $item->lineTotal(PayrollItemLine::DEDUCTION, 'sss');
        $philhealth = $item->lineTotal(PayrollItemLine::DEDUCTION, 'philhealth');
        $pagibig = $item->lineTotal(PayrollItemLine::DEDUCTION, 'pagibig');
        $tax = $item->lineTotal(PayrollItemLine::DEDUCTION, 'withholding_tax');

        return [
            'id' => $item->id,
            'employee_id' => $item->employee_id,
            'employee' => $item->employee->name,
            'position' => $item->employee->position,
            'period_start' => $item->period_start->toDateString(),
            'period_end' => $item->period_end->toDateString(),
            'basic_cents' => $item->basic_cents,
            'earnings_cents' => $item->earnings_cents,
            'gross_cents' => $item->gross_cents,
            'sss_cents' => $sss,
            'philhealth_cents' => $philhealth,
            'pagibig_cents' => $pagibig,
            'tax_cents' => $tax,
            'other_deductions_cents' => $item->deductions_cents - $sss - $philhealth - $pagibig - $tax,
            'deductions_cents' => $item->deductions_cents,
            'net_cents' => $item->net_cents,
            'employer_cents' => $item->employer_cents,
            'lines' => $item->lines->map->only(['id', 'kind', 'code', 'label', 'amount_cents', 'detail', 'manual'])->values(),
            'breakdown' => $item->breakdown,
        ];
    }
}
