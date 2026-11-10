<?php

namespace App\Http\Controllers;

use App\Support\Platform;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The public landing page. Prices, the free product limit and the trial come
 * from Admin → Pricing (Platform), so the page never drifts from the real plan.
 */
class WelcomeController extends Controller
{
    public function __invoke(): Response
    {
        return Inertia::render('Welcome', [
            'canLogin' => Route::has('login'),
            'canRegister' => Route::has('register'),
            'pricing' => [
                'price_cents' => Platform::subscriptionPriceCents(),
                'max_months' => Platform::maxMonths(),
                'free_product_limit' => Platform::freeProductLimit(),
            ],
            'trial' => ['days' => Platform::trialDays()],
        ])->withViewData(self::meta(
            'FinstackPOS: POS, inventory and payroll for Philippine small businesses',
            'Sell, track stock and pay your team from any device, even when the internet drops. Free plan, GCash, Maya and QR Ph, Senior & PWD discounts.',
            '/',
        ));
    }

    /**
     * View data for the marketing pages: app.blade.php prints the SEO tags and
     * the receipt fonts, and skips the app's boot splash, only when it is set.
     *
     * @return array{marketing: true, meta: array{title: string, description: string, url: string, image: string}}
     */
    public static function meta(string $title, string $description, string $path): array
    {
        $base = rtrim((string) config('app.url'), '/');

        return [
            'marketing' => true,
            'meta' => [
                'title' => $title,
                'description' => $description,
                'url' => $base.($path === '/' ? '/' : $path),
                'image' => $base.'/og-image.png',
            ],
        ];
    }
}
