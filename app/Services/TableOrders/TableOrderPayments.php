<?php

namespace App\Services\TableOrders;

use App\Enums\PaymentMethod;
use App\Models\Merchant;
use App\Models\PaymentIntent;
use App\Models\Sale;
use App\Models\TableOrder;
use App\Models\User;
use App\Services\PayMongo;
use App\Services\Sales\SaleRecorder;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Turns a paid table order into a sale (with its receipt): when the staff
 * accept a cash or store-QR order, or as soon as PayMongo confirms a QR Ph
 * payment (even with nobody signed in).
 */
class TableOrderPayments
{
    /** Seconds between asking PayMongo about the same payment. */
    private const CHECK_EVERY = 4;

    public function __construct(private readonly SaleRecorder $sales) {}

    /**
     * Ask PayMongo whether an unpaid QR Ph order has been paid; if so, record
     * its sale. Cheap to call often: it asks at most every few seconds.
     */
    public function refresh(TableOrder $order): void
    {
        if ($order->payment_method !== PaymentMethod::QrPh->value || $order->paid() || $order->status === TableOrder::REJECTED) {
            return;
        }

        $intent = PaymentIntent::withoutGlobalScopes()->find($order->payment_intent_id);
        if (! $intent) {
            return;
        }

        $merchant = Merchant::findOrFail($order->merchant_id);
        if (! $intent->succeeded() && $intent->updated_at->lte(now()->subSeconds(self::CHECK_EVERY)) && ($gateway = PayMongo::forMerchant($merchant))) {
            try {
                $intent->status = $gateway->intentStatus($intent->provider_id);
                // Counts as a check even when nothing changed.
                $intent->updated_at = now();
                $intent->save();
            } catch (Throwable) {
                // Unreachable: the next poll asks again.
            }
        }

        if ($intent->succeeded()) {
            $this->settle($order, null);
        }
    }

    /**
     * Record the order's sale at its branch: what it cost when placed, paid
     * in full. Returns the sale, or why it couldn't be recorded.
     */
    public function settle(TableOrder $order, ?User $user): Sale|string
    {
        return DB::transaction(function () use ($order, $user) {
            // One sale per order, even with the customer and staff both confirming.
            $order = TableOrder::withoutGlobalScopes()->lockForUpdate()->with('items')->findOrFail($order->id);
            if ($order->paid()) {
                return Sale::withoutGlobalScopes()->findOrFail($order->sale_id);
            }

            $merchant = Merchant::findOrFail($order->merchant_id);
            $intent = $order->payment_intent_id ? PaymentIntent::withoutGlobalScopes()->find($order->payment_intent_id) : null;
            $items = $order->items->filter(fn ($item) => $item->product_id !== null);
            if ($items->isEmpty()) {
                return 'The products in this order are no longer in the store.';
            }

            $error = $this->sales->record($merchant, $user, $order->branch_id ?? $merchant->mainBranch()->id, [
                // The order's own id: recording it twice is a no-op.
                'client_uuid' => $order->public_token,
                'sold_at' => now()->toIso8601String(),
                'payment_method' => $order->payment_method,
                'payment_reference' => $order->payment_method === PaymentMethod::QrPh->value ? $intent?->provider_id : $order->payment_reference,
                'amount_paid_cents' => $order->total_cents,
                'items' => $items->map(fn ($item) => [
                    'product_id' => $item->product_id,
                    'quantity' => $item->quantity,
                    'unit_price_cents' => $item->unit_price_cents,
                    'options' => $item->options ?? [],
                ])->values()->all(),
                'table_order_ids' => [$order->id],
                'serve_table_orders' => false,
            ]);

            if ($error !== null) {
                return $error;
            }

            return Sale::withoutGlobalScopes()->where('merchant_id', $merchant->id)->where('client_uuid', $order->public_token)->firstOrFail();
        });
    }

    /**
     * What the POS prints (see ReceiptData in resources/js/Components/Receipt.tsx).
     *
     * @return array<string, mixed>
     */
    public function receipt(Sale $sale): array
    {
        $sale->loadMissing(['items', 'user:id,name']);

        return [
            'reference' => strtoupper(substr($sale->client_uuid, 0, 8)),
            'sold_at' => $sale->sold_at->toIso8601String(),
            'cashier' => $sale->user?->name,
            'items' => $sale->items->map(fn ($item) => [
                'name' => $item->name,
                'options' => $item->options,
                'quantity' => $item->quantity,
                'unit_price_cents' => $item->unit_price_cents,
                'line_total_cents' => $item->line_total_cents,
            ])->values()->all(),
            'subtotal_cents' => $sale->subtotal_cents,
            'discount_type' => $sale->discount_type,
            'discount_id_number' => $sale->discount_id_number,
            'discount_customer_name' => $sale->discount_customer_name,
            'vat_exempt_cents' => $sale->vat_exempt_cents,
            'discount_cents' => $sale->discount_cents,
            'service_charge_cents' => $sale->service_charge_cents,
            'tax_cents' => $sale->tax_cents,
            'total_cents' => $sale->total_cents,
            'payment_method' => $sale->payment_method->value,
            'payment_reference' => $sale->payment_reference,
            'amount_paid_cents' => $sale->amount_paid_cents,
            'change_cents' => $sale->change_cents,
        ];
    }
}
