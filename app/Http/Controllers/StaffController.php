<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Models\AuditLog;
use App\Models\Employee;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;
use Illuminate\Validation\Rules\Password;

/**
 * Staff logins: create, change role, remove. Shown on the Employee List,
 * where every login belongs to an employee. Owner only
 * (see Permission::StaffManage).
 */
class StaffController extends Controller
{
    /**
     * Staff logins and roles now live on the Employee List.
     */
    public function index(): RedirectResponse
    {
        return redirect()->route('employees.index');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'lowercase', 'email', 'max:255', Rule::unique(User::class)],
            'role_id' => ['required', 'integer', $this->ownRole($request)],
            'password' => ['required', 'confirmed', Password::defaults()],
            // The employee getting this login; without one, a new employee record is made.
            'employee_id' => [
                'nullable', 'integer',
                Rule::exists('employees', 'id')->where('merchant_id', $request->user()->merchant_id)->whereNull('user_id')->whereNull('deleted_at'),
            ],
        ], [
            'employee_id.exists' => 'That employee already has a login.',
        ]);

        $user = DB::transaction(function () use ($validated, $request) {
            $user = new User([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
            ]);
            $user->merchant()->associate($request->user()->merchant);
            $user->role = UserRole::Staff;
            $user->role_id = $validated['role_id'];
            $user->save();

            $employee = isset($validated['employee_id'])
                ? Employee::findOrFail($validated['employee_id'])
                : new Employee(['name' => $user->name, 'email' => $user->email, 'status' => 'active']);
            $employee->user_id = $user->id;
            $employee->save();
            AuditLog::record($employee, 'login_created', null, ['email' => $user->email, 'role' => $user->roleName()]);

            return $user;
        });

        return back()->with('success', "{$user->name} can now log in as {$user->roleName()}.");
    }

    public function update(Request $request, User $user): RedirectResponse
    {
        $this->ensureManageable($request, $user);

        $validated = $request->validate([
            'role_id' => ['required', 'integer', $this->ownRole($request)],
        ]);

        $user->role_id = $validated['role_id'];
        $user->save();

        return back()->with('success', "{$user->name} is now a {$user->fresh()->roleName()}.");
    }

    public function destroy(Request $request, User $user): RedirectResponse
    {
        $this->ensureManageable($request, $user);

        // Their past sales stay and the employee record stays (both foreign keys
        // are nulled); only the login goes.
        $user->delete();

        return back()->with('success', "{$user->name}'s login was removed.");
    }

    /**
     * A role that belongs to this store (validation skips Eloquent scopes).
     */
    private function ownRole(Request $request): Exists
    {
        return Rule::exists('roles', 'id')->where('merchant_id', $request->user()->merchant_id);
    }

    /**
     * Owners may only manage other, non-owner members of their own store.
     */
    private function ensureManageable(Request $request, User $user): void
    {
        abort_unless($user->merchant_id === $request->user()->merchant_id, 404);
        abort_if($user->is($request->user()) || $user->isOwner(), 403, 'The store owner cannot be changed here.');
    }
}
