<?php

namespace App\Models;

use App\Enums\PaymentMethod;
use App\Models\Concerns\BelongsToMerchant;
use App\Models\Concerns\BelongsToUserBranch;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    use BelongsToMerchant, BelongsToUserBranch;

    public const COMPLETED = 'completed';

    /** Cancelled as a whole (same business day, before any refund). Left out of every total. */
    public const VOIDED = 'voided';

    /** Every item was given back. */
    public const REFUNDED = 'refunded';

    public const PARTIALLY_REFUNDED = 'partially_refunded';

    public const STATUSES = [self::COMPLETED, self::VOIDED, self::REFUNDED, self::PARTIALLY_REFUNDED];

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'client_uuid',
        'payment_method',
        'payment_reference',
        'subtotal_cents',
        'discount_type',
        'discount_id_number',
        'discount_customer_name',
        'discount_doh_check',
        'vat_exempt_cents',
        'discount_cents',
        'service_charge_cents',
        'tax_cents',
        'total_cents',
        'amount_paid_cents',
        'change_cents',
        'sold_at',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'payment_method' => PaymentMethod::class,
            'sold_at' => 'datetime',
            'voided_at' => 'datetime',
            'refunded_cents' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function refunds(): HasMany
    {
        return $this->hasMany(SaleRefund::class);
    }

    public function voidedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'voided_by');
    }

    public function voidApprovedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'void_approved_by');
    }

    /**
     * Sales that count in totals: everything but voided ones. Refunds are
     * taken off separately, on the day they were made (see SaleRefund).
     */
    public function scopeCounted(Builder $query): void
    {
        $query->where($query->qualifyColumn('status'), '!=', self::VOIDED);
    }

    public function isVoided(): bool
    {
        return $this->status === self::VOIDED;
    }

    /**
     * Everything Sales and the register's receipt lookup show about a sale:
     * its lines (with what can still be refunded), its status and refunds.
     *
     * @return array<string, mixed>
     */
    public function details(): array
    {
        $this->loadMissing(['user:id,name', 'branch:id,name', 'items', 'voidedBy:id,name', 'voidApprovedBy:id,name',
            'refunds' => fn ($q) => $q->with(['items', 'user:id,name', 'approver:id,name'])->oldest('refunded_at')]);
        $names = $this->items->pluck('name', 'id');

        return [
            'id' => $this->id,
            'reference' => $this->reference(),
            'sold_at' => $this->sold_at->toIso8601String(),
            'synced_at' => $this->created_at->toIso8601String(),
            'cashier' => $this->user?->name,
            'branch_id' => $this->branch_id,
            'branch' => $this->branch?->name,
            'payment_method' => $this->payment_method,
            'payment_reference' => $this->payment_reference,
            'subtotal_cents' => $this->subtotal_cents,
            'discount_type' => $this->discount_type,
            'discount_id_number' => $this->discount_id_number,
            'discount_customer_name' => $this->discount_customer_name,
            'discount_doh_check' => $this->discount_doh_check,
            'vat_exempt_cents' => $this->vat_exempt_cents,
            'discount_cents' => $this->discount_cents,
            'service_charge_cents' => $this->service_charge_cents,
            'tax_cents' => $this->tax_cents,
            'total_cents' => $this->total_cents,
            'amount_paid_cents' => $this->amount_paid_cents,
            'change_cents' => $this->change_cents,
            'status' => $this->status,
            'refunded_cents' => $this->refunded_cents,
            'voided_at' => $this->voided_at?->toIso8601String(),
            'voided_by' => $this->voidedBy?->name,
            'void_approved_by' => $this->voidApprovedBy?->name,
            'void_reason' => $this->void_reason,
            'items' => $this->items->map(fn (SaleItem $item) => [
                ...$item->only(['id', 'name', 'options', 'unit_price_cents', 'quantity', 'line_total_cents', 'refunded_quantity']),
                'refundable_quantity' => $item->refundableQuantity(),
            ])->values(),
            'refunds' => $this->refunds->map(fn (SaleRefund $r) => [
                'id' => $r->id,
                'refunded_at' => $r->refunded_at->toIso8601String(),
                'method' => $r->method,
                'reason' => $r->reason,
                'restocked' => $r->restocked,
                'subtotal_cents' => $r->subtotal_cents,
                'vat_exempt_cents' => $r->vat_exempt_cents,
                'discount_cents' => $r->discount_cents,
                'service_charge_cents' => $r->service_charge_cents,
                'tax_cents' => $r->tax_cents,
                'amount_cents' => $r->amount_cents,
                'by' => $r->user?->name,
                'approved_by' => $r->approver?->name,
                'items' => $r->items->map(fn (SaleRefundItem $i) => [
                    'name' => $names[$i->sale_item_id] ?? 'Item',
                    'quantity' => $i->quantity,
                    'amount_cents' => $i->amount_cents,
                ])->values(),
            ])->values(),
        ];
    }

    /**
     * Short reference printed on the device's confirmation screen.
     */
    public function reference(): string
    {
        return strtoupper(substr($this->client_uuid, 0, 8));
    }
}
