<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\SubscriptionPayment;
use App\Services\PayMongo;
use App\Services\SubscriptionService;
use App\Support\Platform;
use Illuminate\Http\Client\HttpClientException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The store's FinstackPOS plan: see it, and buy Pro months with QR Ph.
 * Anyone in the store can see the plan; only the owner pays.
 */
class SubscriptionController extends Controller
{
    public function __construct(private readonly SubscriptionService $subscriptions) {}

    public function index(Request $request): Response
    {
        $merchant = $request->user()->merchant;
        $gateway = PayMongo::forPlatform();

        // Pick up payments made while the page was closed.
        $this->subscriptions->reconcile($merchant, $gateway);
        $merchant->refresh();

        return Inertia::render('Subscription/Index', [
            'plan' => [
                'active' => $merchant->isSubscribed(),
                'trial' => $merchant->onTrial(),
                'until' => $merchant->subscribed_until?->toIso8601String(),
                'days_left' => $merchant->isSubscribed() ? (int) ceil(now()->diffInHours($merchant->subscribed_until) / 24) : 0,
                // Pro ran out with the trial, and nothing was paid after it.
                'trial_ended' => ! $merchant->isSubscribed() && $merchant->trial_ends_at !== null
                    && $merchant->subscribed_until?->lte($merchant->trial_ends_at),
            ],
            'trial' => [
                'available' => $merchant->canStartTrial(),
                'days' => Platform::trialDays(),
            ],
            'pricing' => [
                'price_cents' => Platform::subscriptionPriceCents(),
                'max_months' => Platform::maxMonths(),
                'free_product_limit' => Platform::freeProductLimit(),
            ],
            'usage' => ['products' => Product::query()->count()],
            'canPay' => $request->user()->isOwner(),
            'paymentsReady' => $gateway !== null,
            'payments' => SubscriptionPayment::query()
                ->with('user:id,name')
                ->latest()
                ->limit(20)
                ->get()
                ->map(fn (SubscriptionPayment $p) => [
                    'id' => $p->id,
                    'created_at' => $p->created_at->toIso8601String(),
                    'months' => $p->months,
                    'amount_cents' => $p->amount_cents,
                    'provider' => $p->provider,
                    'status' => $p->applied() ? 'paid' : ($p->created_at->lt(now()->subMinutes(15)) ? 'expired' : 'pending'),
                    'period_start' => $p->period_start?->toIso8601String(),
                    'period_end' => $p->period_end?->toIso8601String(),
                    'by' => $p->user?->name,
                ]),
        ]);
    }

    /**
     * Start the free Pro trial (once per store). When it ends, the store is
     * back on Free; nothing is charged.
     */
    public function trial(Request $request): RedirectResponse
    {
        abort_unless($request->user()->isOwner(), 403, 'Only the store owner can start the free trial.');
        $merchant = $request->user()->merchant;

        if (! $merchant->canStartTrial()) {
            return back()->withErrors(['trial' => 'This store has already used its free Pro trial.']);
        }

        $days = Platform::trialDays();
        $this->subscriptions->startTrial($merchant, $days);

        return back()->with('success', "Your {$days}-day Pro trial has started.");
    }

    public function checkout(Request $request): JsonResponse
    {
        abort_unless($request->user()->isOwner(), 403, 'Only the store owner can pay for the subscription.');
        $data = $request->validate([
            'months' => ['required', 'integer', 'min:1', 'max:'.Platform::maxMonths()],
        ]);

        $gateway = PayMongo::forPlatform();
        abort_if($gateway === null, 503, 'Online payment is not available right now. Please contact FinstackPOS.');

        try {
            ['payment' => $payment, 'qr_image' => $qr] = $this->subscriptions->checkout($request->user()->merchant, $request->user()->id, $data['months'], $gateway);
        } catch (HttpClientException $e) {
            Log::warning('Subscription QR Ph failed', ['merchant' => $request->user()->merchant_id, 'status' => $e->response->status()]);

            return response()->json(['message' => $e->response->json('errors.0.detail') ?? 'PayMongo could not create the QR code. Try again.'], 502);
        }

        return response()->json([
            'id' => $payment->provider_id,
            'qr_image' => $qr,
            'months' => $payment->months,
            'amount_cents' => $payment->amount_cents,
        ]);
    }

    /**
     * Polled while the QR is shown; applies the months once PayMongo confirms.
     */
    public function status(Request $request, string $providerId): JsonResponse
    {
        // Merchant-scoped: another store's payment is a 404.
        $payment = SubscriptionPayment::query()->where('provider_id', $providerId)->firstOrFail();
        $payment = $this->subscriptions->refresh($payment, PayMongo::forPlatform());
        $merchant = $request->user()->merchant->fresh();

        return response()->json([
            'status' => $payment->applied() ? 'paid' : $payment->status,
            'subscribed_until' => $merchant->subscribed_until?->toIso8601String(),
        ]);
    }
}
