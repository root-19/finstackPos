<?php

namespace App\Services\Payroll;

use App\Models\AttendanceRecord;
use App\Models\DeductionRule;
use App\Models\Employee;
use App\Models\PayrollItemLine;
use App\Models\PayrollRun;
use App\Models\SalaryRate;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Computes one employee's pay for a period from approved attendance, the
 * salary in force at the period end, and the store's enabled deduction
 * rules. All money is integer centavos; every line explains its maths.
 *
 * Employer contributions are returned separately and never reduce net pay.
 */
class PayrollCalculator
{
    /** Working days per year used to turn a monthly rate into a daily one. */
    public const DAYS_PER_YEAR = 261;

    public const HOURS_PER_DAY = 8;

    /**
     * Per-period share of a monthly amount, as [numerator, denominator].
     */
    public const PERIOD_SHARE = [
        'weekly' => [12, 52],
        'semi_monthly' => [1, 2],
        'monthly' => [1, 1],
    ];

    private const FREQUENCY_LABEL = ['weekly' => 'weekly', 'semi_monthly' => 'semi-monthly', 'monthly' => 'monthly'];

    /**
     * @param  list<array{code: string, label: string, amount_cents: int}>  $manualEarnings
     * @return array{ok: bool, error?: string, basic: int, earnings: int, gross: int, deductions: int, net: int, employer: int, lines: list<array<string, mixed>>, breakdown: array<string, mixed>}
     */
    public function calculate(Employee $employee, Carbon $start, Carbon $end, string $frequency, array $manualEarnings = []): array
    {
        $salary = $employee->salaryOn($end);

        if ($salary === null) {
            return $this->failure("{$employee->name} has no salary in force on {$end->toDateString()}.");
        }

        [$num, $den] = self::PERIOD_SHARE[$frequency];
        $warnings = [];

        if ($salary->pay_frequency !== $frequency) {
            $warnings[] = "Salary is set to {$this->frequencyLabel($salary->pay_frequency)} pay, but this run is {$this->frequencyLabel($frequency)}.";
        }

        $attendance = $this->attendance($employee, $start, $end);
        $rates = $this->rates($salary);
        $money = fn (int $cents) => '₱'.number_format($cents / 100, 2);
        $lines = [];
        $sort = 0;
        $add = function (string $kind, string $code, string $label, int $amount, string $detail, bool $manual = false, ?int $ruleId = null) use (&$lines, &$sort) {
            if ($amount > 0 || $manual) {
                $lines[] = [
                    'kind' => $kind, 'code' => $code, 'label' => $label, 'amount_cents' => $amount,
                    'detail' => $detail, 'manual' => $manual, 'deduction_rule_id' => $ruleId, 'sort' => $sort++,
                ];
            }
        };

        // Basic pay
        $basic = match ($salary->pay_type) {
            'monthly' => self::div($salary->rate_cents * $num, $den),
            'daily' => $attendance['days_worked'] * $rates['daily'],
            'hourly' => self::div($attendance['regular_minutes'] * $rates['hourly'], 60),
        };
        $basicDetail = match ($salary->pay_type) {
            'monthly' => "{$money($salary->rate_cents)} monthly × {$num}/{$den} for a {$this->frequencyLabel($frequency)} period",
            'daily' => "{$attendance['days_worked']} day(s) worked × {$money($rates['daily'])} daily rate",
            'hourly' => self::hours($attendance['regular_minutes'])." regular hours × {$money($rates['hourly'])} per hour",
        };
        $add(PayrollItemLine::EARNING, 'basic', 'Basic pay', $basic, $basicDetail);

        // Overtime
        $overtime = self::div($attendance['overtime_minutes'] * $rates['hourly'] * $salary->overtime_rate_bps, 60 * 10000);
        $add(
            PayrollItemLine::EARNING, 'overtime', 'Overtime',
            $overtime,
            self::hours($attendance['overtime_minutes'])." OT hours × {$money($rates['hourly'])} × ".($salary->overtime_rate_bps / 100).'%'
        );

        if ($salary->allowance_cents > 0) {
            $add(PayrollItemLine::EARNING, 'allowance', 'Allowance', $salary->allowance_cents, 'Fixed allowance per pay period');
        }

        $manualTotal = 0;
        foreach ($manualEarnings as $earning) {
            $manualTotal += $earning['amount_cents'];
            $add(PayrollItemLine::EARNING, $earning['code'], $earning['label'], $earning['amount_cents'], 'Added on this payroll', true);
        }

        $gross = $basic + $overtime + $salary->allowance_cents + $manualTotal;

        // Attendance deductions: unpaid absences and tardiness (monthly and daily pay).
        $absences = $salary->pay_type === 'monthly' ? $attendance['absences'] * $rates['daily'] : 0;
        $add(PayrollItemLine::DEDUCTION, 'absences', 'Absences', $absences, "{$attendance['absences']} day(s) × {$money($rates['daily'])} daily rate");

        $tardiness = $salary->pay_type === 'hourly' ? 0 : self::div($attendance['late_minutes'] * $rates['hourly'], 60);
        $add(PayrollItemLine::DEDUCTION, 'tardiness', 'Tardiness', $tardiness, "{$attendance['late_minutes']} minute(s) late × {$money($rates['hourly'])} per hour");

        $earned = max(0, $gross - $absences - $tardiness);
        // Monthly equivalents, for monthly-based contribution tables.
        $monthlyGross = self::div($earned * $den, $num);
        $monthlyBasic = $rates['monthly'];

        $rules = $this->rulesFor($employee, $end);
        $employerTotal = 0;
        $statutoryMonthly = 0;
        $statutoryTotal = 0;
        $ruleSnapshots = [];

        foreach (DeductionRule::STATUTORY as $code) {
            $rule = $rules['statutory'][$code] ?? null;
            if (! $rule) {
                continue;
            }

            $basis = $rule->basis === 'period_gross' ? $earned : ($rule->basis === 'monthly_basic' ? $monthlyBasic : $monthlyGross);
            [$eeMonthly, $erMonthly, $how] = $this->apply($rule, $basis, $money);
            $prorate = $rule->basis !== 'period_gross';
            $ee = $prorate ? self::div($eeMonthly * $num, $den) : $eeMonthly;
            $er = $prorate ? self::div($erMonthly * $num, $den) : $erMonthly;
            $share = $prorate && $num !== $den ? " × {$num}/{$den} for this period" : '';

            $statutoryMonthly += $prorate ? $eeMonthly : self::div($eeMonthly * $den, $num);
            $statutoryTotal += $ee;
            $employerTotal += $er;
            $add(PayrollItemLine::DEDUCTION, $code, $rule->name, $ee, "Employee share: {$how}{$share}", false, $rule->id);
            $add(PayrollItemLine::EMPLOYER, $code, "{$rule->name} (employer)", $er, 'Employer share; does not reduce take-home pay', false, $rule->id);
            $ruleSnapshots[] = $this->snapshot($rule, $basis);
            $this->warnIfUnverified($rule, $warnings);
        }

        // Withholding tax on monthly taxable pay (earned pay less mandatory contributions).
        $taxableMonthly = max(0, $monthlyGross - $statutoryMonthly);
        $tax = 0;
        if ($rule = $rules['statutory']['withholding_tax'] ?? null) {
            $basis = $rule->basis === 'period_gross' ? $earned : $taxableMonthly;
            [$taxMonthly, , $how] = $this->apply($rule, $basis, $money);
            $tax = $rule->basis === 'period_gross' ? $taxMonthly : self::div($taxMonthly * $num, $den);
            $share = $rule->basis !== 'period_gross' && $num !== $den ? " × {$num}/{$den} for this period" : '';
            $add(PayrollItemLine::DEDUCTION, 'withholding_tax', $rule->name, $tax, "Taxable {$money($basis)}: {$how}{$share}", false, $rule->id);
            $ruleSnapshots[] = $this->snapshot($rule, $basis);
            $this->warnIfUnverified($rule, $warnings);
        }

        // Documented custom deductions (loans, cash advances), capped by their balance.
        $customTotal = 0;
        foreach ($rules['custom'] as $rule) {
            $amount = $rule->method === 'percentage'
                ? self::div($earned * (int) $rule->employee_rate_bps, 10000)
                : (int) $rule->fixed_cents;
            $detail = $rule->method === 'percentage'
                ? ($rule->employee_rate_bps / 100)."% of {$money($earned)}"
                : "{$money((int) $rule->fixed_cents)} per pay period";

            if ($rule->total_limit_cents !== null) {
                $remaining = max(0, $rule->total_limit_cents - $this->alreadyDeducted($rule, $employee));
                if ($amount > $remaining) {
                    $amount = $remaining;
                    $detail .= ", capped at the {$money($remaining)} remaining balance";
                }
            }
            if ($rule->authorization_ref) {
                $detail .= " (ref: {$rule->authorization_ref})";
            }

            $customTotal += $amount;
            $add(PayrollItemLine::DEDUCTION, 'custom', $rule->name, $amount, $detail, false, $rule->id);
            $ruleSnapshots[] = $this->snapshot($rule, $earned);
        }

        $deductions = $absences + $tardiness + $statutoryTotal + $tax + $customTotal;
        $net = $gross - $deductions;

        if ($net < 0) {
            $warnings[] = 'Deductions are larger than gross pay. Review the deductions before submitting.';
        }

        return [
            'ok' => true,
            'basic' => $basic,
            'earnings' => $gross - $basic,
            'gross' => $gross,
            'deductions' => $deductions,
            'net' => $net,
            'employer' => $employerTotal,
            'lines' => $lines,
            'breakdown' => [
                'period' => ['start' => $start->toDateString(), 'end' => $end->toDateString(), 'frequency' => $frequency, 'share' => [$num, $den]],
                'salary' => [
                    'pay_type' => $salary->pay_type,
                    'rate_cents' => $salary->rate_cents,
                    'pay_frequency' => $salary->pay_frequency,
                    'allowance_cents' => $salary->allowance_cents,
                    'overtime_rate_bps' => $salary->overtime_rate_bps,
                    'effective_from' => $salary->effective_from->toDateString(),
                ],
                'rates' => $rates,
                'attendance' => $attendance,
                'bases' => [
                    'earned_cents' => $earned,
                    'monthly_gross_cents' => $monthlyGross,
                    'monthly_basic_cents' => $monthlyBasic,
                    'taxable_monthly_cents' => $taxableMonthly,
                ],
                'constants' => ['days_per_year' => self::DAYS_PER_YEAR, 'hours_per_day' => self::HOURS_PER_DAY],
                'rules' => $ruleSnapshots,
                'warnings' => $warnings,
            ],
        ];
    }

