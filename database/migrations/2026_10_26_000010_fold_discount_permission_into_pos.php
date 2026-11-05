<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Permissions are now the sidebar pages themselves; giving Senior/PWD
 * discounts is part of "Point of Sale", so the separate permission goes.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        foreach (DB::table('roles')->get(['id', 'permissions']) as $role) {
            $permissions = json_decode($role->permissions, true) ?: [];
            $kept = array_values(array_diff($permissions, ['pos.discount']));

            if ($kept !== $permissions) {
                DB::table('roles')->where('id', $role->id)->update(['permissions' => json_encode($kept)]);
            }
        }
    }

    /**
     * Reverse the migrations: roles that can sell may give discounts again.
     */
    public function down(): void
    {
        foreach (DB::table('roles')->get(['id', 'permissions']) as $role) {
            $permissions = json_decode($role->permissions, true) ?: [];

            if (in_array('pos.sell', $permissions, true) && ! in_array('pos.discount', $permissions, true)) {
                $permissions[] = 'pos.discount';
                DB::table('roles')->where('id', $role->id)->update(['permissions' => json_encode($permissions)]);
            }
        }
    }
};
