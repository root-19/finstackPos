<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Pay for one period. draft → review → approved → paid; approved and paid
 * runs are final and never recalculated.
 */
class PayrollRun extends Model
{
    use BelongsToMerchant;

    public const DRAFT = 'draft';

    public const REVIEW = 'review';

    public const APPROVED = 'approved';

    public const PAID = 'paid';

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'period_start',
        'period_end',
        'pay_frequency',
        'status',
        'notes',
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
            'gross_cents' => 'integer',
            'deductions_cents' => 'integer',
            'net_cents' => 'integer',
            'employer_cents' => 'integer',
            'approved_at' => 'datetime',
            'paid_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(PayrollItem::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function isFinal(): bool
    {
        return in_array($this->status, [self::APPROVED, self::PAID], true);
    }

    public function isEditable(): bool
    {
        return in_array($this->status, [self::DRAFT, self::REVIEW], true);
    }

    public function refreshTotals(): void
    {
        $items = $this->items()->get();
        $this->forceFill([
            'gross_cents' => $items->sum('gross_cents'),
            'deductions_cents' => $items->sum('deductions_cents'),
            'net_cents' => $items->sum('net_cents'),
            'employer_cents' => $items->sum('employer_cents'),
        ])->save();
    }
}
