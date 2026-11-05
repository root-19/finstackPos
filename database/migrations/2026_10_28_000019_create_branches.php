<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Branches: one business, several locations. Every sale is made at a
 * branch, staff can be tied to one, and each branch's tables and orders are
 * its own. Products and stock stay shared by the whole store.
 *
 * Every existing store gets a "Main branch" holding its past sales and tables.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 60);
            $table->string('address')->nullable();
            $table->boolean('is_active')->default(true);
            // Table ordering is paused and watched per branch (see Branch).
            $table->boolean('ordering_paused')->default(false);
            $table->timestamp('orders_seen_at')->nullable();
            $table->timestamps();
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->after('merchant_id')->constrained()->nullOnDelete();
            $table->index(['branch_id', 'sold_at']);
        });

        Schema::table('users', function (Blueprint $table) {
            // Staff who only work at one branch; null: any branch (the owner always).
            $table->foreignId('branch_id')->nullable()->after('merchant_id')->constrained()->nullOnDelete();
        });

        Schema::table('dining_tables', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->after('merchant_id')->constrained()->cascadeOnDelete();
        });

        Schema::table('table_orders', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->after('merchant_id')->constrained()->nullOnDelete();
        });

        $now = now();
        foreach (DB::table('merchants')->get(['id', 'address', 'table_ordering_paused', 'orders_seen_at']) as $merchant) {
            $branchId = DB::table('branches')->insertGetId([
                'merchant_id' => $merchant->id,
                'name' => 'Main branch',
                'address' => $merchant->address,
                'is_active' => true,
                'ordering_paused' => $merchant->table_ordering_paused,
                'orders_seen_at' => $merchant->orders_seen_at,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            foreach (['sales', 'dining_tables', 'table_orders'] as $table) {
                DB::table($table)->where('merchant_id', $merchant->id)->update(['branch_id' => $branchId]);
            }
        }

        Schema::table('merchants', function (Blueprint $table) {
            $table->dropColumn(['table_ordering_paused', 'orders_seen_at']);
        });
    }

    public function down(): void
    {
        Schema::table('merchants', function (Blueprint $table) {
            $table->boolean('table_ordering_paused')->default(false);
            $table->timestamp('orders_seen_at')->nullable();
        });

        foreach (['table_orders', 'dining_tables', 'users', 'sales'] as $name) {
            Schema::table($name, function (Blueprint $table) use ($name) {
                if ($name === 'sales') {
                    $table->dropIndex(['branch_id', 'sold_at']);
                }
                $table->dropConstrainedForeignId('branch_id');
            });
        }

        Schema::dropIfExists('branches');
    }
};
