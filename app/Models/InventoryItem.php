<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A supply, ingredient, or material the store keeps in stock.
 */
class InventoryItem extends Model
{
    use BelongsToMerchant, SoftDeletes;

    /** Units offered in the form; any short unit is accepted. */
    public const UNITS = ['pcs', 'g', 'kg', 'mL', 'L', 'oz', 'lb', 'pack', 'box', 'bottle', 'can', 'sachet', 'roll', 'dozen'];

    /** Category suggestions; any name is accepted. */
    public const CATEGORIES = ['Ingredients', 'Raw materials', 'Packaging', 'Supplies', 'Cleaning', 'Finished goods'];

    protected $fillable = [
        'name',
        'sku',
        'category',
        'unit',
        'reorder_level',
        'reorder_quantity',
        'supplier_id',
        'location',
        'notes',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'float',
            'unit_cost_cents' => 'float',
            'reorder_level' => 'float',
            'reorder_quantity' => 'float',
            'is_active' => 'boolean',
        ];
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function movements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    /** What each branch holds; the item's quantity is their total. */
    public function stocks(): HasMany
    {
        return $this->hasMany(InventoryStock::class);
    }

    /**
     * Show one branch's stock instead of the total (status and value follow).
     * In memory only: never saved.
     */
    public function atBranch(?int $branchId): static
    {
        if ($branchId !== null) {
            $this->quantity = (float) ($this->stocks->firstWhere('branch_id', $branchId)?->quantity ?? 0);
        }

        return $this;
    }

    /** "out", "low", or "ok". */
    public function stockStatus(): string
    {
        if ($this->quantity <= 0) {
            return 'out';
        }

        return $this->reorder_level !== null && $this->quantity <= $this->reorder_level ? 'low' : 'ok';
    }

    /** What the stock on hand is worth, in cents. */
    public function valueCents(): int
    {
        return (int) round(max($this->quantity, 0) * $this->unit_cost_cents);
    }
}
