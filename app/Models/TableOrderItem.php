<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One line of a table order, priced when it was placed. */
class TableOrderItem extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'product_id',
        'size_id',
        'name',
        'options',
        'unit_price_cents',
        'quantity',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'options' => 'array',
            'unit_price_cents' => 'integer',
            'quantity' => 'integer',
            'size_id' => 'integer',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(TableOrder::class, 'table_order_id');
    }

    /**
     * @return array{name: string, options: list<array{group: string, value: string, price_cents: int}>, quantity: int, note: string|null, line_total_cents: int}
     */
    public function forDisplay(): array
    {
        return [
            'name' => $this->name,
            'options' => $this->options ?? [],
            'quantity' => $this->quantity,
            'note' => $this->note,
            'line_total_cents' => $this->unit_price_cents * $this->quantity,
        ];
    }
}
