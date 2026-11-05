<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Inventory: supplies, ingredients, and materials, the suppliers they
     * come from, every stock movement, and the recipes that use them up when
     * products are sold. Additive only; each step can be re-run.
     */
    public function up(): void
    {
        if (! Schema::hasTable('suppliers')) {
            Schema::create('suppliers', function (Blueprint $table) {
                $table->id();
                $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
                $table->string('name');
                $table->string('contact_person')->nullable();
                $table->string('phone', 30)->nullable();
                $table->string('email')->nullable();
                $table->string('address')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->index(['merchant_id', 'name']);
            });
        }

        if (! Schema::hasTable('inventory_items')) {
            Schema::create('inventory_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
                $table->string('name');
                $table->string('sku', 64)->nullable();
                // Free text with suggestions: Ingredients, Packaging, Supplies…
                $table->string('category', 60)->nullable();
                $table->string('unit', 20);
                // Quantities can be fractional (0.25 kg); money stays in cents.
                $table->decimal('quantity', 14, 3)->default(0);
                // Weighted average cost of one unit, in cents (fractions allowed: ₱0.35/g).
                $table->decimal('unit_cost_cents', 14, 4)->default(0);
                $table->decimal('reorder_level', 14, 3)->nullable();
                $table->decimal('reorder_quantity', 14, 3)->nullable();
                $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
                $table->string('location', 100)->nullable();
                $table->text('notes')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->softDeletes();

                $table->index(['merchant_id', 'name']);
                $table->index(['merchant_id', 'category']);
            });
        }

        if (! Schema::hasTable('stock_movements')) {
            Schema::create('stock_movements', function (Blueprint $table) {
                $table->id();
                $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
                // purchase, sale, adjustment (count), waste, usage, return
                $table->string('type', 20);
                // Signed: positive adds stock, negative removes it.
                $table->decimal('quantity_change', 14, 3);
                $table->decimal('quantity_after', 14, 3);
                $table->decimal('unit_cost_cents', 14, 4)->nullable();
                $table->bigInteger('total_cost_cents')->nullable();
                $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
                $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
                $table->string('reference', 100)->nullable();
                $table->string('note', 500)->nullable();
                $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
                $table->timestamp('created_at')->nullable();

                $table->index(['merchant_id', 'created_at']);
                $table->index(['inventory_item_id', 'created_at']);
                $table->index(['merchant_id', 'type']);
            });
        }

        if (! Schema::hasTable('recipe_lines')) {
            Schema::create('recipe_lines', function (Blueprint $table) {
                $table->id();
                $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('product_id')->constrained()->cascadeOnDelete();
                // Null: used by every size of the product; otherwise only by that size.
                $table->foreignId('option_value_id')->nullable()->constrained()->cascadeOnDelete();
                $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
                // In the inventory item's own unit, per one product sold.
                $table->decimal('quantity', 14, 3);
                $table->timestamps();

                $table->index(['merchant_id', 'product_id']);
            });
        }

        if (! Schema::hasColumn('merchants', 'inventory_blocks_sales')) {
            Schema::table('merchants', function (Blueprint $table) {
                // Off: the POS warns when ingredients run out but still sells.
                $table->boolean('inventory_blocks_sales')->default(false);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('merchants', 'inventory_blocks_sales')) {
            Schema::table('merchants', function (Blueprint $table) {
                $table->dropColumn('inventory_blocks_sales');
            });
        }
        Schema::dropIfExists('recipe_lines');
        Schema::dropIfExists('stock_movements');
        Schema::dropIfExists('inventory_items');
        Schema::dropIfExists('suppliers');
    }
};
