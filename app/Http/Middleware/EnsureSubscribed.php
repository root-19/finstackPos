<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Pro-only areas (the Management modules). Free stores are sent to the
 * subscription page; API and form requests get a 403.
 */
class EnsureSubscribed
{
    public function handle(Request $request, Closure $next): Response
    {
        $merchant = $request->user()?->merchant;

        if ($merchant && ! $merchant->isSubscribed()) {
            if ($request->isMethod('GET') && ! $request->expectsJson()) {
                // Owners can upgrade there; staff see why the page is unavailable.
                return redirect()->route('subscription.index')->with('success', 'Management is part of FinstackPOS Pro.');
            }

            abort(403, 'This feature needs a FinstackPOS Pro subscription.');
        }

        return $next($request);
    }
}
