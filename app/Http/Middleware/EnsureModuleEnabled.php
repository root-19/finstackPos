<?php

namespace App\Http\Middleware;

use App\Support\Modules;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Pages of a module the store turned off in Settings → Customize. Page
 * visits go to the dashboard with a note; API and form requests get a 404,
 * as if the page didn't exist.
 */
class EnsureModuleEnabled
{
    public function handle(Request $request, Closure $next, string $module): Response
    {
        $merchant = $request->user()?->merchant;

        if ($merchant && ! $merchant->hasModule($module)) {
            if ($request->isMethod('GET') && ! $request->expectsJson()) {
                $label = Modules::ALL[$module]['label'] ?? 'That page';

                return redirect()->route('dashboard')->with('success', "{$label} is turned off for this store. The owner can turn it on in Settings → Customize.");
            }

            abort(404);
        }

        return $next($request);
    }
}
