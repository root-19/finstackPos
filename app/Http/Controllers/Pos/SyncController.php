<?php

namespace App\Http\Controllers\Pos;

use App\Enums\PaymentMethod;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\CashShift;
use App\Models\Category;
use App\Models\Product;
use App\Models\User;
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
                // The register's cash shift (unset before shifts, or with shifts turned off).
                'shift_uuid' => ['nullable', 'uuid'],
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
            // Shifts upload before sales, so the shift is normally here already.
            $data['cash_shift_id'] = isset($data['shift_uuid'])
                ? CashShift::withoutGlobalScopes()->where('merchant_id', $merchant->id)->where('client_uuid', $data['shift_uuid'])->value('id')
                : null;

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

    /**
     * Cash shifts made on the register, sent whole each time they change
     * (opened, cash moved, closed). Upserted by client_uuid; a closed shift
     * never reopens, and a shift is never rejected over its branch.
     */
    public function shifts(Request $request): JsonResponse
    {
        $request->validate([
            'shifts' => ['required', 'array', 'min:1', 'max:50'],
        ]);

        $user = $request->user();
        $merchant = $user->merchant;
        $synced = [];
        $rejected = [];
        $window = ['after:'.now()->subYear()->toIso8601String(), 'before_or_equal:'.now()->addMinutes(10)->toIso8601String()];

        foreach ($request->input('shifts') as $payload) {
            $uuid = is_array($payload) ? ($payload['client_uuid'] ?? null) : null;
            $validator = Validator::make(is_array($payload) ? $payload : [], [
                'client_uuid' => ['required', 'uuid'],
                'terminal' => ['required', 'string', 'max:40'],
                'branch_id' => ['nullable', 'integer'],
                'opened_at' => ['required', 'date', ...$window],
                'opening_cash_cents' => ['required', 'integer', 'min:0', 'max:9999999999'],
                'cash_moves' => ['nullable', 'array', 'max:500'],
                'cash_moves.*.id' => ['required', 'string', 'max:40'],
                'cash_moves.*.type' => ['required', Rule::in(['in', 'out'])],
                'cash_moves.*.amount_cents' => ['required', 'integer', 'min:1', 'max:9999999999'],
                'cash_moves.*.reason' => ['required', 'string', 'max:120'],
                'cash_moves.*.at' => ['required', 'date'],
                'cash_moves.*.user_id' => ['nullable', 'integer'],
                'closed_at' => ['nullable', 'date', ...$window],
                'counted_cash_cents' => ['nullable', 'required_with:closed_at', 'integer', 'min:0', 'max:9999999999'],
                'closed_by' => ['nullable', 'integer'],
            ]);

            if ($validator->fails()) {
                $rejected[] = ['client_uuid' => $uuid, 'message' => $validator->errors()->first()];

                continue;
            }

            $data = $validator->validated();
            $shift = CashShift::withoutGlobalScopes()->firstOrNew(['merchant_id' => $merchant->id, 'client_uuid' => $data['client_uuid']]);

            if ($shift->exists && $shift->closed_at !== null) {
                $synced[] = $uuid;   // already closed: nothing can change it

                continue;
            }

            // Staff ids from the device are only kept when they are this store's.
            $staff = fn (?int $id) => $id && User::withoutGlobalScopes()->where('merchant_id', $merchant->id)->whereKey($id)->exists() ? $id : $user->id;

            $shift->forceFill([
                'merchant_id' => $merchant->id,
                'branch_id' => Branch::forUser($user, $data['branch_id'] ?? null, activeOnly: false)->id,
                'terminal' => $data['terminal'],
                'opened_at' => Carbon::parse($data['opened_at'])->utc(),
                'opening_cash_cents' => $data['opening_cash_cents'],
                'cash_moves' => array_values($data['cash_moves'] ?? []),
                'closed_at' => isset($data['closed_at']) ? Carbon::parse($data['closed_at'])->utc() : null,
                'counted_cash_cents' => $data['counted_cash_cents'] ?? null,
            ]);
            $shift->opened_by ??= $user->id;
            if (isset($data['closed_at'])) {
                $shift->closed_by = $staff($data['closed_by'] ?? null);
            }
            $shift->save();
            $synced[] = $uuid;
        }

        return response()->json(['synced' => $synced, 'rejected' => $rejected]);
    }

    /** A shift's report from the server, which also knows voids and cash refunds. */
    public function shiftReport(Request $request, string $uuid): JsonResponse
    {
        $shift = CashShift::query()->where('client_uuid', $uuid)->firstOrFail();

        return response()->json(['report' => $shift->report()]);
    }
}
