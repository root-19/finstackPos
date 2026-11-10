<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProfileUpdateRequest;
use App\Models\AuditLog;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Redirect;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ProfileController extends Controller
{
    /**
     * Display the user's profile form.
     */
    public function edit(Request $request): Response
    {
        return Inertia::render('Profile/Edit', [
            'mustVerifyEmail' => $request->user() instanceof MustVerifyEmail,
            'status' => session('status'),
            // Managers set their own PIN to approve voids and refunds at the register.
            'managerPin' => $request->user()->canApproveVoids() ? ['set' => $request->user()->manager_pin !== null] : null,
        ]);
    }

    /**
     * Update the user's profile information.
     */
    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $request->user()->fill($request->validated());

        if ($request->user()->isDirty('email')) {
            $request->user()->email_verified_at = null;
        }

        $request->user()->save();

        return Redirect::route('profile.edit');
    }

    /**
     * Set or change the user's own manager PIN, used to approve voids and
     * refunds at the register. Only managers (who may void) have one; their
     * password confirms it's really them.
     */
    public function updateManagerPin(Request $request): RedirectResponse
    {
        abort_unless($request->user()->canApproveVoids(), 403);

        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'pin' => ['required', 'string', 'regex:/^\d{4,6}$/', 'confirmed'],
        ], [
            'pin.regex' => 'Use 4 to 6 digits.',
        ]);

        $user = $request->user();
        $hadPin = $user->manager_pin !== null;
        $user->manager_pin = $data['pin'];
        $user->save();

        AuditLog::record($user, $hadPin ? 'manager_pin.changed' : 'manager_pin.set');

        return Redirect::route('profile.edit')->with('status', 'manager-pin-updated');
    }

    /**
     * Delete the user's account.
     */
    public function destroy(Request $request): RedirectResponse
    {
        $request->validate([
            'password' => ['required', 'current_password'],
        ]);

        $user = $request->user();

        // The owner's login is the store: without it nobody can reach
        // Settings, staff, payroll or billing. Admin accounts likewise.
        if ($user->isOwner() || $user->isAdmin()) {
            throw ValidationException::withMessages([
                'password' => "The store owner's account can't be deleted while it owns the store. Contact support to close the store.",
            ]);
        }

        Auth::logout();

        $user->delete();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return Redirect::to('/');
    }
}
