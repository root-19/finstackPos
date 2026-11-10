<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One sale line (and how many of it) in a refund. Reached through its refund, which is scoped. */
class SaleRefundItem extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'sale_item_id',
        'quantity',
        'amount_cents',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'amount_cents' => 'integer',
        ];
    }

    public function refund(): BelongsTo
    {
        return $this->belongsTo(SaleRefund::class, 'sale_refund_id');
    }

    public function saleItem(): BelongsTo
    {
        return $this->belongsTo(SaleItem::class);
    }
}