    /**
     * Approved attendance in the period, summed.
     *
     * @return array{days_worked: int, regular_minutes: int, overtime_minutes: int, late_minutes: int, absences: int, records: int}
     */
    private function attendance(Employee $employee, Carbon $start, Carbon $end): array
    {
        $records = AttendanceRecord::query()
            ->with('shift')
            ->where('employee_id', $employee->id)
            ->where('status', AttendanceRecord::APPROVED)
            ->whereDate('work_date', '>=', $start->toDateString())
            ->whereDate('work_date', '<=', $end->toDateString())
            ->get();

        $worked = $records->where('type', 'worked');
        $totals = ['regular' => 0, 'overtime' => 0, 'late' => 0];
        foreach ($worked as $record) {
            $m = $record->minutes();
            $totals['regular'] += $m['regular'];
            $totals['overtime'] += $m['overtime'];
            $totals['late'] += $m['late'];
        }

        return [
            'days_worked' => $worked->filter(fn ($r) => $r->minutes()['worked'] > 0)->map(fn ($r) => $r->work_date->toDateString())->unique()->count(),
            'regular_minutes' => $totals['regular'],
            'overtime_minutes' => $totals['overtime'],
            'late_minutes' => $totals['late'],
            'absences' => $records->where('type', 'absent')->map(fn ($r) => $r->work_date->toDateString())->unique()->count(),
            'records' => $records->count(),
        ];
    }

