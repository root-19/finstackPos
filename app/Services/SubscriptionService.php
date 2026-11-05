<?php

namespace App\Services;

use App\Models\Merchant;
use App\Models\SubscriptionPayment;
use App\Support\Platform;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Buying Pro months with QR Ph on FinstackPOS's PayMongo account. A payment
 * adds its months after whatever is already paid for, and is applied
 * exactly once, only after PayMongo reports it succeeded.
 */
class SubscriptionService
{
    public const SUCCEEDED = 'succeeded';

    public static function priceFor(int $months): int
    {
        return $months * Platform::subscriptionPriceCents();
    }

    /**
     * @return array{payment: SubscriptionPayment, qr_image: string}
     *
     * @throws RequestException
     */
    public function checkout(Merchant $merchant, int $userId, int $months, PayMongo $gateway): array
    {
        $amount = self::priceFor($months);
        $qr = $gateway->createQrPh($amount, "FinstackPOS Pro, {$months} month(s): {$merchant->name}");

        $payment = new SubscriptionPayment([
            'user_id' => $userId,
            'months' => $months,
            'amount_cents' => $amount,
            'provider' => 'paymongo',
            'provider_id' => $qr['id'],
            'status' => $qr['status'],
        ]);
        $payment->merchant()->associate($merchant);
        $payment->save();

        return ['payment' => $payment, 'qr_image' => $qr['qr_image']];
    }

    /**
     * Ask PayMongo about an unfinished payment and apply it if it was paid.
     */
    public function refresh(SubscriptionPayment $payment, ?PayMongo $gateway): SubscriptionPayment
    {
        if (! $payment->applied() && $payment->status !== self::SUCCEEDED && $gateway && $payment->provider_id) {
            try {
                $payment->update(['status' => $gateway->intentStatus($payment->provider_id)]);
            } catch (RequestException) {
                // Keep the last known status; the page simply asks again.
            }
        }

        if ($payment->status === self::SUCCEEDED && ! $payment->applied()) {
            $this->apply($payment);
        }

        return $payment->fresh();
    }

    /**
     * Payments started recently but never confirmed (e.g. the page was closed
     * right after paying): check them again.
     */
    public function reconcile(Merchant $merchant, ?PayMongo $gateway): void
    {
        SubscriptionPayment::query()
            ->where('merchant_id', $merchant->id)
            ->whereNull('period_end')
            ->where('created_at', '>=', now()->subDays(2))
            ->get()
            ->each(fn (SubscriptionPayment $p) => $this->refresh($p, $gateway));
    }

    /**
     * Add the payment's months after the current paid-up date (or from now).
     */
    public function apply(SubscriptionPayment $payment, ?string $note = null): void
    {
        DB::transaction(function () use ($payment, $note) {
            // Locks so two polls can never apply the same payment twice.
            $payment = SubscriptionPayment::withoutGlobalScopes()->lockForUpdate()->findOrFail($payment->id);
            if ($payment->applied()) {
                return;
            }
            $merchant = Merchant::query()->lockForUpdate()->findOrFail($payment->merchant_id);

            $start = $merchant->subscribed_until && $merchant->subscribed_until->isFuture() ? $merchant->subscribed_until->copy() : Carbon::now();
            $end = $start->copy()->addMonthsNoOverflow($payment->months);

            $merchant->subscribed_until = $end;
            $merchant->save();

            $payment->forceFill([
                'status' => self::SUCCEEDED,
                'period_start' => $start,
                'period_end' => $end,
                'paid_at' => $payment->paid_at ?? now(),
                'note' => $note ?? $payment->note,
            ])->save();
        });
    }

    /**
     * The free Pro trial: at sign-up, or from the subscription page for
     * stores that never had one. Once per store: never restarted.
     */
    public function startTrial(Merchant $merchant, int $days): void
    {
        if ($days < 1 || $merchant->trial_ends_at !== null) {
            return;
        }

        DB::transaction(function () use ($merchant, $days) {
            // Locks so a double click can't start two trials.
            $locked = Merchant::query()->lockForUpdate()->findOrFail($merchant->id);
            if ($locked->trial_ends_at !== null || $locked->isSubscribed()) {
                return;
            }

            $start = Carbon::now();
            $end = $start->copy()->addDays($days);
            $locked->forceFill(['subscribed_until' => $end, 'trial_ends_at' => $end])->save();

            // Shown in the store's subscription history like any other period.
            $record = new SubscriptionPayment(['months' => 0, 'amount_cents' => 0, 'provider' => 'trial', 'status' => self::SUCCEEDED]);
            $record->merchant()->associate($locked);
            $record->forceFill(['period_start' => $start, 'period_end' => $end, 'paid_at' => $start, 'note' => "{$days}-day free Pro trial"])->save();
        });

        // The caller's copy (e.g. the signed-in user's store) sees the trial too.
        $merchant->refresh();
    }

    /**
     * Months given without an online payment (e.g. paid in cash to FinstackPOS).
     */
    public function grant(Merchant $merchant, int $months, ?string $note = null): SubscriptionPayment
    {
        $payment = new SubscriptionPayment([
            'months' => $months,
            'amount_cents' => 0,
            'provider' => 'manual',
            'status' => self::SUCCEEDED,
            'note' => $note,
        ]);
        $payment->merchant()->associate($merchant);
        $payment->save();
        $this->apply($payment, $note);

        return $payment->fresh();
    }
}
