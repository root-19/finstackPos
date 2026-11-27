<?php

namespace App\Http\Controllers;

use App\Support\Modules;
use App\Support\Platform;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The setup guide with Fin that greets a new store's owner: it explains
 * FinstackPOS, asks what the business does, picks the modules (Settings →
 * Customize) and explains the plans. Skipping or finishing both end it.
 */
class OnboardingController extends Controller
{
    /**
     * What the guide needs, for the owner of a store that hasn't been
     * through it yet; null otherwise (shared with every page).
     */
    public static function props(Request $request): ?array
    {
        $user = $request->user();
        $merchant = $user?->merchant;

        if (! $merchant || ! $user->isOwner() || $merchant->onboarded_at !== null) {
            return null;
        }

        return [
            'store' => $merchant->name,
            'modules' => Modules::catalog(),
            'enabled' => $merchant->enabledModules(),
            'plan' => [
                'price_cents' => Platform::subscriptionPriceCents(),
                'max_months' => Platform::maxMonths(),
                'free_product_limit' => Platform::freeProductLimit(),
                'trial_days' => Platform::trialDays(),
                'pro' => $merchant->isSubscribed(),
                'on_trial' => $merchant->onTrial(),
                'until' => $merchant->subscribed_until?->toIso8601String(),
                'can_start_trial' => $merchant->canStartTrial(),
            ],
        ];
    }

    /** Finish (with the modules the owner picked) or skip (without). */
    public function finish(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'modules' => ['sometimes', 'array'],
            'modules.*' => ['string', Rule::in(array_keys(Modules::ALL))],
        ]);

        $merchant = $request->user()->merchant;
        $merchant->forceFill([
            'onboarded_at' => now(),
            ...(array_key_exists('modules', $data) ? ['modules' => Modules::withRequirements($data['modules'])] : []),
        ])->save();

        return back();
    }

    /** "Run the setup guide again" from Settings → Customize. */
    public function restart(Request $request): RedirectResponse
    {
        $request->user()->merchant->forceFill(['onboarded_at' => null])->save();

        return redirect()->route('dashboard');
    }
}
