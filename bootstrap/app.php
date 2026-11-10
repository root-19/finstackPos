<?php

use App\Http\Middleware\EnsureUserHasMerchant;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SetSecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(append: [
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
            SetSecurityHeaders::class,
        ]);

        // Behind a reverse proxy or CDN (TRUSTED_PROXIES=*, or a list of
        // IPs/CIDRs), so each visitor keeps their own IP for rate limits
        // and https is recognised. Unset: no proxy is trusted.
        if ($proxies = env('TRUSTED_PROXIES')) {
            $middleware->trustProxies(
                at: $proxies === '*' ? '*' : array_map('trim', explode(',', $proxies)),
                headers: Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_HOST | Request::HEADER_X_FORWARDED_PORT | Request::HEADER_X_FORWARDED_PROTO,
            );
        }

        $middleware->alias([
            'admin' => \App\Http\Middleware\EnsurePlatformAdmin::class,
            'subscribed' => \App\Http\Middleware\EnsureSubscribed::class,
            // Sign-in/sign-up pages in the landing page's shell (fonts, SEO, no splash).
            'marketing' => \App\Http\Middleware\ServeAsMarketingPage::class,
            'merchant' => EnsureUserHasMerchant::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
