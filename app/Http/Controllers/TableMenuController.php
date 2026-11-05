<?php

namespace App\Http\Controllers;

use App\Enums\PaymentMethod;
use App\Models\Branch;
use App\Models\Category;
use App\Models\DiningTable;
use App\Models\Merchant;
use App\Models\PaymentIntent;
use App\Models\Product;
use App\Models\TableOrder;
use App\Services\Inventory\InventoryService;
use App\Services\PayMongo;
use App\Services\TableOrders\TableOrderPayments;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The public menu a table's QR code opens on the customer's phone, with a
 * checkout paid by cash or QR. No login:
 * the table's unguessable token is the only key, and it only ever reaches
 * that store's menu, that table's orders, and the customer's own orders.
 *
 * Models are scoped to the signed-in user's store (and branch), so every
 * query here drops those scopes and names the table's store instead (a
 * store's own staff member may well scan another store's code).
 */
class TableMenuController extends Controller
{
    /** Orders a table may place in a minute, and orders waiting for staff at once. */
    private const ORDERS_PER_MINUTE = 3;

    private const MAX_WAITING_ORDERS = 5;

    public function show(string $token): Response
    {
        [$table, $merchant, $branch] = $this->resolve($token);
        $products = $this->products($merchant, $branch);
        $categoryIds = $products->pluck('category_id')->filter()->unique();

        return Inertia::render('Menu/Show', [
            'token' => $token,
            'table' => ['name' => $table->name, 'branch' => Branch::withoutGlobalScopes()->where('merchant_id', $merchant->id)->count() > 1 ? $branch->name : null],
            'store' => [
                'name' => $merchant->name,
                'address' => $merchant->address,
                'currency' => $merchant->currency,
                'timezone' => $merchant->timezone,
                // To show the total at checkout (the server prices the order again).
                'tax_rate_bps' => $merchant->tax_rate_bps,
                'prices_include_tax' => $merchant->prices_include_tax,
                'service_charge_bps' => $merchant->service_charge_bps,
            ],
            'payments' => $this->paymentOptions($merchant),
            'state' => $merchant->tableOrderingState($branch),
            'categories' => Category::withoutGlobalScope('merchant')
                ->where('merchant_id', $merchant->id)
                ->whereKey($categoryIds)
                ->orderBy('name')
                ->get(['id', 'name']),
            'products' => $this->menuItems($merchant, $branch, $products),
        ]);
    }

    /**
     * What the phone polls: can it order now, and how its orders (and their
     * payments) are doing. $orders are the order tokens this phone placed
     * (kept on the phone).
     */
    public function state(Request $request, string $token): JsonResponse
    {
        [$table, $merchant, $branch] = $this->resolve($token);
        $tokens = collect($request->query('orders', []))->filter(fn ($t) => is_string($t) && Str::isUuid($t))->take(20);

        $orders = $tokens->isEmpty() ? collect() : TableOrder::withoutGlobalScopes()
            ->where('dining_table_id', $table->id)
            ->whereIn('public_token', $tokens)
            ->with('items')
            ->latest()
            ->get();

        // A QR Ph payment confirms here, while the customer waits on the QR.
        $payments = app(TableOrderPayments::class);
        $orders->each(function (TableOrder $order) use ($payments) {
            $payments->refresh($order);
            $order->refresh()->load('items');
        });

        return response()->json([
            'state' => $merchant->tableOrderingState($branch),
            'orders' => $orders->map->forCustomer()->values(),
        ]);
    }

    /**
     * Paid by the store's own QR: the customer says so (with the e-wallet
     * reference if they have it); the staff confirm it when they accept.
     */
    public function paid(Request $request, string $token): JsonResponse
    {
        [$table] = $this->resolve($token);
        $data = $request->validate([
            'order' => ['required', 'uuid'],
            'reference' => ['nullable', 'string', 'max:100'],
        ]);

        $order = TableOrder::withoutGlobalScopes()
            ->where('dining_table_id', $table->id)
            ->where('public_token', $data['order'])
            ->where('payment_method', PaymentMethod::EWallet->value)
            ->firstOrFail();

        if (! $order->paid() && $order->status !== TableOrder::REJECTED) {
            $order->forceFill([
                'payment_status' => TableOrder::AWAITING,
                'payment_reference' => filled($data['reference'] ?? null) ? trim($data['reference']) : $order->payment_reference,
            ])->save();
        }

        return response()->json(['order' => $order->load('items')->forCustomer()]);
    }

