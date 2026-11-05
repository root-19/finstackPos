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
        $merchant = $request->user()?->merchant;

        abort_if($merchant === null || ! $merchant->is_active, 403, 'Your account is not linked to an active merchant.');

        return $next($request);
    }
}
