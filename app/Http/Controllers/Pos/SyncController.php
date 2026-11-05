<?php

namespace App\Http\Controllers\Pos;

use App\Enums\PaymentMethod;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Services\Inventory\InventoryService;
use App\Services\Sales\SaleRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Throwable;

class SyncController extends Controller
{
    public function __construct(private readonly SaleRecorder $sales) {}

    /**
     * Catalog changes since the client's last pull (or everything on the
     * first pull). Product and Category are merchant-scoped globally.
     */
    public function catalog(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'since' => ['nullable', 'date'],
        ]);

        // Captured before querying so nothing written mid-request is skipped.
        $serverTime = now();
        // Timestamps are stored in UTC and Eloquent doesn't convert offsets.
        $since = isset($validated['since']) ? Carbon::parse($validated['since'])->utc() : null;

        $changed = fn (string $model) => $model::withTrashed()
            ->when($since, fn ($query) => $query->where('updated_at', '>=', $since))
            ->get();

        [$deletedCategories, $categories] = $changed(Category::class)->partition->trashed();
        [$deletedProducts, $products] = $changed(Product::class)->partition->trashed();
        $products->load(['sizes', 'branchRows']);

        return response()->json([
            'merchant' => $request->user()->merchant->posSettings(),
            'categories' => $categories->map->only(['id', 'name'])->values(),
            'products' => $products->map(fn (Product $product) => [
                ...$product->only([
                    'id', 'category_id', 'name', 'sku', 'barcode', 'price_cents', 'stock', 'is_active', 'updated_at',
                ]),
                'image_url' => $product->imageUrl(),
                'sizes' => $product->sizesForCatalog(),
                // Where it's sold and each branch's stock (the register uses its own branch's).
                ...$product->branchesForCatalog(),
            ])->values(),
            // Always in full (it changes with every sale): stock of the items
            // used in recipes, and each product's recipe.
            'inventory' => app(InventoryService::class)->forPos(),
            'deleted' => [
                'categories' => $deletedCategories->modelKeys(),
                'products' => $deletedProducts->modelKeys(),
            ],
            'server_time' => $serverTime->toIso8601String(),
        ]);
    }

    /**
     * Accept a batch of sales recorded on the device. Each sale is validated
     * and stored on its own so one bad sale never blocks the rest of the
     * queue, and re-sending an already stored sale is a no-op.
     */
    public function sales(Request $request): JsonResponse
    {
        $request->validate([
            'sales' => ['required', 'array', 'min:1', 'max:50'],
        ]);

        $user = $request->user();
        $merchant = $user->merchant;
        $synced = [];
        $rejected = [];

        foreach ($request->input('sales') as $payload) {
            $uuid = is_array($payload) ? ($payload['client_uuid'] ?? null) : null;

            $validator = Validator::make(is_array($payload) ? $payload : [], [
                'client_uuid' => ['required', 'uuid'],
                // Where the POS was set to sell; sales queued before branches have none.
                'branch_id' => ['nullable', 'integer'],
                'sold_at' => ['required', 'date', 'after:'.now()->subYear()->toIso8601String(), 'before_or_equal:'.now()->addMinutes(10)->toIso8601String()],
                'payment_method' => ['required', Rule::enum(PaymentMethod::class)],
                'payment_reference' => ['nullable', 'string', 'max:100', 'required_if:payment_method,'.PaymentMethod::QrPh->value],
                'amount_paid_cents' => ['required', 'integer', 'min:0', 'max:9999999999'],
                'discount_type' => ['nullable', Rule::in(['senior', 'pwd'])],
                'discount_id_number' => ['nullable', 'required_with:discount_type', 'string', 'max:50'],
                'discount_customer_name' => ['nullable', 'required_with:discount_type', 'string', 'max:100'],
                // What the cashier saw on the DOH PWD registry (a record, never a requirement).
                'discount_doh_check' => ['nullable', Rule::in(['found', 'not_found'])],
                // A table's QR-code orders this sale pays for.
                'table_order_ids' => ['nullable', 'array', 'max:50'],
                'table_order_ids.*' => ['integer'],
                'items' => ['required', 'array', 'min:1', 'max:200'],
                // A product may appear on several lines with different options.
                'items.*.product_id' => ['required', 'integer'],
                'items.*.quantity' => ['required', 'integer', 'min:1', 'max:9999'],
                'items.*.unit_price_cents' => ['required', 'integer', 'min:0', 'max:999999999'],
                'items.*.options' => ['nullable', 'array', 'max:20'],
                'items.*.options.*.group' => ['required', 'string', 'max:60'],
                'items.*.options.*.value' => ['required', 'string', 'max:60'],
                'items.*.options.*.price_cents' => ['nullable', 'integer', 'min:0'],
            ]);

            if ($validator->fails()) {
                $rejected[] = ['client_uuid' => $uuid, 'message' => $validator->errors()->first()];

                continue;
            }

            $data = $validator->validated();
            // Never rejected over the branch (the sale already happened): a
            // cashier tied to a branch always sells there, an unknown branch
            // falls back to the main one.
            $branchId = Branch::forUser($user, $data['branch_id'] ?? null, activeOnly: false)->id;

            try {
                $error = $this->sales->record($merchant, $user, $branchId, $data);
            } catch (Throwable $e) {
                // One sale that cannot be stored must never block the queue
                // behind it: it goes to the register's "needs review" list.
                report($e);
                $error = 'This sale could not be stored. Try again; if it keeps failing, contact support.';
            }

            if ($error === null) {
                $synced[] = $uuid;
            } else {
                $rejected[] = ['client_uuid' => $uuid, 'message' => $error];
            }
        }

        return response()->json([
            'synced' => $synced,
            'rejected' => $rejected,
        ]);
    }
}
