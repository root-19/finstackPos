<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * How much of an inventory item one unit of a product uses. A line without
 * a size applies to every size; a size's own lines are added on top
 * (e.g. every coffee uses a lid, a Large also uses a 16 oz cup).
 */
class RecipeLine extends Model
{
    use BelongsToMerchant;

    protected $fillable = [
        'product_id',
        'option_value_id',
        'inventory_item_id',
        'quantity',
    ];

    protected function casts(): array
    {
        return [
            'product_id' => 'integer',
            'option_value_id' => 'integer',
            'inventory_item_id' => 'integer',
            'quantity' => 'float',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }
}
