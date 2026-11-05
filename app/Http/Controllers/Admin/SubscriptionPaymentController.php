<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Merchant;
use App\Models\SubscriptionPayment;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Every subscription payment and plan change across all stores.
 */
class SubscriptionPaymentController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
            'status' => ['nullable', Rule::in(['paid', 'unpaid'])],
            'provider' => ['nullable', Rule::in(['paymongo', 'manual', 'trial'])],
        ]);
        $from = Carbon::parse($filters['from'] ?? now()->startOfMonth()->toDateString())->startOfDay();
        $to = Carbon::parse($filters['to'] ?? now()->toDateString())->endOfDay();

        $query = AdminDashboardController::payments()
            ->whereBetween('created_at', [$from, $to])
            ->when($filters['status'] ?? null, fn ($q, $s) => $s === 'paid' ? $q->whereNotNull('period_end') : $q->whereNull('period_end'))
            ->when($filters['provider'] ?? null, fn ($q, $p) => $q->where('provider', $p));

        $paidOnline = (clone $query)->where('provider', 'paymongo')->whereNotNull('period_end');
        $stores = Merchant::query()->pluck('name', 'id');

        return Inertia::render('Admin/Subscriptions', [
            'payments' => (clone $query)->with('user:id,name')->latest()->paginate(50)->withQueryString()->through(fn (SubscriptionPayment $p) => [
                'id' => $p->id,
                'store_id' => $p->merchant_id,
                'store' => $stores[$p->merchant_id] ?? 'Deleted store',
                'created_at' => $p->created_at->toIso8601String(),
                'months' => $p->months,
                'amount_cents' => $p->amount_cents,
                'provider' => $p->provider,
                'applied' => $p->applied(),
                'expired' => ! $p->applied() && $p->created_at->lt(now()->subMinutes(15)),
                'period_end' => $p->period_end?->toIso8601String(),
                'reference' => $p->provider_id,
                'note' => $p->note,
                'by' => $p->user?->name,
            ]),
            'totals' => [
                'revenue_cents' => (int) $paidOnline->sum('amount_cents'),
                'paid' => (clone $query)->whereNotNull('period_end')->count(),
                'months_sold' => (int) (clone $query)->where('provider', 'paymongo')->whereNotNull('period_end')->sum('months'),
                'unpaid' => (clone $query)->whereNull('period_end')->count(),
            ],
            'filters' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'status' => $filters['status'] ?? null,
                'provider' => $filters['provider'] ?? null,
            ],
        ]);
    }
}
