<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Enums\PaymentMethod;
use App\Models\Sale;
use App\Models\TableOrder;
use App\Services\TableOrders\TableOrderPayments;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Orders from the tables' QR codes, for the POS and any staff phone. Each
 * device follows one branch (staff tied to a branch always theirs).
 * TableOrder is merchant-scoped globally.
 */
class TableOrderController extends Controller
{
    /** Unpaid orders older than this are left off the screen (forgotten tabs). */
    private const OPEN_HOURS = 12;

    /** The orders screen, for a staff phone or tablet. */
    public function index(Request $request): Response
    {
        return Inertia::render('Orders/Index', [
            'active' => $request->user()->merchant->tableOrderingActive(),
        ]);
    }

    /**
     * Open orders and calls, polled every few seconds: of one branch (the
     * POS), or of every branch (?branch=all, any back-office page of a user
     * not tied to one branch). Each call also tells those branches' menus a
     * device is online to receive orders (see Merchant::tableOrderingState).
     */
    public function feed(Request $request, TableOrderPayments $payments): JsonResponse
    {
        $merchant = $request->user()->merchant;
        $branches = $this->branches($request);
        $names = $branches->pluck('name', 'id');

        if ($merchant->tableOrderingActive()) {
            $branches->each->markOrderDeviceSeen();
        }

        $orders = TableOrder::query()
            ->whereIn('branch_id', $branches->modelKeys())
            // Orders still waiting never age out: they count against the
            // table's limit until the staff accept or reject them.
            ->where(fn ($query) => $query
                ->where('status', TableOrder::NEW)
                ->orWhere(fn ($q) => $q
                    ->where('created_at', '>=', now()->subHours(self::OPEN_HOURS))
                    ->where(fn ($open) => $open
                        ->whereIn('status', [TableOrder::PREPARING, TableOrder::READY])
                        ->orWhere(fn ($served) => $served->where('status', TableOrder::SERVED)->whereNull('settled_at')))))
            ->with('items')
            ->oldest()
            ->get();

        // QR Ph payments confirm here too, if the customer closed their phone.
        $orders->each(function (TableOrder $order) use ($payments) {
            if ($order->payment_method === PaymentMethod::QrPh->value && ! $order->paid()) {
                $payments->refresh($order);
                $order->refresh()->load('items');
            }
        });

        // Following several branches: say which one each table is at.
        $label = fn (?int $branchId, string $table) => $branches->count() > 1 && isset($names[$branchId]) ? "{$table} · {$names[$branchId]}" : $table;

        return response()->json([
            'active' => $merchant->tableOrderingActive(),
            'branch' => $branches->count() === 1 ? ['id' => $branches->first()->id, 'name' => $branches->first()->name] : null,
            'paused' => $branches->every->ordering_paused,
            'orders' => $orders->map(fn (TableOrder $order) => [
                ...$order->forStaff(),
                'table_name' => $label($order->branch_id, $order->table_name),
                'paid' => $order->paid(),
            ])->values(),
            'server_time' => now()->toIso8601String(),
        ]);
    }

    /**
     * Accept, mark ready, mark served, or reject. Accepting is when the order
     * is paid for: cash and the store's QR are recorded as a sale now (the
     * staff collect or check it); QR Ph must already be paid. The receipt
     * comes back for the POS to print.
     */
    public function update(Request $request, TableOrder $order, TableOrderPayments $payments): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(array_keys(TableOrder::STATUS_TIMES))],
        ]);

        // Ask PayMongo first (outside the lock: it is a network call), so a
        // QR Ph payment that just landed is never rejected or kept waiting.
        if ($order->status === TableOrder::NEW && $order->payment_method === PaymentMethod::QrPh->value) {
            $payments->refresh($order);
        }

        // Two staff phones acting on the same order at once: the row is
        // locked and every check repeated on what is actually stored.
        [$code, $body] = DB::transaction(function () use ($data, $order, $payments, $request) {
            $order = TableOrder::withoutGlobalScopes()->lockForUpdate()->findOrFail($order->id);

            if ($data['status'] === TableOrder::REJECTED && $order->paid()) {
                return [409, ['message' => 'This order is already paid. Accept it, or refund the customer first.']];
            }

            if (! $order->canMoveTo($data['status'])) {
                return [409, ['message' => 'This order was already updated. The list has been refreshed.']];
            }

            $receipt = null;
            if ($order->status === TableOrder::NEW && $data['status'] !== TableOrder::REJECTED) {
                if ($order->payment_method === PaymentMethod::QrPh->value) {
                    if (! $order->paid()) {
                        return [409, ['message' => 'Waiting for the customer’s QR Ph payment. Accept it once it’s paid.']];
                    }
                } elseif (is_string($sale = $payments->settle($order, $request->user()))) {
                    return [422, ['message' => $sale]];
                }

                $order->refresh();
                $receipt = $payments->receipt(Sale::withoutGlobalScopes()->findOrFail($order->sale_id));
            }

            $order->status = $data['status'];
            $order->{TableOrder::STATUS_TIMES[$data['status']]} = now();
            // Accepting from "new" straight to ready still counts as accepted.
            $order->accepted_at ??= $data['status'] === TableOrder::REJECTED ? null : now();
            $order->save();

            return [200, ['ok' => true, 'receipt' => $receipt]];
        });

        return response()->json($body, $code);
    }

    /** Stop or resume taking orders from the tables of the branches followed. */
    public function pause(Request $request): JsonResponse
    {
        $data = $request->validate(['paused' => ['required', 'boolean']]);

        $this->branches($request)->each->update(['ordering_paused' => $data['paused']]);

        return response()->json(['ok' => true]);
    }

    /**
     * The branches this device follows: the user's own when tied to one;
     * every open branch for ?branch=all; else the one asked for (or main).
     *
     * @return Collection<int, Branch>
     */
    private function branches(Request $request)
    {
        if ($request->query('branch') === 'all' && $request->user()->branch_id === null) {
            $open = Branch::query()->where('is_active', true)->orderBy('id')->get();
            if ($open->isNotEmpty()) {
                return $open;
            }
        }

        return new Collection([Branch::forUser($request->user(), $request->integer('branch') ?: null)]);
    }
}
