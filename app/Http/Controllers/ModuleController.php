<?php

namespace App\Http\Controllers;

use App\Support\Modules;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Settings → Customize: the owner picks which parts of FinstackPOS the store
 * uses. Turning a module off hides it and blocks its pages; nothing is
 * deleted. What a module needs is turned on with it.
 */
class ModuleController extends Controller
{
    public function edit(Request $request): Response
    {
        $merchant = $request->user()->merchant;

        return Inertia::render('Settings/Customize', [
            'modules' => Modules::catalog(),
            'enabled' => $merchant->enabledModules(),
            'pro' => $merchant->isSubscribed(),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'modules' => ['present', 'array'],
            'modules.*' => ['string', Rule::in(array_keys(Modules::ALL))],
        ]);

        $merchant = $request->user()->merchant;
        $merchant->forceFill(['modules' => Modules::withRequirements($data['modules'])])->save();

        return back()->with('success', 'Saved. The sidebar now shows only what your store uses.');
    }
}