    /**
     * @return array{daily: int, hourly: int, monthly: int}
     */
    private function rates(SalaryRate $salary): array
    {
        return match ($salary->pay_type) {
            'monthly' => [
                'daily' => $daily = self::div($salary->rate_cents * 12, self::DAYS_PER_YEAR),
                'hourly' => self::div($daily, self::HOURS_PER_DAY),
                'monthly' => $salary->rate_cents,
            ],
            'daily' => [
                'daily' => $salary->rate_cents,
                'hourly' => self::div($salary->rate_cents, self::HOURS_PER_DAY),
                'monthly' => self::div($salary->rate_cents * self::DAYS_PER_YEAR, 12),
            ],
            'hourly' => [
                'daily' => $salary->rate_cents * self::HOURS_PER_DAY,
                'hourly' => $salary->rate_cents,
                'monthly' => self::div($salary->rate_cents * self::HOURS_PER_DAY * self::DAYS_PER_YEAR, 12),
            ],
        };
    }

    /**
     * The newest enabled rule per statutory code (in force at the period
     * end) and every enabled custom rule, limited to this employee.
     *
     * @return array{statutory: array<string, DeductionRule>, custom: Collection<int, DeductionRule>}
     */
    private function rulesFor(Employee $employee, Carbon $end): array
    {
        $rules = DeductionRule::query()
            ->where('enabled', true)
            ->whereDate('effective_from', '<=', $end->toDateString())
            ->orderByDesc('effective_from')
            ->orderByDesc('id')
            ->get();

        $statutory = [];
        foreach ([...DeductionRule::STATUTORY, 'withholding_tax'] as $code) {
            $rule = $rules->firstWhere('code', $code);
            if ($rule && $rule->appliesTo($employee)) {
                $statutory[$code] = $rule;
            }
        }

        return [
            'statutory' => $statutory,
            'custom' => $rules->where('code', 'custom')->filter(fn ($r) => $r->appliesTo($employee))->values(),
        ];
    }

