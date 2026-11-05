<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PlatformSetting;
use App\Support\Platform;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The Pro price and plan limits. A new price applies to new payments only;
 * months already paid for are never repriced.
 */
class PricingController extends Controller
{
    public function edit(): Response
    {
        $saved = PlatformSetting::query()->with('editor:id,name')->get()->keyBy('key');
        $changed = $saved->sortByDesc('updated_at')->first();

        return Inertia::render('Admin/Pricing', [
            'pricing' => [
                'price' => Platform::subscriptionPriceCents() / 100,
                'free_product_limit' => Platform::freeProductLimit(),
                'max_months' => Platform::maxMonths(),
                'trial_days' => Platform::trialDays(),
            ],
            'lastChange' => $changed ? ['by' => $changed->editor?->name, 'at' => $changed->updated_at?->toIso8601String()] : null,
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'price' => ['required', 'numeric', 'min:1', 'max:100000', 'decimal:0,2'],
            'free_product_limit' => ['required', 'integer', 'min:1', 'max:100000'],
            'max_months' => ['required', 'integer', 'min:1', 'max:120'],
            'trial_days' => ['required', 'integer', 'min:0', 'max:90'],
        ]);
        $by = $request->user()->id;

        Platform::set('subscription_price_cents', (int) round($data['price'] * 100), $by);
        Platform::set('free_product_limit', (int) $data['free_product_limit'], $by);
        Platform::set('max_months', (int) $data['max_months'], $by);
        Platform::set('trial_days', (int) $data['trial_days'], $by);

        return back()->with('success', 'Pricing saved. New payments use it from now on.');
    }
}
