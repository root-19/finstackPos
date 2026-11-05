<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use Database\Factories\ProductFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    /** @use HasFactory<ProductFactory> */
    use BelongsToMerchant, HasFactory, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'category_id',
        'name',
        'sku',
        'barcode',
        'image_path',
        'price_cents',
        'stock',
        'is_active',
        'all_branches',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'price_cents' => 'integer',
            'stock' => 'integer',
            'is_active' => 'boolean',
            'all_branches' => 'boolean',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    /** Where it's sold (when not at every branch) and each branch's stock. */
    public function branchRows(): HasMany
    {
        return $this->hasMany(BranchProduct::class);
    }

    /**
     * For the POS and menus: the branches it's sold at (null: all) and each
     * branch's stock (only when stock is tracked).
     *
     * @return array{branch_ids: list<int>|null, branch_stock: array<int, int>|null}
     */
    public function branchesForCatalog(): array
    {
        return [
            'branch_ids' => $this->all_branches ? null : $this->branchRows->pluck('branch_id')->map(fn ($id) => (int) $id)->values()->all(),
            // Null too while the stock isn't counted per branch yet (one shared count).
            'branch_stock' => $this->stock === null || ! $this->countsPerBranch() ? null : $this->branchRows->mapWithKeys(fn (BranchProduct $r) => [$r->branch_id => (int) $r->stock])->all(),
        ];
    }

    public function soldAt(int $branchId): bool
    {
        return $this->all_branches || $this->branchRows->contains('branch_id', $branchId);
    }

    /** Stock at a branch (null: not tracked; a branch with no count has none). */
    public function stockAt(int $branchId): ?int
    {
        if ($this->stock === null) {
            return null;
        }

        return $this->countsPerBranch() ? (int) ($this->branchRows->firstWhere('branch_id', $branchId)?->stock ?? 0) : $this->stock;
    }

    /** Each branch keeps its own count (products saved since branches came). */
    public function countsPerBranch(): bool
    {
        return $this->branchRows->contains(fn (BranchProduct $r) => $r->stock !== null);
    }

    public function optionGroups(): HasMany
    {
        return $this->hasMany(OptionGroup::class)->orderBy('sort_order');
    }

    /**
     * The product's sizes, each with its own full price. Empty when the
     * product is sold at a single price.
     */
    /** Inventory used per unit sold (see RecipeLine). */
    public function recipeLines(): HasMany
    {
        return $this->hasMany(RecipeLine::class);
    }

    public function sizes(): HasManyThrough
    {
        return $this->hasManyThrough(OptionValue::class, OptionGroup::class)
            ->orderBy('option_values.sort_order');
    }

    /**
     * @return list<array{id: int, name: string, price_cents: int}>
     */
    public function sizesForCatalog(): array
    {
        return $this->sizes->map->only(['id', 'name', 'price_cents'])->values()->all();
    }

    /**
     * Make the product's sizes match the submitted list: update rows by id,
     * create new ones, delete the rest. Ids are only looked up within this
     * product, so foreign ids simply create new rows. Past sales keep a
     * snapshot of the chosen size, so deleting is safe.
     *
     * @param  array<int, array{id?: int|null, name: string, price: numeric-string|float|int}>  $sizes
     */
    public function syncSizes(array $sizes): void
    {
        if ($sizes === []) {
            $this->optionGroups()->delete();

            return;
        }

        /** @var OptionGroup $group */
        $group = $this->optionGroups()->first() ?? $this->optionGroups()->make();
        $group->fill(['name' => 'Size', 'is_required' => true, 'allows_multiple' => false, 'sort_order' => 0])->save();
        $this->optionGroups()->whereKeyNot($group->id)->delete();

        $keptIds = [];

        foreach (array_values($sizes) as $index => $size) {
            $value = (isset($size['id']) ? $group->values()->find($size['id']) : null)
                ?? $group->values()->make();

            $value->fill([
                'name' => $size['name'],
                'price_cents' => (int) round($size['price'] * 100),
                'sort_order' => $index,
            ])->save();

            $keptIds[] = $value->id;
        }

        $group->values()->whereNotIn('id', $keptIds)->delete();
    }

    /**
     * Root-relative so it works whatever host the app is served from
     * (the disk's url() depends on APP_URL). Needs `php artisan storage:link`.
     */
    public function imageUrl(): ?string
    {
        return $this->image_path ? '/storage/'.$this->image_path : null;
    }
}
