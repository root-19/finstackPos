<?php

namespace App\Http\Middleware;

use App\Enums\Permission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that is loaded on the first page visit.
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determine the current asset version.
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'auth' => [
                'user' => $request->user(),
                'merchant' => fn () => $request->user()?->merchant?->posSettings(),
                'roleName' => fn () => $request->user()?->roleName(),
                'isAdmin' => fn () => (bool) $request->user()?->isAdmin(),
                // Shows "My Work" (own schedule, time clock, payslips).
                'hasEmployeeProfile' => fn () => (bool) $request->user()?->merchant_id && $request->user()->employee()->exists(),
                // Plan: Free, or Pro until a date (the Management modules need Pro).
                'subscription' => fn () => ($merchant = $request->user()?->merchant) ? [
                    'active' => $merchant->isSubscribed(),
                    'trial' => $merchant->onTrial(),
                    'until' => $merchant->subscribed_until?->toIso8601String(),
                ] : null,
                // UI hints only; every route enforces the same gates server-side.
                'can' => fn () => $request->user()
                    ? collect(Permission::cases())->mapWithKeys(fn (Permission $p) => [$p->value => Gate::allows($p->value)])
                    : null,
            ],
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
            ],
        ];
    }
}
