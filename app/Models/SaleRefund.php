<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use App\Models\Concerns\BelongsToUserBranch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Money given back for some or all of a sale's items. Its amounts are the
 * refunded share of the sale's own (subtotal, VAT exemption, discount,
 * service charge, VAT, total), so a sale's refunds always add up exactly.
 * Reports count it on the day it was made.
 */
class SaleRefund extends Model
{
    use BelongsToMerchant, BelongsToUserBranch;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'client_uuid',
        'method',
        'reason',
        'restocked',
        'subtotal_cents',
        'vat_exempt_cents',
        'discount_cents',
        'service_charge_cents',
        'tax_cents',
        'amount_cents',
        'refunded_at',
    ];

    protected function casts(): array
    {
        return [
            'restocked' => 'boolean',
            'subtotal_cents' => 'integer',
            'vat_exempt_cents' => 'integer',
            'discount_cents' => 'integer',
            'service_charge_cents' => 'integer',
            'tax_cents' => 'integer',
            'amount_cents' => 'integer',
            'refunded_at' => 'datetime',
        ];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleRefundItem::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