    /**
     * Place an order. Prices come from the store's catalog now, never from
     * the phone; staff accept it before anything is made.
     */
    public function order(Request $request, string $token): JsonResponse
    {
        [$table, $merchant, $branch] = $this->resolve($token);

        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:30'],
            'items.*.product_id' => ['required', 'integer'],
            'items.*.size_id' => ['nullable', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
            'items.*.note' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:200'],
            'payment_method' => ['required', Rule::in(array_keys(array_filter($this->paymentOptions($merchant))))],
        ], [
            'payment_method.in' => 'Choose how you’ll pay.',
        ]);

        $this->ensureCanOrder($merchant, $branch, $table);

        $products = $this->products($merchant, $branch)->keyBy('id');
        $available = $this->availability($merchant, $branch, $products);
        $lines = [];

        foreach ($data['items'] as $index => $item) {
            /** @var Product|null $product */
            $product = $products->get($item['product_id']);
            if (! $product) {
                throw ValidationException::withMessages(["items.$index.product_id" => 'One of the items is no longer on the menu. Please check your order.']);
            }

            $size = null;
            if ($product->sizes->isNotEmpty()) {
                $size = $product->sizes->firstWhere('id', $item['size_id'] ?? null);
                if (! $size) {
                    throw ValidationException::withMessages(["items.$index.size_id" => "Choose a size for {$product->name}."]);
                }
            }

            $left = $size ? ($available[$product->id]['sizes'][$size->id] ?? null) : ($available[$product->id]['product'] ?? null);
            if (($product->stockAt($branch->id) !== null && $product->stockAt($branch->id) < $item['quantity']) || ($left !== null && $left < $item['quantity'])) {
                throw ValidationException::withMessages(["items.$index.quantity" => "Sorry, {$product->name} is sold out or has fewer left than you ordered."]);
            }

            $lines[] = [
                'product_id' => $product->id,
                'size_id' => $size?->id,
                'name' => $product->name,
                'options' => $size ? [['group' => 'Size', 'value' => $size->name, 'price_cents' => $size->price_cents]] : null,
                'unit_price_cents' => $size ? $size->price_cents : $product->price_cents,
                'quantity' => $item['quantity'],
                'note' => filled($item['note'] ?? null) ? trim($item['note']) : null,
            ];
        }

        RateLimiter::hit($this->limiterKey($table));

        // The same totals the sale will have (service charge, VAT on top if prices exclude it).
        $subtotal = collect($lines)->sum(fn ($l) => $l['unit_price_cents'] * $l['quantity']);
        $total = $merchant->computeTotals($subtotal)['total'];
        $intent = $data['payment_method'] === PaymentMethod::QrPh->value ? $this->qrPayment($merchant, $table, $total) : null;

        $order = DB::transaction(function () use ($merchant, $branch, $table, $data, $lines, $subtotal, $total, $intent) {
            $order = new TableOrder([
                'branch_id' => $branch->id,
                'dining_table_id' => $table->id,
                'table_name' => $table->name,
                'public_token' => (string) Str::uuid(),
                'status' => TableOrder::NEW,
                'note' => filled($data['note'] ?? null) ? trim($data['note']) : null,
                'subtotal_cents' => $subtotal,
                'total_cents' => $total,
                'payment_method' => $data['payment_method'],
                'payment_status' => TableOrder::UNPAID,
                'payment_intent_id' => $intent?->id,
                'payment_qr' => $intent?->qr_image,
            ]);
            $order->merchant_id = $merchant->id;
            $order->save();
            $order->items()->createMany($lines);

            return $order;
        });

