<?php

namespace App\Services\Sales;

use App\Enums\PaymentMethod;
use App\Models\BranchProduct;
use App\Models\DiningTable;
use App\Models\Merchant;
use App\Models\PaymentIntent;
use App\Models\Product;
use App\Models\Sale;
use App\Models\TableOrder;
use App\Models\User;
use App\Services\Inventory\InventoryService;
use App\Services\PayMongo;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

/**
 * Stores a sale: from a register (POS sync) or from a paid table order.
 * Totals are always recomputed here, stock and recipe ingredients are used
 * up at the sale's branch, and storing the same sale twice is a no-op.
 *
 * Every lookup names the store, so this also works without a signed-in
 * user (a customer's QR Ph payment confirming on its own).
 */
class SaleRecorder
{
    public function __construct(private readonly InventoryService $inventory) {}

    /**
     * Store one validated sale at a branch. Returns an error message, or
     * null on success (also when it was already stored).
     *
     * Unit prices are the ones the customer was shown (prices may have
     * changed since, e.g. while a register was offline).
     *
     * @param  array<string, mixed>  $data  client_uuid, sold_at, payment_method, payment_reference?, amount_paid_cents,
     *                                      discount_*?, items[], table_order_ids?, serve_table_orders?
     */
    public function record(Merchant $merchant, ?User $user, int $branchId, array $data): ?string
    {
        if (Sale::withoutGlobalScopes()->where('merchant_id', $merchant->id)->where('client_uuid', $data['client_uuid'])->exists()) {
            return null;
        }

        $items = collect($data['items']);

        // This store's products only; trashed ones still count so a sale made
        // before a product was deleted can be stored.
        $productIds = $items->pluck('product_id')->unique();
        $products = Product::withoutGlobalScopes()->where('merchant_id', $merchant->id)->whereKey($productIds)->get()->keyBy('id');

        if ($products->count() !== $productIds->count()) {
            return 'The sale contains products that do not belong to this store.';
        }

        $lines = $items->map(fn (array $item) => [
            'product_id' => $item['product_id'],
            'name' => $products[$item['product_id']]->name,
            // Snapshot as shown on the receipt; option names are display text.
            'options' => ($item['options'] ?? []) ?: null,
            'unit_price_cents' => $item['unit_price_cents'],
            'quantity' => $item['quantity'],
            'line_total_cents' => $item['unit_price_cents'] * $item['quantity'],
        ]);

        $discountType = $data['discount_type'] ?? null;

        if ($discountType !== null && ! $merchant->allowsDiscount($discountType)) {
            return 'This store does not offer that discount.';
        }

        $subtotal = $lines->sum('line_total_cents');
        $totals = $merchant->computeTotals($subtotal, $discountType);
        $total = $totals['total'];

        if ($data['amount_paid_cents'] < $total) {
            return 'The amount paid is less than the sale total.';
        }

        $intent = null;

        if ($data['payment_method'] === PaymentMethod::QrPh->value) {
            $intent = $this->verifiedQrPayment($merchant, $data['payment_reference'], $total);

            if (is_string($intent)) {
                return $intent;
            }
        }

        try {
            DB::transaction(function () use ($merchant, $user, $branchId, $data, $lines, $subtotal, $totals, $discountType, $intent) {
                $sale = new Sale([
                    'client_uuid' => $data['client_uuid'],
                    'payment_method' => $data['payment_method'],
                    'payment_reference' => $data['payment_reference'] ?? null,
                    'subtotal_cents' => $subtotal,
                    'discount_type' => $discountType,
                    'discount_id_number' => $discountType ? $data['discount_id_number'] : null,
                    'discount_customer_name' => $discountType ? $data['discount_customer_name'] : null,
                    'discount_doh_check' => $discountType === 'pwd' ? ($data['discount_doh_check'] ?? null) : null,
                    'vat_exempt_cents' => $totals['vat_exempt'],
                    'discount_cents' => $totals['discount'],
                    'service_charge_cents' => $totals['service_charge'],
                    'tax_cents' => $totals['tax'],
                    'total_cents' => $totals['total'],
                    'amount_paid_cents' => $data['amount_paid_cents'],
                    'change_cents' => $data['amount_paid_cents'] - $totals['total'],
                    'sold_at' => Carbon::parse($data['sold_at'])->utc(),
                ]);
                $sale->merchant()->associate($merchant);
                $sale->user()->associate($user);
                $sale->branch_id = $branchId;
                $sale->save();

                // Claim the payment atomically so it can never pay for two sales.
                if ($intent && ! PaymentIntent::withoutGlobalScopes()->whereKey($intent->id)->whereNull('sale_id')->update(['sale_id' => $sale->id])) {
                    throw new RuntimeException('The QR Ph payment was already used for another sale.');
                }

                $sale->items()->createMany($lines->all());

                foreach ($lines as $line) {
                    // The overall stock, then the selling branch's own.
                    $tracked = Product::withoutGlobalScopes()
                        ->whereKey($line['product_id'])
                        ->whereNotNull('stock')
                        ->decrement('stock', $line['quantity']);

                    if ($tracked && BranchProduct::query()->where('product_id', $line['product_id'])->whereNotNull('stock')->exists()) {
                        BranchProduct::query()
                            ->firstOrCreate(['product_id' => $line['product_id'], 'branch_id' => $sale->branch_id], ['stock' => 0])
                            ->decrement('stock', $line['quantity']);
                    }
                }

                // Use up the ingredients and materials in each product's recipe.
                $this->inventory->consumeForSale($sale, $lines, $user?->id);

                $this->settleTableOrders($merchant, $sale, $data['table_order_ids'] ?? [], $data['serve_table_orders'] ?? true);
            });
        } catch (UniqueConstraintViolationException) {
            // A concurrent request stored the same sale first.
        } catch (RuntimeException $e) {
            return $e->getMessage();
        }

        return null;
    }

