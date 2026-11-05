<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * How much of an inventory item one branch holds. The item's own quantity
 * is the total of every branch (see InventoryService::move).
 */
class InventoryStock extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'inventory_item_id',
        'branch_id',
        'quantity',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'float',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
