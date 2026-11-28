<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserHasMerchant
{
    /**
     * Only users attached to an active merchant may use the POS.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $merchant = $user?->merchant;

        // A platform administrator has no store: send them to the admin area
        // (e.g. when the login sends them back to a store page they opened
        // before signing in) instead of a dead-end 403.
        if ($merchant === null && $user?->isAdmin() && $request->isMethod('GET') && ! $request->expectsJson()) {
            return redirect()->route('admin.dashboard');
        }

        abort_if($merchant === null || ! $merchant->is_active, 403, 'Your account is not linked to an active merchant.');

        return $next($request);
    }
}