    /**
     * The table orders this sale paid for: settled (an order already paid
     * stays with the sale that paid it). A bill charged at the POS also
     * marks them served: they reached the table before it was paid.
     *
     * @param  list<int>  $orderIds
     */
    private function settleTableOrders(Merchant $merchant, Sale $sale, array $orderIds, bool $serve): void
    {
        if ($orderIds === []) {
            return;
        }

        $orders = TableOrder::withoutGlobalScopes()
            ->where('merchant_id', $merchant->id)
            ->whereKey($orderIds)
            ->whereNull('settled_at')
            ->where('status', '!=', TableOrder::REJECTED)
            ->get();

        foreach ($orders as $order) {
            $order->forceFill([
                'settled_at' => now(),
                'sale_id' => $sale->id,
                'payment_status' => TableOrder::PAID,
                'payment_qr' => null,
                ...($serve ? [
                    'status' => TableOrder::SERVED,
                    'served_at' => $order->served_at ?? now(),
                    'accepted_at' => $order->accepted_at ?? now(),
                ] : []),
            ])->save();
        }

        DiningTable::withoutGlobalScopes()
            ->whereKey($orders->pluck('dining_table_id')->filter()->unique())
            ->update(['bill_requested_at' => null]);
    }

    /**
     * A QR Ph payment this store started, not yet used, for exactly this
     * total, and confirmed paid (asking PayMongo again if needed).
     * Returns the payment, or why it can't be accepted.
     */
    private function verifiedQrPayment(Merchant $merchant, string $reference, int $total): PaymentIntent|string
    {
        $intent = PaymentIntent::withoutGlobalScopes()
            ->where('merchant_id', $merchant->id)
            ->where('provider_id', $reference)
            ->whereNull('sale_id')
            ->first();

        if ($intent === null) {
            return 'The QR Ph payment could not be found or was already used.';
        }

        if ($intent->amount_cents !== $total) {
            return 'The QR Ph payment amount does not match the sale total.';
        }

        if (! $intent->succeeded() && ($gateway = PayMongo::forMerchant($merchant))) {
            try {
                $intent->update(['status' => $gateway->intentStatus($intent->provider_id)]);
            } catch (Throwable) {
                // Gateway unreachable: rejected for now; it can be retried.
            }
        }

        if (! $intent->succeeded()) {
            return 'The QR Ph payment has not been completed.';
        }

        return $intent;
    }
}