        return response()->json(['order' => $order->load('items')->forCustomer()], 201);
    }

    /**
     * How a customer can pay at checkout: cash always; QR Ph when the store's
     * PayMongo is ready; the store's own QR when it has one.
     *
     * @return array{cash: bool, qrph: bool, ewallet: array{label: string, image_url: string}|null}
     */
    private function paymentOptions(Merchant $merchant): array
    {
        return [
            PaymentMethod::Cash->value => true,
            PaymentMethod::QrPh->value => $merchant->paymongoReady(),
            PaymentMethod::EWallet->value => $merchant->manual_qr_enabled && $merchant->manual_qr_image_path
                ? ['label' => $merchant->manual_qr_label ?: 'E-wallet / QR', 'image_url' => '/storage/'.$merchant->manual_qr_image_path]
                : null,
        ];
    }

    /**
     * A QR Ph code for the order's total through the store's PayMongo. The
     * QR image is kept on the payment (in memory) for the order to store.
     */
    private function qrPayment(Merchant $merchant, DiningTable $table, int $total): PaymentIntent
    {
        try {
            $qr = PayMongo::forMerchant($merchant)->createQrPh($total, "{$merchant->name} · {$table->name}");
        } catch (RequestException $e) {
            Log::warning('PayMongo QR Ph failed for a table order', ['merchant' => $merchant->id, 'status' => $e->response->status()]);

            throw ValidationException::withMessages(['payment_method' => 'QR payment isn’t available right now. Please choose cash or try again.']);
        }

        $intent = new PaymentIntent(['provider' => 'paymongo', 'provider_id' => $qr['id'], 'amount_cents' => $total, 'status' => $qr['status']]);
        $intent->merchant()->associate($merchant);
        $intent->save();
        $intent->qr_image = $qr['qr_image'];

        return $intent;
    }

    /**
     * @return array{0: DiningTable, 1: Merchant, 2: Branch}
     */
    private function resolve(string $token): array
    {
        $table = DiningTable::withoutGlobalScopes()->where('token', $token)->first();
        $merchant = $table ? Merchant::find($table->merchant_id) : null;

        abort_if(! $table || ! $merchant?->is_active, 404);

        $branch = Branch::withoutGlobalScopes()->where('merchant_id', $merchant->id)->find($table->branch_id) ?? $merchant->mainBranch();

        return [$table, $merchant, $branch];
    }

    private function ensureCanOrder(Merchant $merchant, Branch $branch, DiningTable $table): void
    {
        $message = match ($merchant->tableOrderingState($branch)) {
            'open' => null,
            'paused' => 'The store isn’t taking orders from the table right now. Please order at the counter.',
            'offline' => 'The store can’t receive orders right now. Please order at the counter.',
            default => 'Please order at the counter.',
        };

        if ($message === null && RateLimiter::tooManyAttempts($this->limiterKey($table), self::ORDERS_PER_MINUTE)) {
            $message = 'That’s a lot of orders at once. Please wait a minute, or call the staff.';
        }

        if ($message === null && TableOrder::withoutGlobalScopes()
            ->where('dining_table_id', $table->id)
            ->where('status', TableOrder::NEW)
            ->count() >= self::MAX_WAITING_ORDERS) {
            $message = 'Your table has orders waiting for the staff to confirm. Please wait for them first.';
        }

        if ($message !== null) {
            throw ValidationException::withMessages(['order' => $message]);
        }
    }

    private function limiterKey(DiningTable $table): string
    {
        return 'table-order:'.$table->id;
    }

    /**
     * The products on sale at the branch, with their sizes.
     *
     * @return Collection<int, Product>
     */
    private function products(Merchant $merchant, Branch $branch): Collection
    {
        return Product::withoutGlobalScope('merchant')
            ->where('merchant_id', $merchant->id)
            ->where('is_active', true)
            ->with(['sizes', 'branchRows'])
            ->orderBy('name')
            ->get()
            ->filter(fn (Product $product) => $product->soldAt($branch->id))
            ->values();
    }

    /**
     * How many each product/size can still make from its recipe, only when
     * the store stops sales that run out of ingredients (otherwise the POS
     * only warns, and so does nothing here).
     *
     * @param  Collection<int, Product>  $products
     * @return array<int, array{product: int|null, sizes: array<int, int>}>
     */
    private function availability(Merchant $merchant, Branch $branch, Collection $products): array
    {
        return $merchant->inventory_blocks_sales ? app(InventoryService::class)->availability($products, $branch->id) : [];
    }

    /**
     * Only what a customer needs: never SKUs, barcodes, or stock counts.
     *
     * @param  Collection<int, Product>  $products
     * @return list<array<string, mixed>>
     */
    private function menuItems(Merchant $merchant, Branch $branch, Collection $products): array
    {
        $available = $this->availability($merchant, $branch, $products);

        return $products->map(function (Product $product) use ($available, $branch) {
            $stockOut = $product->stockAt($branch->id) !== null && $product->stockAt($branch->id) <= 0;
            $sizes = $product->sizes->map(fn ($size) => [
                'id' => $size->id,
                'name' => $size->name,
                'price_cents' => $size->price_cents,
                'sold_out' => $stockOut || ($available[$product->id]['sizes'][$size->id] ?? 1) <= 0,
            ])->values();

            return [
                'id' => $product->id,
                'category_id' => $product->category_id,
                'name' => $product->name,
                'image_url' => $product->imageUrl(),
                'price_cents' => $sizes->isEmpty() ? $product->price_cents : $sizes->min('price_cents'),
                'sizes' => $sizes->all(),
                'sold_out' => $sizes->isEmpty()
                    ? $stockOut || ($available[$product->id]['product'] ?? 1) <= 0
                    : $sizes->every(fn ($s) => $s['sold_out']),
            ];
        })->values()->all();
    }
}
