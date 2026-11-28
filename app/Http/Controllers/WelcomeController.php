<?php

namespace App\Http\Controllers;

use App\Models\DemoRequest;
use App\Support\DesktopRelease;
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
            // The Windows app installer, or null until one is published.
            'desktop' => DesktopRelease::forPage(),
            // "Book a demo": the same slots and dates the form is validated against.
            'demo' => [
                'slots' => DemoRequest::slots(),
                ...DemoRequest::dateRange(),
                'minutes' => DemoRequest::MINUTES,
            ],
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
        $base = self::baseUrl();

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

    /**
     * The site's public address for canonical links, sharing and the sitemap.
     * APP_URL, unless it still says localhost in production (a fresh .env):
     * then the address the request came in on, so search engines never get
     * told the "real" page is on localhost.
     */
    public static function baseUrl(): string
    {
        $configured = rtrim((string) config('app.url'), '/');
        $host = parse_url($configured, PHP_URL_HOST);

        if (app()->isProduction() && in_array($host, [null, 'localhost', '127.0.0.1'], true) && app()->bound('request')) {
            return rtrim(request()->getSchemeAndHttpHost(), '/');
        }

        return $configured;
    }

    /** sitemap.xml: the public pages search engines should index. */
    public function sitemap(): \Illuminate\Http\Response
    {
        $base = self::baseUrl();
        $pages = ['/' => '1.0', '/download' => '0.8', '/register' => '0.6', '/privacy' => '0.3', '/terms' => '0.3'];
        $urls = collect($pages)->map(fn ($priority, $path) => '  <url><loc>'.e($base.($path === '/' ? '/' : $path)).'</loc><changefreq>weekly</changefreq><priority>'.$priority.'</priority></url>')->implode("\n");

        return response('<?xml version="1.0" encoding="UTF-8"?>'."\n".'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'."\n".$urls."\n</urlset>\n", 200, ['Content-Type' => 'application/xml']);
    }
}
