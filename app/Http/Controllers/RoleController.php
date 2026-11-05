<?php

namespace App\Http\Controllers;

use App\Enums\Permission;
use App\Models\Role;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Custom staff roles. Role is merchant-scoped globally, so route binding
 * never finds another store's role. Owner only.
 */
class RoleController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        Role::create($this->validated($request));

        return back()->with('success', 'Role created.');
    }

    public function update(Request $request, Role $role): RedirectResponse
    {
        $role->update($this->validated($request, $role));

        return back()->with('success', "{$role->name} updated. Its staff get the new access right away.");
    }

    public function destroy(Role $role): RedirectResponse
    {
        if ($role->users()->exists()) {
            return back()->withErrors([
                'role' => "Move the staff in {$role->name} to another role before deleting it.",
            ]);
        }

        $role->delete();

        return back()->with('success', 'Role deleted.');
    }

    /**
     * @return array{name: string, permissions: list<string>}
     */
    private function validated(Request $request, ?Role $role = null): array
    {
        $validated = $request->validate([
            'name' => [
                'required', 'string', 'max:60',
                Rule::unique('roles')->where('merchant_id', $request->user()->merchant_id)->ignore($role),
                // "Owner" is reserved for the store owner.
                Rule::notIn(['owner', 'Owner', 'OWNER']),
            ],
            'permissions' => ['present', 'array'],
            // Only assignable permissions: staff and settings stay owner only.
            'permissions.*' => ['string', 'distinct', Rule::in(array_column(Permission::assignable(), 'value'))],
        ]);

        return [
            'name' => $validated['name'],
            'permissions' => array_values($validated['permissions']),
        ];
    }
}
