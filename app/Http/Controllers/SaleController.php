<?php

namespace App\Http\Controllers;

use App\Enums\PaymentMethod;
use App\Models\Branch;
use App\Models\Sale;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class SaleController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
            'branch' => ['nullable', 'integer'],
        ]);

        // Dates are picked in the store's local time; sold_at is stored in UTC.
        $timezone = $request->user()->merchant->timezone;

        $filtered = Sale::query()
            ->when($filters['from'] ?? null, fn ($query, string $from) => $query->where(
                'sold_at', '>=', Carbon::parse($from, $timezone)->startOfDay()->utc(),
            ))
            ->when($filters['to'] ?? null, fn ($query, string $to) => $query->where(
                'sold_at', '<=', Carbon::parse($to, $timezone)->endOfDay()->utc(),
            ))
            ->when($filters['payment_method'] ?? null, fn ($query, string $method) => $query->where('payment_method', $method))
            ->when($filters['branch'] ?? null, fn ($query, int $branch) => $query->where('branch_id', $branch));

        $today = Sale::query()->whereBetween('sold_at', [
            now($timezone)->startOfDay()->utc(),
            now($timezone)->endOfDay()->utc(),
        ]);

        $sales = (clone $filtered)
            ->with(['user:id,name', 'branch:id,name'])
            ->withCount('items')
            ->latest('sold_at')
            ->paginate(20)
            ->withQueryString()
            ->through(fn (Sale $sale) => [
                'id' => $sale->id,
                'reference' => $sale->reference(),
                'sold_at' => $sale->sold_at->toIso8601String(),
                'cashier' => $sale->user?->name,
                'branch' => $sale->branch?->name,
                'items_count' => $sale->items_count,
                'payment_method' => $sale->payment_method,
                'total_cents' => $sale->total_cents,
            ]);

        return Inertia::render('Sales/Index', [
            'sales' => $sales,
            'summary' => [
                'today_total_cents' => (int) (clone $today)->sum('total_cents'),
                'today_count' => (clone $today)->count(),
                'filtered_total_cents' => (int) (clone $filtered)->sum('total_cents'),
                'filtered_count' => (clone $filtered)->count(),
            ],
            'filters' => [
                'from' => $filters['from'] ?? '',
                'to' => $filters['to'] ?? '',
                'payment_method' => $filters['payment_method'] ?? '',
                'branch' => (string) ($filters['branch'] ?? ''),
            ],
            // Staff tied to a branch only ever see it, so they get no filter.
            'branches' => $request->user()->branch_id === null && Branch::query()->count() > 1
                ? Branch::query()->orderBy('id')->get(['id', 'name'])
                : [],
        ]);
    }

    public function show(Sale $sale): Response
    {
        $sale->load(['user:id,name', 'branch:id,name', 'items']);

        return Inertia::render('Sales/Show', [
            'sale' => [
                'id' => $sale->id,
                'reference' => $sale->reference(),
                'sold_at' => $sale->sold_at->toIso8601String(),
                'synced_at' => $sale->created_at->toIso8601String(),
                'cashier' => $sale->user?->name,
                'branch' => $sale->branch?->name,
                'payment_method' => $sale->payment_method,
                'payment_reference' => $sale->payment_reference,
                'subtotal_cents' => $sale->subtotal_cents,
                'discount_type' => $sale->discount_type,
                'discount_id_number' => $sale->discount_id_number,
                'discount_customer_name' => $sale->discount_customer_name,
                'discount_doh_check' => $sale->discount_doh_check,
                'vat_exempt_cents' => $sale->vat_exempt_cents,
                'discount_cents' => $sale->discount_cents,
                'service_charge_cents' => $sale->service_charge_cents,
                'tax_cents' => $sale->tax_cents,
                'total_cents' => $sale->total_cents,
                'amount_paid_cents' => $sale->amount_paid_cents,
                'change_cents' => $sale->change_cents,
                'items' => $sale->items->map->only([
                    'id', 'name', 'options', 'unit_price_cents', 'quantity', 'line_total_cents',
                ]),
            ],
        ]);
    }
}
