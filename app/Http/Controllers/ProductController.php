<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProductRequest;
use App\Models\Branch;
use App\Models\BranchProduct;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Product and Category are merchant-scoped globally, so every query and
 * route binding here only ever sees the current store's rows.
 */
class ProductController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'category' => ['nullable', 'integer'],
            'branch' => ['nullable', 'integer'],
        ]);
        $branches = Branch::query()->orderBy('id')->get(['id', 'name', 'is_active']);
        $names = $branches->pluck('name', 'id');

        $products = Product::query()
            ->with(['category:id,name', 'sizes', 'branchRows'])
            ->when($filters['search'] ?? null, function ($query, string $search) {
                $query->where(fn ($query) => $query
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('sku', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%"));
            })
            ->when($filters['category'] ?? null, fn ($query, int $category) => $query->where('category_id', $category))
            ->when($filters['branch'] ?? null, fn ($query, int $branch) => $query->where(fn ($q) => $q
                ->where('all_branches', true)
                ->orWhereHas('branchRows', fn ($r) => $r->where('branch_id', $branch))))
            ->orderBy('name')
            ->paginate(20)
            ->withQueryString()
            ->through(fn (Product $product) => [
                'id' => $product->id,
                'name' => $product->name,
                'sku' => $product->sku,
                'barcode' => $product->barcode,
                'image_url' => $product->imageUrl(),
                'category_id' => $product->category_id,
                'category' => $product->category?->name,
                'price_cents' => $product->price_cents,
                'stock' => $product->stock,
                'is_active' => $product->is_active,
                'sizes' => $product->sizesForCatalog(),
                'all_branches' => $product->all_branches,
                'branch_ids' => $product->branchRows->pluck('branch_id')->values(),
                // Each branch's own count (empty while one shared count is kept).
                'branch_stock' => $product->stock !== null && $product->countsPerBranch()
                    ? $product->branchRows->map(fn (BranchProduct $r) => ['branch_id' => $r->branch_id, 'name' => $names[$r->branch_id] ?? '', 'stock' => (int) $r->stock])->values()
                    : [],
            ]);

        return Inertia::render('Products/Index', [
            'products' => $products,
            'categories' => Category::query()->orderBy('name')->get(['id', 'name']),
            'branches' => $branches,
            'productLimit' => [
                'used' => Product::query()->count(),
                'limit' => $request->user()->merchant->productLimit(),
            ],
            'filters' => [
                'search' => $filters['search'] ?? '',
                'category' => $filters['category'] ?? null,
                'branch' => $filters['branch'] ?? null,
            ],
        ]);
    }

    public function store(ProductRequest $request): RedirectResponse
    {
        // Free stores can keep up to the plan's limit (see config/subscriptions.php).
        $limit = $request->user()->merchant->productLimit();
        if ($limit !== null && Product::query()->count() >= $limit) {
            throw ValidationException::withMessages([
                'name' => "The free plan includes up to {$limit} products. Upgrade to Pro for unlimited products.",
            ]);
        }

        $this->saveWithImage($request, new Product($request->productAttributes()));

        return back()->with('success', 'Product added.');
    }

    public function update(ProductRequest $request, Product $product): RedirectResponse
    {
        $this->saveWithImage($request, $product->fill($request->productAttributes()));

        return back()->with('success', 'Product updated.');
    }

    public function destroy(Product $product): RedirectResponse
    {
        // Soft delete: past sales keep their reference and the POS is told
        // to drop it on its next catalog sync. The image is kept with it.
        $product->delete();

        return back()->with('success', 'Product deleted.');
    }

    /**
     * Where the product is sold and each branch's stock. With a count per
     * branch the overall stock is their total; a tracked product sold at
     * several branches without one keeps a single shared count.
     */
    private function syncBranches(ProductRequest $request, Product $product): void
    {
        $branchIds = Branch::query()->pluck('id')->map(fn ($id) => (int) $id);
        $selected = $product->all_branches
            ? $branchIds
            : $branchIds->intersect(array_map('intval', $request->validated('branch_ids') ?? []))->values();
        $perBranch = $request->validated('branch_stock');
        $rows = [];

        if ($product->stock !== null && is_array($perBranch)) {
            foreach ($selected as $id) {
                $rows[$id] = (int) ($perBranch[$id] ?? 0);
            }
            $product->stock = array_sum($rows);
        } elseif ($product->stock !== null && $selected->count() === 1) {
            $rows[$selected->first()] = $product->stock;
        }

        if (! $product->all_branches) {
            foreach ($selected as $id) {
                $rows[$id] ??= null;
            }
        }

        $product->branchRows()->whereNotIn('branch_id', array_keys($rows))->delete();
        foreach ($rows as $id => $stock) {
            BranchProduct::query()->updateOrCreate(['product_id' => $product->id, 'branch_id' => $id], ['stock' => $stock]);
        }
        $product->save();
    }

    /**
     * Save the product, its options, and a new upload (or no image). The old
     * file is only deleted once the row points elsewhere. Uploads are
     * namespaced per merchant under a random name.
     */
    private function saveWithImage(ProductRequest $request, Product $product): void
    {
        $oldPath = $product->image_path;

        if ($request->hasFile('image')) {
            $product->image_path = $request->file('image')
                ->store('products/'.$request->user()->merchant_id, 'public');
        } elseif ($request->boolean('remove_image')) {
            $product->image_path = null;
        }

        DB::transaction(function () use ($request, $product) {
            $product->save();
            $product->syncSizes($request->sizes());
            $this->syncBranches($request, $product);
            // Sizes live in other tables; bump the product so POS devices re-pull it.
            $product->touch();
        });

        if ($oldPath && $oldPath !== $product->image_path) {
            Storage::disk('public')->delete($oldPath);
        }
    }
}
