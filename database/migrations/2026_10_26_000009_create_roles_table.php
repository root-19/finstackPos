<?php

use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Custom staff roles with chosen permissions replace the fixed
 * manager/cashier roles. Existing staff keep the same access through the
 * default "Manager" and "Cashier" roles created for every store.
 *
 * Each step is safe to repeat in case a run fails halfway on MySQL.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasTable('roles')) {
            Schema::create('roles', function (Blueprint $table) {
                $table->id();
                $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
                $table->string('name', 60);
                $table->json('permissions');
                $table->timestamps();

                $table->unique(['merchant_id', 'name']);
            });
        }

        if (! Schema::hasColumn('users', 'role_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->foreignId('role_id')->nullable()->after('role')->constrained()->nullOnDelete();
            });
        }

        // New accounts are staff unless made owner explicitly.
        Schema::table('users', function (Blueprint $table) {
            $table->string('role')->default('staff')->change();
        });

        DB::transaction(function () {
            foreach (DB::table('merchants')->pluck('id') as $merchantId) {
                $roleIds = [];

                foreach (Role::DEFAULTS as $name => $permissions) {
                    $existing = DB::table('roles')->where('merchant_id', $merchantId)->where('name', $name)->value('id');

                    $roleIds[strtolower($name)] = $existing ?? DB::table('roles')->insertGetId([
                        'merchant_id' => $merchantId,
                        'name' => $name,
                        'permissions' => json_encode($permissions),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }

                foreach (['manager', 'cashier'] as $legacy) {
                    DB::table('users')
                        ->where('merchant_id', $merchantId)
                        ->where('role', $legacy)
                        ->update(['role' => 'staff', 'role_id' => $roleIds[$legacy]]);
                }
            }
        });
    }

    /**
     * Reverse the migrations. Staff fall back to the fixed roles by name.
     */
    public function down(): void
    {
        DB::table('users')
            ->join('roles', 'roles.id', '=', 'users.role_id')
            ->where('users.role', 'staff')
            ->update(['users.role' => DB::raw("case when roles.name = 'Manager' then 'manager' else 'cashier' end")]);

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('role_id');
            $table->string('role')->default('owner')->change();
        });

        Schema::dropIfExists('roles');
    }
};
