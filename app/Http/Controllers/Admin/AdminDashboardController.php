<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Merchant;
use App\Models\SubscriptionPayment;
use App\Support\Platform;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The platform overview: stores, plans, expiring subscriptions, and revenue.
 */
class AdminDashboardController extends Controller
{
    public function __invoke(): Response
    {
        $now = now();
        $stores = Merchant::query()->get(['id', 'name', 'slug', 'is_active', 'subscribed_until', 'trial_ends_at', 'created_at']);
        $pro = $stores->filter(fn (Merchant $m) => $m->isSubscribed());
        $trials = $pro->filter(fn (Merchant $m) => $m->onTrial());
        $paying = $pro->reject(fn (Merchant $m) => $m->onTrial());
        // Stores whose trial is over, and how many of them paid since.
        $trialDone = $stores->filter(fn (Merchant $m) => $m->trial_ends_at && $m->trial_ends_at->isPast());
        $converted = $trialDone->isEmpty() ? 0 : self::payments()
            ->whereIn('merchant_id', $trialDone->modelKeys())
            ->where('provider', 'paymongo')
            ->whereNotNull('period_end')
            ->distinct()
            ->count('merchant_id');
        $paid = self::payments()->where('provider', 'paymongo')->whereNotNull('period_end');

        // Revenue for the last six months, oldest first.
        $months = collect(range(5, 0))->map(fn ($i) => $now->copy()->startOfMonth()->subMonthsNoOverflow($i));
        $byMonth = (clone $paid)->where('paid_at', '>=', $months->first())->get(['amount_cents', 'paid_at'])
            ->groupBy(fn ($p) => $p->paid_at->format('Y-m'));
        $owners = self::ownerEmails();

        return Inertia::render('Admin/Dashboard', [
            'counts' => [
                'stores' => $stores->count(),
                'pro' => $paying->count(),
                'trial' => $trials->count(),
                'free' => $stores->count() - $pro->count(),
                'expiring' => $paying->filter(fn ($m) => $m->subscribed_until->lte($now->copy()->addDays(7)))->count(),
                'trials_ended' => $trialDone->count(),
                'trials_converted' => $converted,
                'expired' => $stores->filter(fn ($m) => $m->subscribed_until && $m->subscribed_until->isPast())->count(),
                'suspended' => $stores->where('is_active', false)->count(),
                'new_this_month' => $stores->filter(fn ($m) => $m->created_at->gte($now->copy()->startOfMonth()))->count(),
            ],
            'revenue' => [
                'this_month' => (int) (clone $paid)->where('paid_at', '>=', $now->copy()->startOfMonth())->sum('amount_cents'),
                'last_month' => (int) (clone $paid)->whereBetween('paid_at', [$now->copy()->startOfMonth()->subMonthNoOverflow(), $now->copy()->startOfMonth()])->sum('amount_cents'),
                'all_time' => (int) (clone $paid)->sum('amount_cents'),
                'by_month' => $months->map(fn (Carbon $m) => [
                    'month' => $m->format('Y-m'),
                    'amount_cents' => (int) ($byMonth->get($m->format('Y-m'))?->sum('amount_cents') ?? 0),
                    'payments' => $byMonth->get($m->format('Y-m'))?->count() ?? 0,
                ])->values(),
            ],
            'price_cents' => Platform::subscriptionPriceCents(),
            'trialsEnding' => $trials->sortBy('trial_ends_at')->take(8)->map(fn (Merchant $m) => [
                'id' => $m->id,
                'name' => $m->name,
                'owner' => $owners[$m->id] ?? null,
                'until' => $m->trial_ends_at->toIso8601String(),
                'days_left' => self::daysLeft($m),
            ])->values(),
            'expiringSoon' => $paying->sortBy('subscribed_until')->take(8)->map(fn (Merchant $m) => [
                'id' => $m->id,
                'name' => $m->name,
                'owner' => $owners[$m->id] ?? null,
                'until' => $m->subscribed_until->toIso8601String(),
                'days_left' => self::daysLeft($m),
            ])->values(),
            'recentPayments' => self::payments()->whereNotNull('period_end')->latest('paid_at')->limit(8)->get()->map(fn (SubscriptionPayment $p) => [
                'id' => $p->id,
                'store_id' => $p->merchant_id,
                'store' => $stores->firstWhere('id', $p->merchant_id)?->name,
                'months' => $p->months,
                'amount_cents' => $p->amount_cents,
                'provider' => $p->provider,
                'paid_at' => $p->paid_at?->toIso8601String(),
            ]),
            'newStores' => $stores->sortByDesc('created_at')->take(6)->map(fn (Merchant $m) => [
                'id' => $m->id,
                'name' => $m->name,
                'owner' => $owners[$m->id] ?? null,
                'created_at' => $m->created_at->toIso8601String(),
                'pro' => $m->isSubscribed(),
                'trial' => $m->onTrial(),
            ])->values(),
        ]);
    }

    /** Subscription payments of every store (the model is store-scoped by default). */
    public static function payments()
    {
        return SubscriptionPayment::query()->withoutGlobalScope('merchant');
    }

    /** @return array<int, string> store id => owner email */
    public static function ownerEmails(): array
    {
        return DB::table('users')->where('role', 'owner')->whereNotNull('merchant_id')->orderBy('id')->pluck('email', 'merchant_id')->all();
    }

    /** Whole days of Pro left (negative: days since it ended; null: never had Pro). */
    public static function daysLeft(Merchant $merchant): ?int
    {
        if (! $merchant->subscribed_until) {
            return null;
        }

        $hours = now()->diffInHours($merchant->subscribed_until, false);

        return (int) ($hours >= 0 ? ceil($hours / 24) : -ceil(abs($hours) / 24));
    }
}
