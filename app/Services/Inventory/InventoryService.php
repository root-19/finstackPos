<?php

namespace App\Services\Inventory;

use App\Models\Branch;
use App\Models\InventoryItem;
use App\Models\InventoryStock;
use App\Models\Merchant;
use App\Models\OptionValue;
use App\Models\Product;
use App\Models\RecipeLine;
use App\Models\Sale;
use App\Models\StockMovement;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Every stock change goes through here, so each branch's stock, the item's
 * total (the sum of its branches), and the movement ledger always agree.
 */
class InventoryService
{
    /**
     * Record a stock movement at a branch and update the item, all-or-nothing.
     *
     * $quantity is the amount received/used (always positive) except for an
     * adjustment, where it is the counted quantity on hand at the branch.
     * Without a branch the store's main branch is used.
     *
     * @param  array{branch_id?: int|null, unit_cost_cents?: float|null, supplier_id?: int|null, sale_id?: int|null, reference?: string|null, note?: string|null, user_id?: int|null}  $details
     *
     * @throws ValidationException
     */
    public function move(InventoryItem $item, string $type, float $quantity, array $details = []): StockMovement
    {
        return DB::transaction(function () use ($item, $type, $quantity, $details) {
            // Lock the rows so two tills selling at once can't lose an update.
            $item = InventoryItem::withTrashed()->lockForUpdate()->findOrFail($item->id);
            $branchId = $details['branch_id'] ?? Merchant::findOrFail($item->merchant_id)->mainBranch()->id;
            $stock = InventoryStock::query()->lockForUpdate()->firstOrCreate(['inventory_item_id' => $item->id, 'branch_id' => $branchId], ['quantity' => 0]);
            $before = $stock->quantity;

            $change = match ($type) {
                StockMovement::PURCHASE => $quantity,
                StockMovement::ADJUSTMENT => $quantity - $before,
                StockMovement::SALE, StockMovement::WASTE, StockMovement::USAGE, StockMovement::RETURN => -$quantity,
            };
            $change = round($change, 3);
            $after = round($before + $change, 3);

            // Sales may go below zero (they already happened, maybe offline);
            // a person removing more than is on hand is probably a typo.
            if ($after < 0 && in_array($type, [StockMovement::WASTE, StockMovement::USAGE, StockMovement::RETURN], true)) {
                throw ValidationException::withMessages([
                    'quantity' => "Only {$this->format($before)} {$item->unit} of {$item->name} is on hand.",
                ]);
            }

            $unitCost = $details['unit_cost_cents'] ?? null;
            if ($type === StockMovement::PURCHASE && $unitCost !== null) {
                // Weighted average cost over every branch; stock below zero doesn't count.
                $held = max($item->quantity, 0);
                $item->unit_cost_cents = $held + $quantity > 0
                    ? round(($held * $item->unit_cost_cents + $quantity * $unitCost) / ($held + $quantity), 4)
                    : $unitCost;
            }

            $stock->quantity = $after;
            $stock->save();
            $item->quantity = round($item->quantity + $change, 3);
            $item->save();

            $movement = new StockMovement([
                'branch_id' => $branchId,
                'inventory_item_id' => $item->id,
                'type' => $type,
                'quantity_change' => $change,
                'quantity_after' => $after,
                'unit_cost_cents' => $type === StockMovement::PURCHASE ? $unitCost : $item->unit_cost_cents,
                'total_cost_cents' => (int) round(abs($change) * ($type === StockMovement::PURCHASE && $unitCost !== null ? $unitCost : $item->unit_cost_cents)),
                'supplier_id' => $details['supplier_id'] ?? null,
                'sale_id' => $details['sale_id'] ?? null,
                'reference' => $details['reference'] ?? null,
                'note' => $details['note'] ?? null,
                'user_id' => $details['user_id'] ?? null,
            ]);
            $movement->merchant_id = $item->merchant_id;
            $movement->save();

            return $movement;
        });
    }