    /**
     * Employee and employer amounts for a basis, with an explanation.
     *
     * @return array{0: int, 1: int, 2: string}
     */
    private function apply(DeductionRule $rule, int $basis, callable $money): array
    {
        switch ($rule->method) {
            case 'percentage':
                $base = $basis;
                $clamp = '';
                if ($rule->floor_cents !== null && $base < $rule->floor_cents) {
                    $base = $rule->floor_cents;
                    $clamp = " (raised to the {$money($rule->floor_cents)} floor)";
                }
                if ($rule->ceiling_cents !== null && $base > $rule->ceiling_cents) {
                    $base = $rule->ceiling_cents;
                    $clamp = " (capped at the {$money($rule->ceiling_cents)} ceiling)";
                }
                $ee = self::div($base * (int) $rule->employee_rate_bps, 10000);
                $er = self::div($base * (int) $rule->employer_rate_bps, 10000);

                return [$ee, $er, ($rule->employee_rate_bps / 100)."% of {$money($base)}{$clamp}"];

            case 'bracket':
                $bracket = $this->bracket($rule, $basis);

                return [
                    (int) ($bracket['employee_cents'] ?? 0),
                    (int) ($bracket['employer_cents'] ?? 0),
                    $bracket ? "bracket {$money((int) $bracket['min_cents'])}–".($bracket['max_cents'] === null ? 'up' : $money((int) $bracket['max_cents']))." for {$money($basis)}" : "no bracket for {$money($basis)}",
                ];

            case 'tax_table':
                $bracket = $this->bracket($rule, $basis);
                if (! $bracket) {
                    return [0, 0, 'no bracket'];
                }
                $tax = (int) $bracket['base_cents'] + self::div(($basis - (int) $bracket['min_cents']) * (int) $bracket['rate_bps'], 10000);

                return [$tax, 0, "{$money((int) $bracket['base_cents'])} + ".($bracket['rate_bps'] / 100)."% over {$money((int) $bracket['min_cents'])}"];

            default: // fixed
                return [(int) $rule->fixed_cents, 0, "fixed {$money((int) $rule->fixed_cents)} per month"];
        }
    }

