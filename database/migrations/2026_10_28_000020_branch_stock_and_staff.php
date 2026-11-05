<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stock and people per branch:
 * - employees work at one branch (or all of them);
 * - products are sold at every branch or only some, each branch counting
 *   its own stock (products.stock stays the overall total);
 * - inventory is held per branch (inventory_items.quantity stays the
 *   overall total) and every stock movement says where it happened.
 *
 * What exists today is placed in each store's main branch.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->after('merchant_id')->constrained()->nullOnDelete();
        });

        Schema::table('products', function (Blueprint $table) {
            $table->boolean('all_branches')->default(true)->after('is_active');
        });

        // Where a product is sold (when not every branch) and each branch's stock of it.
        Schema::create('branch_product', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            // Null when the product's stock isn't tracked.
            $table->integer('stock')->nullable();

            $table->unique(['product_id', 'branch_id']);
        });

        Schema::create('inventory_stocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->decimal('quantity', 14, 3)->default(0);

            $table->unique(['inventory_item_id', 'branch_id']);
        });

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->after('merchant_id')->constrained()->nullOnDelete();
        });

        $mains = DB::table('branches')->orderBy('id')->get(['id', 'merchant_id'])->unique('merchant_id')->pluck('id', 'merchant_id');

        DB::table('employees')->whereNotNull('user_id')->orderBy('id')->each(function ($employee) {
            $branch = DB::table('users')->where('id', $employee->user_id)->value('branch_id');
            if ($branch) {
                DB::table('employees')->where('id', $employee->id)->update(['branch_id' => $branch]);
            }
        });

        DB::table('products')->whereNotNull('stock')->orderBy('id')->each(function ($product) use ($mains) {
            if (isset($mains[$product->merchant_id])) {
                DB::table('branch_product')->insert(['product_id' => $product->id, 'branch_id' => $mains[$product->merchant_id], 'stock' => $product->stock]);
            }
        });

        DB::table('inventory_items')->orderBy('id')->each(function ($item) use ($mains) {
            if (isset($mains[$item->merchant_id])) {
                DB::table('inventory_stocks')->insert(['inventory_item_id' => $item->id, 'branch_id' => $mains[$item->merchant_id], 'quantity' => $item->quantity]);
            }
        });

        foreach ($mains as $merchantId => $branchId) {
            DB::table('stock_movements')->where('merchant_id', $merchantId)->update(['branch_id' => $branchId]);
        }
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('branch_id');
        });
        Schema::dropIfExists('inventory_stocks');
        Schema::dropIfExists('branch_product');
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('all_branches');
        });
        Schema::table('employees', function (Blueprint $table) {
            $table->dropConstrainedForeignId('branch_id');
        });
    }
};
