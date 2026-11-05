<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Merchant;
use App\Models\SubscriptionPayment;
use App\Services\SubscriptionService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Every store on FinstackPOS, its plan, and plan changes made by an
 * administrator. Each change is kept in the store's payment history.
 */
class StoreController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'plan' => ['nullable', Rule::in(['pro', 'trial', 'free', 'expiring', 'expired', 'suspended'])],
            'sort' => ['nullable', Rule::in(['newest', 'expiring', 'name'])],
        ]);
        $now = now();

        $stores = Merchant::query()
            ->when($filters['search'] ?? null, function ($q, $search) {
                $ids = DB::table('users')->where('email', 'like', "%{$search}%")->whereNotNull('merchant_id')->pluck('merchant_id');
                $q->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('slug', 'like', "%{$search}%")->orWhereIn('id', $ids));
            })
            ->when($filters['plan'] ?? null, fn ($q, $plan) => match ($plan) {
                // Paying: Pro beyond any trial.
                'pro' => $q->where('subscribed_until', '>', $now)->where(fn ($q) => $q->whereNull('trial_ends_at')->orWhereColumn('subscribed_until', '>', 'trial_ends_at')),
                'trial' => $q->where('trial_ends_at', '>', $now)->whereColumn('subscribed_until', '<=', 'trial_ends_at'),
                'free' => $q->where(fn ($q) => $q->whereNull('subscribed_until')->orWhere('subscribed_until', '<=', $now)),
                'expiring' => $q->whereBetween('subscribed_until', [$now, $now->copy()->addDays(7)])->where(fn ($q) => $q->whereNull('trial_ends_at')->orWhereColumn('subscribed_until', '>', 'trial_ends_at')),
                'expired' => $q->where('subscribed_until', '<=', $now),
                'suspended' => $q->where('is_active', false),
            })
            ->when(($filters['sort'] ?? 'newest') === 'expiring', fn ($q) => $q->orderByRaw('subscribed_until is null')->orderBy('subscribed_until'))
            ->when(($filters['sort'] ?? 'newest') === 'name', fn ($q) => $q->orderBy('name'))
            ->when(($filters['sort'] ?? 'newest') === 'newest', fn ($q) => $q->latest('id'))
            ->paginate(25)
            ->withQueryString();

        $ids = $stores->getCollection()->modelKeys();
        $products = DB::table('products')->whereIn('merchant_id', $ids)->whereNull('deleted_at')->selectRaw('merchant_id, count(*) as n')->groupBy('merchant_id')->pluck('n', 'merchant_id');
        $users = DB::table('users')->whereIn('merchant_id', $ids)->selectRaw('merchant_id, count(*) as n')->groupBy('merchant_id')->pluck('n', 'merchant_id');
        $lastSale = DB::table('sales')->whereIn('merchant_id', $ids)->selectRaw('merchant_id, max(sold_at) as at')->groupBy('merchant_id')->pluck('at', 'merchant_id');
        $branches = DB::table('branches')->whereIn('merchant_id', $ids)->selectRaw('merchant_id, count(*) as n')->groupBy('merchant_id')->pluck('n', 'merchant_id');
        $owners = AdminDashboardController::ownerEmails();

        return Inertia::render('Admin/Stores/Index', [
            'stores' => $stores->through(fn (Merchant $m) => [
                'id' => $m->id,
                'name' => $m->name,
                'slug' => $m->slug,
                'owner' => $owners[$m->id] ?? null,
                'is_active' => $m->is_active,
                'pro' => $m->isSubscribed(),
                'trial' => $m->onTrial(),
                'until' => $m->subscribed_until?->toIso8601String(),
                'days_left' => AdminDashboardController::daysLeft($m),
                'products' => (int) ($products[$m->id] ?? 0),
                'users' => (int) ($users[$m->id] ?? 0),
                'branches' => (int) ($branches[$m->id] ?? 0),
                'last_sale_at' => isset($lastSale[$m->id]) ? Carbon::parse($lastSale[$m->id], 'UTC')->toIso8601String() : null,
                'created_at' => $m->created_at->toIso8601String(),
            ]),
            'filters' => ['search' => $filters['search'] ?? '', 'plan' => $filters['plan'] ?? null, 'sort' => $filters['sort'] ?? 'newest'],
        ]);
    }

    public function show(Merchant $store): Response
    {
        $sales = DB::table('sales')->where('merchant_id', $store->id)->selectRaw('count(*) as n, coalesce(sum(total_cents), 0) as total, max(sold_at) as last_at, min(sold_at) as first_at')->first();
        $since = now()->subDays(30);
        $recent = DB::table('sales')->where('merchant_id', $store->id)->where('sold_at', '>=', $since)->selectRaw('count(*) as n, coalesce(sum(total_cents), 0) as total')->first();

        return Inertia::render('Admin/Stores/Show', [
            'store' => [
                'id' => $store->id,
                'name' => $store->name,
                'slug' => $store->slug,
                'address' => $store->address,
                'contact_number' => $store->contact_number,
                'tin' => $store->tin,
                'timezone' => $store->timezone,
                'is_active' => $store->is_active,
                'pro' => $store->isSubscribed(),
                'trial' => $store->onTrial(),
                'trial_ends_at' => $store->trial_ends_at?->toIso8601String(),
                'until' => $store->subscribed_until?->toIso8601String(),
                'days_left' => AdminDashboardController::daysLeft($store),
                'created_at' => $store->created_at->toIso8601String(),
            ],
            'people' => DB::table('users')->where('merchant_id', $store->id)->orderByRaw("case role when 'owner' then 0 else 1 end")->orderBy('name')
                ->get(['id', 'name', 'email', 'role', 'created_at'])
                ->map(fn ($u) => [...(array) $u, 'created_at' => Carbon::parse($u->created_at, 'UTC')->toIso8601String()]),
            'stats' => [
                'products' => DB::table('products')->where('merchant_id', $store->id)->whereNull('deleted_at')->count(),
                'employees' => DB::table('employees')->where('merchant_id', $store->id)->whereNull('deleted_at')->count(),
                'sales' => (int) $sales->n,
                'sales_cents' => (int) $sales->total,
                'sales_30d' => (int) $recent->n,
                'sales_30d_cents' => (int) $recent->total,
                'first_sale_at' => $sales->first_at ? Carbon::parse($sales->first_at, 'UTC')->toIso8601String() : null,
                'last_sale_at' => $sales->last_at ? Carbon::parse($sales->last_at, 'UTC')->toIso8601String() : null,
                'currency' => $store->currency,
            ],
            'branches' => DB::table('branches')
                ->where('branches.merchant_id', $store->id)
                ->leftJoin('sales', 'sales.branch_id', '=', 'branches.id')
                ->groupBy('branches.id', 'branches.name', 'branches.is_active')
                ->orderBy('branches.id')
                ->selectRaw('branches.id, branches.name, branches.is_active, count(sales.id) as sales, coalesce(sum(sales.total_cents), 0) as total, coalesce(sum(case when sales.sold_at >= ? then sales.total_cents else 0 end), 0) as total_30d, max(sales.sold_at) as last_at', [$since])
                ->get()
                ->map(fn ($b) => [
                    'id' => $b->id,
                    'name' => $b->name,
                    'is_active' => (bool) $b->is_active,
                    'sales' => (int) $b->sales,
                    'sales_cents' => (int) $b->total,
                    'sales_30d_cents' => (int) $b->total_30d,
                    'last_sale_at' => $b->last_at ? Carbon::parse($b->last_at, 'UTC')->toIso8601String() : null,
                ]),
            'payments' => AdminDashboardController::payments()->with('user:id,name')->where('merchant_id', $store->id)->latest()->get()->map(fn (SubscriptionPayment $p) => [
                'id' => $p->id,
                'created_at' => $p->created_at->toIso8601String(),
                'months' => $p->months,
                'amount_cents' => $p->amount_cents,
                'provider' => $p->provider,
                'applied' => $p->applied(),
                'status' => $p->status,
                'period_start' => $p->period_start?->toIso8601String(),
                'period_end' => $p->period_end?->toIso8601String(),
                'note' => $p->note,
                'by' => $p->user?->name,
            ]),
        ]);
    }

    /** Add Pro months without an online payment (cash, bank transfer, promos). */
    public function grant(Request $request, Merchant $store, SubscriptionService $subscriptions): RedirectResponse
    {
        $data = $request->validate([
            'months' => ['required', 'integer', 'min:1', 'max:120'],
            'note' => ['nullable', 'string', 'max:200'],
        ]);
        $payment = $subscriptions->grant($store, $data['months'], $this->note($request, $data['note'] ?? "Added {$data['months']} month(s)"));

        return back()->with('success', "{$store->name} is on Pro until {$payment->period_end->toFormattedDayDateString()}.");
    }

    /** Correct the paid-up date directly (e.g. after a refund or a mistake). */
    public function setEnd(Request $request, Merchant $store): RedirectResponse
    {
        $data = $request->validate([
            'until' => ['required', 'date_format:Y-m-d'],
            'note' => ['required', 'string', 'min:3', 'max:200'],
        ]);
        $until = Carbon::parse($data['until'], $store->timezone)->endOfDay()->utc();
        $this->change($request, $store, $until, "End date set to {$data['until']}: {$data['note']}");

        return back()->with('success', $until->isFuture() ? "{$store->name} is on Pro until {$data['until']}." : "{$store->name} is now on the free plan.");
    }

    /** Stop Pro now; the store keeps its data and falls back to the free plan. */
    public function endNow(Request $request, Merchant $store): RedirectResponse
    {
        $data = $request->validate(['note' => ['required', 'string', 'min:3', 'max:200']]);
        $this->change($request, $store, now(), "Pro ended: {$data['note']}");

        return back()->with('success', "{$store->name} is now on the free plan.");
    }

    /** Suspend (nobody in the store can sign in to it) or reactivate a store. */
    public function toggleActive(Merchant $store): RedirectResponse
    {
        $store->is_active = ! $store->is_active;
        $store->save();

        return back()->with('success', $store->is_active ? "{$store->name} was reactivated." : "{$store->name} was suspended.");
    }

    private function change(Request $request, Merchant $store, Carbon $until, string $note): void
    {
        DB::transaction(function () use ($request, $store, $until, $note) {
            $from = $store->subscribed_until;
            $store->subscribed_until = $until;
            $store->save();

            // Kept with the payments so the store's history explains every change.
            $record = new SubscriptionPayment(['months' => 0, 'amount_cents' => 0, 'provider' => 'manual', 'status' => SubscriptionService::SUCCEEDED]);
            $record->merchant()->associate($store);
            $record->forceFill([
                'note' => $this->note($request, $note),
                'period_start' => $from ?? now(),
                'period_end' => $until,
                'paid_at' => now(),
            ])->save();
        });
    }

    private function note(Request $request, string $note): string
    {
        return mb_substr("{$note} (by {$request->user()->name})", 0, 255);
    }
}
