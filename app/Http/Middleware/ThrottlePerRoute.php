<?php

namespace App\Http\Middleware;

use Illuminate\Routing\Middleware\ThrottleRequests;

/**
 * `throttle:N,M` with one counter per route.
 *
 * Laravel keys an unnamed throttle by the signed-in user alone, so every
 * throttled route shares one counter: the table-orders feed the app polls
 * every few seconds (120/min) used up the budget of 10/min routes like
 * "Suggest a feature", void/refund or the Pro checkout, which then answered
 * 429 on the first try. Adding the route to the key gives each its own.
 * Named limiters (`throttle:demo-requests`) are unaffected.
 */
class ThrottlePerRoute extends ThrottleRequests
{
    protected function resolveRequestSignature($request)
    {
        $route = $request->route();
        $scope = $route?->getName() ?? ($route ? implode('|', $route->methods()).' '.$route->uri() : '');

        return sha1(parent::resolveRequestSignature($request).'|'.$scope);
    }
}
