<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use App\Models\Concerns\BelongsToUserBranch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One change to an item's stock. The ledger is append-only: corrections
 * are new movements, never edits.
 */
class StockMovement extends Model
{
    use BelongsToMerchant, BelongsToUserBranch;

    public const UPDATED_AT = null;

    /** Received from a supplier (adds stock, updates the average cost). */
    public const PURCHASE = 'purchase';

    /** Used up by a POS sale, from the product's recipe. */
    public const SALE = 'sale';

    /** A physical count that set the quantity. */
    public const ADJUSTMENT = 'adjustment';

    /** Spoiled, expired, or damaged. */
    public const WASTE = 'waste';

    /** Used in the store without a sale (staff meals, samples, cleaning). */
    public const USAGE = 'usage';

    /** Sent back to the supplier. */
    public const RETURN = 'return';

    /** Types a person can record by hand. */
    public const MANUAL = [self::PURCHASE, self::ADJUSTMENT, self::WASTE, self::USAGE, self::RETURN];

    protected $fillable = [
        'branch_id',
        'inventory_item_id',
        'type',
        'quantity_change',
        'quantity_after',
        'unit_cost_cents',
        'total_cost_cents',
        'supplier_id',
        'sale_id',
        'reference',
        'note',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'quantity_change' => 'float',
            'quantity_after' => 'float',
            'unit_cost_cents' => 'float',
            'total_cost_cents' => 'integer',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id')->withTrashed();
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class)->withTrashed();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }
}
