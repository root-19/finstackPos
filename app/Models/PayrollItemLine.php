<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One earning, employee deduction, or employer contribution on a payslip.
 * Employer contributions are shown for transparency but never reduce net pay.
 */
class PayrollItemLine extends Model
{
    public const EARNING = 'earning';

    public const DEDUCTION = 'deduction';

    public const EMPLOYER = 'employer';

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'kind',
        'code',
        'label',
        'amount_cents',
        'detail',
        'manual',
        'deduction_rule_id',
        'sort',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'amount_cents' => 'integer',
            'manual' => 'boolean',
            'sort' => 'integer',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(PayrollItem::class, 'payroll_item_id');
    }
}
