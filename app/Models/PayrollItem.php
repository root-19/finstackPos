<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One employee's pay in a run. Always reached through its (merchant-scoped)
 * run or employee.
 */
class PayrollItem extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'employee_id',
        'merchant_id',
        'period_start',
        'period_end',
        'basic_cents',
        'earnings_cents',
        'gross_cents',
        'deductions_cents',
        'net_cents',
        'employer_cents',
        'breakdown',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'basic_cents' => 'integer',
            'earnings_cents' => 'integer',
            'gross_cents' => 'integer',
            'deductions_cents' => 'integer',
            'net_cents' => 'integer',
            'employer_cents' => 'integer',
            'breakdown' => 'array',
        ];
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(PayrollRun::class, 'payroll_run_id');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class)->withTrashed();
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PayrollItemLine::class)->orderBy('sort');
    }

    /**
     * Totals of a given line code (e.g. 'sss'), for the payroll table.
     */
    public function lineTotal(string $kind, string $code): int
    {
        return (int) $this->lines->where('kind', $kind)->where('code', $code)->sum('amount_cents');
    }
}
