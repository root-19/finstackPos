<?php

namespace App\Http\Middleware;

use App\Http\Controllers\WelcomeController;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\View;
use Symfony\Component\HttpFoundation\Response;

/**
 * Renders a page with the landing page's shell in app.blade.php (marketing
 * fonts, SEO tags, no boot splash), for the sign-in and sign-up pages.
 * Leaving these pages for the app must be a full page load (see the auth
 * controllers' Inertia::location), so the app gets its own font and splash.
 */
class ServeAsMarketingPage
{
    /** [title, description] per route name; anything else gets the default. */
    private const PAGES = [
        'login' => ['Log in - FinstackPOS', 'Log in to your FinstackPOS store: POS, inventory and payroll in one app.'],
        'register' => ['Create your store - FinstackPOS', 'Create your FinstackPOS store for free and start selling from any device, even offline.'],
        'password.request' => ['Forgot password - FinstackPOS', 'Reset the password of your FinstackPOS account.'],
    ];

    public function handle(Request $request, Closure $next): Response
    {
        [$title, $description] = self::PAGES[$request->route()?->getName()] ?? ['FinstackPOS', 'POS, inventory and payroll for Philippine small businesses.'];

        View::share(WelcomeController::meta($title, $description, '/'.ltrim($request->path(), '/')));

        return $next($request);
    }
}
