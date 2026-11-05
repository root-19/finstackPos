<?php

namespace App\Services\Payroll;

use App\Models\AuditLog;
use App\Models\Employee;
use App\Models\PayrollItem;
use App\Models\PayrollItemLine;
use App\Models\PayrollRun;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Creates and moves payroll runs through draft → review → approved → paid.
 * Approved and paid runs are final: never recalculated, never edited.
 */
class PayrollService
{
    /** Allowed status changes. */
    public const TRANSITIONS = [
        PayrollRun::DRAFT => [PayrollRun::REVIEW],
        PayrollRun::REVIEW => [PayrollRun::DRAFT, PayrollRun::APPROVED],
        PayrollRun::APPROVED => [PayrollRun::PAID],
        PayrollRun::PAID => [],
    ];

    public function __construct(private readonly PayrollCalculator $calculator) {}

    /**
     * @param  list<int>  $employeeIds
     * @return array{run: PayrollRun, skipped: list<string>}
     *
     * @throws ValidationException
     */
    public function create(Carbon $start, Carbon $end, string $frequency, array $employeeIds, ?string $notes = null): array
    {
        $employees = Employee::query()->whereKey($employeeIds)->orderBy('name')->get();

        // One pay per employee per period: no overlapping runs, whatever their status.
        $clashes = PayrollItem::query()
            ->with('employee:id,name')
            ->whereIn('employee_id', $employees->modelKeys())
            ->whereDate('period_start', '<=', $end->toDateString())
            ->whereDate('period_end', '>=', $start->toDateString())
            ->get();

        if ($clashes->isNotEmpty()) {
            throw ValidationException::withMessages([
                'employee_ids' => 'Already paid or in another payroll for an overlapping period: '
                    .$clashes->map(fn ($i) => "{$i->employee->name} ({$i->period_start->toDateString()} – {$i->period_end->toDateString()})")->implode(', ').'.',
            ]);
        }

        return DB::transaction(function () use ($employees, $start, $end, $frequency, $notes) {
            $run = new PayrollRun([
                'period_start' => $start->toDateString(),
                'period_end' => $end->toDateString(),
                'pay_frequency' => $frequency,
                'status' => PayrollRun::DRAFT,
                'notes' => $notes,
            ]);
            $run->created_by = Auth::id();
            $run->save();

            $skipped = [];
            foreach ($employees as $employee) {
                $result = $this->calculator->calculate($employee, $start, $end, $frequency);
                if (! $result['ok']) {
                    $skipped[] = $result['error'];

                    continue;
                }
                $this->storeItem($run, $employee, $result);
            }

            if ($run->items()->doesntExist()) {
                throw ValidationException::withMessages([
                    'employee_ids' => 'No one could be paid: '.implode(' ', $skipped),
                ]);
            }

            $run->refreshTotals();
            AuditLog::record($run, 'created', null, ['period' => "{$start->toDateString()} – {$end->toDateString()}", 'frequency' => $frequency]);

            return ['run' => $run, 'skipped' => $skipped];
        });
    }

    /**
     * Recompute every item from current attendance, salaries, and rules,
     * keeping manually added earnings. Only while the run is editable.
     */
    public function recalculate(PayrollRun $run): void
    {
        $this->ensureEditable($run);

        DB::transaction(function () use ($run) {
            foreach ($run->items()->with(['employee', 'lines'])->get() as $item) {
                $this->recalculateItem($run, $item);
            }
            $run->refreshTotals();
        });
    }

    /**
     * Add a bonus, commission, or other earning to one payslip.
     */
    public function addEarning(PayrollItem $item, string $code, string $label, int $amountCents): void
    {
        $run = $item->run;
        $this->ensureEditable($run);

        DB::transaction(function () use ($run, $item, $code, $label, $amountCents) {
            $item->lines()->create([
                'kind' => PayrollItemLine::EARNING, 'code' => $code, 'label' => $label,
                'amount_cents' => $amountCents, 'manual' => true, 'sort' => 0,
            ]);
            $this->recalculateItem($run, $item->fresh(['employee', 'lines']));
            $run->refreshTotals();
            AuditLog::record($item, 'earning_added', null, ['label' => $label, 'amount_cents' => $amountCents]);
        });
    }

