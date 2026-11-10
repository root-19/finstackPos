<?php

namespace App\Services\Sales;

use App\Models\AuditLog;
use App\Models\Merchant;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SaleRefund;
use App\Models\User;
use App\Services\Inventory\InventoryService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Voids and refunds of stored sales. Both need the server (they are never
 * queued offline), lock the sale so two screens can't act on it at once,
 * and are written to the audit log with who did it, who approved it, and why.
 *
 * Void: the whole sale is cancelled, only on the business day it was made
 * and before any refund (a cashier's mistake caught at the counter). After
 * that, items are refunded instead, which reports count on the refund's day.
 */
class SaleAdjustments
{
    /** Each refund's share of these sale amounts, in proportion to the items given back. */
    private const SHARED = ['vat_exempt_cents', 'discount_cents', 'service_charge_cents', 'tax_cents', 'total_cents'];

    public function __construct(private readonly InventoryService $inventory) {}

    /**
     * @throws ValidationException
     */
    public function void(Sale $sale, User $actor, ?User $approver, string $reason, bool $restock): Sale
    {
        return DB::transaction(function () use ($sale, $actor, $approver, $reason, $restock) {
            $sale = Sale::withoutGlobalScopes()->lockForUpdate()->findOrFail($sale->id);
            $merchant = Merchant::findOrFail($sale->merchant_id);

            if ($sale->isVoided()) {
                throw $this->conflict('This sale was already voided.');
            }
            if ($sale->refunded_cents > 0 || $sale->status !== Sale::COMPLETED) {
                throw $this->conflict('This sale already has a refund, so it can’t be voided. Refund the remaining items instead.');
            }
            if (! $sale->sold_at->copy()->setTimezone($merchant->timezone)->isSameDay(now($merchant->timezone))) {
                throw $this->conflict('Only today’s sales can be voided. Refund the items instead.');
            }

            $old = ['status' => $sale->status];
            $sale->forceFill([
                'status' => Sale::VOIDED,
                'voided_at' => now(),
                'voided_by' => $actor->id,
                'void_approved_by' => $approver?->id,
                'void_reason' => $reason,
            ])->save();

            if ($restock) {
                $items = SaleItem::query()->where('sale_id', $sale->id)->get();
                $this->inventory->returnForSale($sale, $items->map(fn (SaleItem $i) => [
                    'product_id' => $i->product_id,
                    'quantity' => $i->quantity,
                    'options' => $i->options,
                ]), $actor->id, "Void: {$reason}");
            }

            AuditLog::record($sale, 'sale.voided', $old, [
                'status' => Sale::VOIDED,
                'total_cents' => $sale->total_cents,
                'restocked' => $restock,
                'approved_by' => $approver?->name,
            ], $reason);

            return $sale;
        });
    }

    /**
     * Refund some or all of the items still on a sale. Sending the same
     * client_uuid again returns the refund already made.
     *
     * @param  array{client_uuid: string, method: string, reason: string, restock: bool, items: list<array{sale_item_id: int, quantity: int}>}  $data
     *
     * @throws ValidationException
     */
    public function refund(Sale $sale, User $actor, ?User $approver, array $data): SaleRefund
    {
        $existing = SaleRefund::withoutGlobalScopes()
            ->where('merchant_id', $sale->merchant_id)
            ->where('client_uuid', $data['client_uuid'])
            ->first();
        if ($existing) {
            return $existing;
        }

        return DB::transaction(function () use ($sale, $actor, $approver, $data) {
            $sale = Sale::withoutGlobalScopes()->lockForUpdate()->findOrFail($sale->id);

            if ($sale->isVoided()) {
                throw $this->conflict('This sale was voided, so there is nothing to refund.');
            }

            $items = SaleItem::query()->where('sale_id', $sale->id)->get()->keyBy('id');
            $lines = collect($data['items'])->groupBy('sale_item_id')->map(fn ($group, $id) => [
                'sale_item_id' => (int) $id,
                'quantity' => (int) $group->sum('quantity'),
            ])->filter(fn ($l) => $l['quantity'] > 0)->values();

            if ($lines->isEmpty()) {
                throw ValidationException::withMessages(['items' => 'Choose at least one item to refund.']);
            }

            foreach ($lines as $line) {
                $item = $items->get($line['sale_item_id']);
                if ($item === null) {
                    throw ValidationException::withMessages(['items' => 'That item is not on this sale.']);
                }
                if ($line['quantity'] > $item->refundableQuantity()) {
                    throw $this->conflict($item->refundableQuantity() === 0
                        ? "{$item->name} was already refunded."
                        : "Only {$item->refundableQuantity()} of {$item->name} can still be refunded.");
                }
            }

            // The refund's share of each amount: everything refunded so far,
            // this one included, in proportion to the subtotal, less what
            // earlier refunds took. Rounding never drifts, and the refund that
            // empties the sale takes exactly what is left of each amount.
            $subtotal = (int) $lines->sum(fn ($l) => $items[$l['sale_item_id']]->unit_price_cents * $l['quantity']);
            $before = SaleRefund::withoutGlobalScopes()
                ->where('sale_id', $sale->id)
                ->selectRaw('coalesce(sum(subtotal_cents), 0) as subtotal_cents, coalesce(sum(vat_exempt_cents), 0) as vat_exempt_cents,
                    coalesce(sum(discount_cents), 0) as discount_cents, coalesce(sum(service_charge_cents), 0) as service_charge_cents,
                    coalesce(sum(tax_cents), 0) as tax_cents, coalesce(sum(amount_cents), 0) as total_cents')
                ->first();
            $refundedSubtotal = (int) $before->subtotal_cents + $subtotal;
            $share = [];
            foreach (self::SHARED as $column) {
                $soFar = $sale->subtotal_cents > 0
                    ? intdiv((int) $sale->{$column} * $refundedSubtotal * 2 + $sale->subtotal_cents, $sale->subtotal_cents * 2)
                    : 0;
                $share[$column] = max(0, $soFar - (int) $before->{$column});
            }

            $refund = new SaleRefund([
                'client_uuid' => $data['client_uuid'],
                'method' => $data['method'],
                'reason' => $data['reason'],
                'restocked' => $data['restock'],
                'subtotal_cents' => $subtotal,
                'vat_exempt_cents' => $share['vat_exempt_cents'],
                'discount_cents' => $share['discount_cents'],
                'service_charge_cents' => $share['service_charge_cents'],
                'tax_cents' => $share['tax_cents'],
                'amount_cents' => $share['total_cents'],
                'refunded_at' => now(),
            ]);
            $refund->merchant_id = $sale->merchant_id;
            $refund->branch_id = $sale->branch_id;
            $refund->sale_id = $sale->id;
            $refund->user_id = $actor->id;
            $refund->approved_by = $approver?->id;
            $refund->save();

            foreach ($lines as $line) {
                $item = $items[$line['sale_item_id']];
                $refund->items()->create([
                    'sale_item_id' => $item->id,
                    'quantity' => $line['quantity'],
                    'amount_cents' => $item->unit_price_cents * $line['quantity'],
                ]);
                $item->increment('refunded_quantity', $line['quantity']);
            }

            $old = ['status' => $sale->status, 'refunded_cents' => $sale->refunded_cents];
            $allBack = $items->every(fn (SaleItem $i) => $i->refresh()->refundableQuantity() === 0);
            $sale->forceFill([
                'refunded_cents' => $sale->refunded_cents + $refund->amount_cents,
                'status' => $allBack ? Sale::REFUNDED : Sale::PARTIALLY_REFUNDED,
            ])->save();

            if ($data['restock']) {
                $this->inventory->returnForSale($sale, $lines->map(fn ($l) => [
                    'product_id' => $items[$l['sale_item_id']]->product_id,
                    'quantity' => $l['quantity'],
                    'options' => $items[$l['sale_item_id']]->options,
                ]), $actor->id, "Refund: {$data['reason']}");
            }

            AuditLog::record($sale, 'sale.refunded', $old, [
                'status' => $sale->status,
                'refunded_cents' => $sale->refunded_cents,
                'refund_id' => $refund->id,
                'amount_cents' => $refund->amount_cents,
                'method' => $refund->method,
                'items' => $lines->map(fn ($l) => ['name' => $items[$l['sale_item_id']]->name, 'quantity' => $l['quantity']])->all(),
                'restocked' => $data['restock'],
                'approved_by' => $approver?->name,
            ], $data['reason']);

            return $refund;
        });
    }

    private function conflict(string $message): ValidationException
    {
        return ValidationException::withMessages(['sale' => $message])->status(409);
    }
}
