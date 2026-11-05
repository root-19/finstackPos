<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\Product;
use App\Models\RecipeLine;
use App\Services\Inventory\InventoryService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * What each product (and size) uses from inventory. The POS deducts it on
 * every sale. Permission::InventoryManage.
 */
class RecipeController extends Controller
{
    public function index(InventoryService $inventory): Response
    {
        $products = Product::query()->with(['sizes', 'recipeLines', 'category:id,name'])->orderBy('name')->get();
        $available = $inventory->availability($products);

        return Inertia::render('Inventory/Recipes', [
            'products' => $products->map(fn (Product $p) => [
                'id' => $p->id,
                'name' => $p->name,
                'category' => $p->category?->name,
                'image_url' => $p->imageUrl(),
                'price_cents' => $p->price_cents,
                'is_active' => $p->is_active,
                'sizes' => $p->sizesForCatalog(),
                'lines' => $p->recipeLines->map(fn (RecipeLine $l) => [
                    'item_id' => $l->inventory_item_id,
                    'size_id' => $l->option_value_id,
                    'quantity' => $l->quantity,
                ])->values(),
                'available' => $available[$p->id] ?? null,
            ]),
            'items' => InventoryItem::query()->where('is_active', true)->orderBy('name')
                ->get(['id', 'name', 'unit', 'quantity', 'unit_cost_cents', 'category']),
        ]);
    }

    public function update(Request $request, Product $product): RedirectResponse
    {
        $data = $request->validate([
            'lines' => ['present', 'array', 'max:100'],
            'lines.*.item_id' => ['required', 'integer', Rule::exists('inventory_items', 'id')->where('merchant_id', $request->user()->merchant_id)->whereNull('deleted_at')],
            'lines.*.size_id' => ['nullable', 'integer'],
            'lines.*.quantity' => ['required', 'numeric', 'gt:0', 'max:999999', 'decimal:0,3'],
        ], [
            'lines.*.quantity.gt' => 'Each amount must be above zero.',
        ]);

        $sizeIds = $product->sizes()->pluck('option_values.id')->all();
        $seen = [];
        foreach ($data['lines'] as $line) {
            $size = $line['size_id'] ?? null;
            if ($size !== null && ! in_array((int) $size, $sizeIds, true)) {
                throw ValidationException::withMessages(['lines' => 'A size in the recipe no longer exists. Reload the page.']);
            }
            $key = $line['item_id'].'|'.($size ?? 'all');
            if (isset($seen[$key])) {
                throw ValidationException::withMessages(['lines' => 'An item is listed twice for the same size. Combine them into one line.']);
            }
            $seen[$key] = true;
        }

        DB::transaction(function () use ($product, $data) {
            $product->recipeLines()->delete();
            foreach ($data['lines'] as $line) {
                $product->recipeLines()->create([
                    'inventory_item_id' => $line['item_id'],
                    'option_value_id' => $line['size_id'] ?? null,
                    'quantity' => round((float) $line['quantity'], 3),
                ]);
            }
        });

        return back()->with('success', "Recipe for {$product->name} saved. Each sale now uses these items.");
    }
}