    /**
     * @return array<string, int|null>|null
     */
    private function bracket(DeductionRule $rule, int $value): ?array
    {
        foreach ($rule->brackets ?? [] as $bracket) {
            $min = (int) $bracket['min_cents'];
            $max = $bracket['max_cents'] === null ? null : (int) $bracket['max_cents'];
            if ($value >= $min && ($max === null || $value < $max)) {
                return $bracket;
            }
        }

        return null;
    }

    private function alreadyDeducted(DeductionRule $rule, Employee $employee): int
    {
        return (int) PayrollItemLine::query()
            ->where('deduction_rule_id', $rule->id)
            ->where('kind', PayrollItemLine::DEDUCTION)
            ->whereHas('item', fn ($q) => $q
                ->where('employee_id', $employee->id)
                ->whereHas('run', fn ($r) => $r->whereIn('status', [PayrollRun::APPROVED, PayrollRun::PAID])))
            ->sum('amount_cents');
    }

    /**
     * @return array<string, mixed>
     */
    private function snapshot(DeductionRule $rule, int $basis): array
    {
        return [
            'id' => $rule->id,
            'code' => $rule->code,
            'name' => $rule->name,
            'method' => $rule->method,
            'basis' => $rule->basis,
            'basis_value_cents' => $basis,
            'employee_rate_bps' => $rule->employee_rate_bps,
            'employer_rate_bps' => $rule->employer_rate_bps,
            'fixed_cents' => $rule->fixed_cents,
            'floor_cents' => $rule->floor_cents,
            'ceiling_cents' => $rule->ceiling_cents,
            'brackets' => $rule->brackets,
            'effective_from' => $rule->effective_from->toDateString(),
            'verified' => $rule->verified,
        ];
    }

    /**
     * @param  list<string>  $warnings
     */
    private function warnIfUnverified(DeductionRule $rule, array &$warnings): void
    {
        if (! $rule->verified) {
            $warnings[] = "“{$rule->name}” uses rates that have not been marked verified.";
        }
    }

    /**
     * @return array{ok: false, error: string, basic: 0, earnings: 0, gross: 0, deductions: 0, net: 0, employer: 0, lines: array{}, breakdown: array{}}
     */
    private function failure(string $error): array
    {
        return ['ok' => false, 'error' => $error, 'basic' => 0, 'earnings' => 0, 'gross' => 0, 'deductions' => 0, 'net' => 0, 'employer' => 0, 'lines' => [], 'breakdown' => []];
    }

    private function frequencyLabel(string $frequency): string
    {
        return self::FREQUENCY_LABEL[$frequency] ?? $frequency;
    }

    /** Integer division rounded half up (all inputs are non-negative centavos). */
    public static function div(int $numerator, int $denominator): int
    {
        return intdiv(2 * $numerator + $denominator, 2 * $denominator);
    }

    private static function hours(int $minutes): string
    {
        return rtrim(rtrim(number_format($minutes / 60, 2), '0'), '.');
    }
}