    /**
     * Use up the recipe ingredients of a stored sale. Called inside the
     * sale's transaction. Sizes are matched by name, as the sale records them.
     *
     * @param  Collection<int, array{product_id: int, quantity: int, options: array<int, array{group: string, value: string}>|null}>  $lines
     */
    public function consumeForSale(Sale $sale, Collection $lines, ?int $userId): void
    {
        $productIds = $lines->pluck('product_id')->unique();
        $recipes = RecipeLine::query()->whereIn('product_id', $productIds)->get()->groupBy('product_id');

        if ($recipes->isEmpty()) {
            return;
        }

        $sizes = OptionValue::query()
            ->join('option_groups', 'option_groups.id', '=', 'option_values.option_group_id')
            ->whereIn('option_groups.product_id', $productIds)
            ->get(['option_values.id', 'option_values.name', 'option_groups.product_id']);

        $usage = [];
        foreach ($lines as $line) {
            $sizeName = collect($line['options'] ?? [])->first()['value'] ?? null;
            $sizeId = $sizeName === null ? null : $sizes
                ->first(fn ($s) => (int) $s->product_id === (int) $line['product_id'] && strcasecmp($s->name, $sizeName) === 0)?->id;

            foreach ($this->linesFor($recipes->get($line['product_id'], collect()), $sizeId) as $recipe) {
                $usage[$recipe->inventory_item_id] = ($usage[$recipe->inventory_item_id] ?? 0) + $recipe->quantity * $line['quantity'];
            }
        }

        ksort($usage); // a fixed lock order avoids deadlocks between tills
        foreach ($usage as $itemId => $quantity) {
            $item = InventoryItem::withTrashed()->find($itemId);
            if ($item) {
                $this->move($item, StockMovement::SALE, round($quantity, 3), [
                    'branch_id' => $sale->branch_id,
                    'sale_id' => $sale->id,
                    'reference' => strtoupper(substr($sale->client_uuid, 0, 8)),
                    'user_id' => $userId,
                ]);
            }
        }
    }

    /**
     * The recipe lines that apply to one size (or the product without sizes):
     * the lines for every size, plus that size's own.
     *
     * @param  Collection<int, RecipeLine>  $recipe
     * @return Collection<int, RecipeLine>
     */
    public function linesFor(Collection $recipe, ?int $sizeId): Collection
    {
        return $recipe->filter(fn (RecipeLine $l) => $l->option_value_id === null || $l->option_value_id === $sizeId);
    }

    /**
     * What the POS needs to know offline: current stock of each item used in
     * a recipe, and each product's recipe.
     *
     * Each item comes with every branch's stock, so a register works out its
     * own branch offline, even after switching branch.
     *
     * @return array{items: array<int, array{name: string, unit: string, quantity: float, branches: array<int, float>}>, recipes: array<int, list<array{item_id: int, size_id: int|null, quantity: float}>>}
     */
    public function forPos(): array
    {
        $lines = RecipeLine::query()->get(['product_id', 'option_value_id', 'inventory_item_id', 'quantity']);
        $items = InventoryItem::withTrashed()
            ->with('stocks')
            ->whereKey($lines->pluck('inventory_item_id')->unique())
            ->get(['id', 'name', 'unit', 'quantity']);

        return [
            'items' => $items->mapWithKeys(fn (InventoryItem $i) => [$i->id => [
                'name' => $i->name,
                'unit' => $i->unit,
                'quantity' => $i->quantity,
                'branches' => $i->stocks->mapWithKeys(fn (InventoryStock $s) => [$s->branch_id => $s->quantity])->all(),
            ]])->all(),
            'recipes' => $lines->groupBy('product_id')->map(fn ($group) => $group->map(fn (RecipeLine $l) => [
                'item_id' => $l->inventory_item_id,
                'size_id' => $l->option_value_id,
                'quantity' => $l->quantity,
            ])->values()->all())->all(),
        ];
    }

    /**
     * How many of each product (and size) the stock on hand can still make,
     * at one branch or (without one) across the whole store. Null when the
     * product has no recipe.
     *
     * @return array<int, array{product: int|null, sizes: array<int, int>}>
     */
    public function availability(Collection $products, ?int $branchId = null): array
    {
        $recipes = RecipeLine::query()->with('item')->whereIn('product_id', $products->modelKeys())->get()->groupBy('product_id');
        $atBranch = $branchId === null ? null : InventoryStock::query()
            ->where('branch_id', $branchId)
            ->whereIn('inventory_item_id', $recipes->flatten()->pluck('inventory_item_id')->unique())
            ->pluck('quantity', 'inventory_item_id');
        $onHand = fn (RecipeLine $l) => $atBranch === null ? $l->item->quantity : (float) ($atBranch[$l->inventory_item_id] ?? 0);
        $out = [];

        foreach ($products as $product) {
            /** @var Product $product */
            $recipe = $recipes->get($product->id);
            if (! $recipe) {
                continue;
            }

            $count = function (?int $sizeId) use ($recipe, $onHand) {
                $lines = $this->linesFor($recipe, $sizeId)->filter(fn ($l) => $l->item && $l->quantity > 0);

                return $lines->isEmpty() ? null : (int) $lines->min(fn ($l) => max(0, floor($onHand($l) / $l->quantity)));
            };

            $sizes = [];
            foreach ($product->sizes as $size) {
                $sizes[$size->id] = $count($size->id);
            }
            $out[$product->id] = ['product' => $product->sizes->isEmpty() ? $count(null) : null, 'sizes' => array_filter($sizes, fn ($v) => $v !== null)];
        }

        return $out;
    }

    private function format(float $quantity): string
    {
        return rtrim(rtrim(number_format($quantity, 3, '.', ','), '0'), '.');
    }
}