    public function removeEarning(PayrollItemLine $line): void
    {
        $item = $line->item;
        $run = $item->run;
        $this->ensureEditable($run);
        abort_unless($line->manual, 422, 'Only earnings added on this payroll can be removed.');

        DB::transaction(function () use ($run, $item, $line) {
            AuditLog::record($item, 'earning_removed', ['label' => $line->label, 'amount_cents' => $line->amount_cents]);
            $line->delete();
            $this->recalculateItem($run, $item->fresh(['employee', 'lines']));
            $run->refreshTotals();
        });
    }

    /**
     * @throws ValidationException
     */
    public function transition(PayrollRun $run, string $to): void
    {
        if (! in_array($to, self::TRANSITIONS[$run->status] ?? [], true)) {
            throw ValidationException::withMessages(['status' => "A {$run->status} payroll cannot be moved to {$to}."]);
        }

        if ($to === PayrollRun::REVIEW && $run->items()->where('net_cents', '<', 0)->exists()) {
            throw ValidationException::withMessages(['status' => 'Some payslips have deductions larger than gross pay. Fix them before submitting.']);
        }

        DB::transaction(function () use ($run, $to) {
            $from = $run->status;
            $run->status = $to;
            if ($to === PayrollRun::APPROVED) {
                $run->approved_by = Auth::id();
                $run->approved_at = now();
            }
            if ($to === PayrollRun::PAID) {
                $run->paid_at = now();
            }
            $run->save();
            AuditLog::record($run, 'status', ['status' => $from], ['status' => $to]);
        });
    }

    public function delete(PayrollRun $run): void
    {
        abort_unless($run->status === PayrollRun::DRAFT, 422, 'Only draft payrolls can be deleted.');

        DB::transaction(function () use ($run) {
            AuditLog::record($run, 'deleted', ['period' => "{$run->period_start->toDateString()} – {$run->period_end->toDateString()}"]);
            $run->delete();
        });
    }

    private function recalculateItem(PayrollRun $run, PayrollItem $item): void
    {
        $manual = $item->lines->where('manual', true)
            ->map(fn ($l) => ['code' => $l->code, 'label' => $l->label, 'amount_cents' => $l->amount_cents])
            ->values()->all();

        $result = $this->calculator->calculate($item->employee, $run->period_start, $run->period_end, $run->pay_frequency, $manual);

        if (! $result['ok']) {
            throw ValidationException::withMessages(['status' => $result['error']]);
        }

        $item->lines()->delete();
        $this->fillItem($item, $result);
    }

    /**
     * @param  array<string, mixed>  $result
     */
    private function storeItem(PayrollRun $run, Employee $employee, array $result): void
    {
        $item = new PayrollItem([
            'employee_id' => $employee->id,
            'merchant_id' => $run->merchant_id,
            'period_start' => $run->period_start->toDateString(),
            'period_end' => $run->period_end->toDateString(),
            'breakdown' => [],
        ]);
        $item->run()->associate($run);
        $this->fillItem($item, $result);
    }

    /**
     * @param  array<string, mixed>  $result
     */
    private function fillItem(PayrollItem $item, array $result): void
    {
        $item->fill([
            'basic_cents' => $result['basic'],
            'earnings_cents' => $result['earnings'],
            'gross_cents' => $result['gross'],
            'deductions_cents' => $result['deductions'],
            'net_cents' => $result['net'],
            'employer_cents' => $result['employer'],
            'breakdown' => $result['breakdown'],
        ])->save();

        $item->lines()->createMany($result['lines']);
    }

    /**
     * @throws ValidationException
     */
    private function ensureEditable(PayrollRun $run): void
    {
        if (! $run->isEditable()) {
            throw ValidationException::withMessages(['status' => 'This payroll is final and can no longer change.']);
        }
    }
}
