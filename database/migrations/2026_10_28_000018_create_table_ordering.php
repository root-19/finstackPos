<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Scan-to-order: a QR code on each table opens the store's menu on the
 * customer's phone, and their orders reach the POS and staff phones.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('merchants', function (Blueprint $table) {
            $table->boolean('table_ordering_enabled')->default(false);
            // "Not taking orders right now", switched from the orders screen.
            $table->boolean('table_ordering_paused')->default(false);
            // Last time a store device checked for orders: no device online
            // means nobody would see an order, so the menu stops taking them.
            $table->timestamp('orders_seen_at')->nullable();
        });

        Schema::create('dining_tables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 40);
            // In the QR code's link. A new one makes old printed codes stop working.
            $table->string('token', 32)->unique();
            $table->timestamp('staff_called_at')->nullable();
            $table->timestamp('bill_requested_at')->nullable();
            $table->timestamps();
        });

        Schema::create('table_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('dining_table_id')->nullable()->constrained()->nullOnDelete();
            $table->string('table_name', 40);
            // The customer's phone follows the order with this.
            $table->uuid('public_token')->unique();
            $table->string('status', 12)->default('new');
            $table->string('note', 200)->nullable();
            $table->unsignedBigInteger('subtotal_cents');
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('ready_at')->nullable();
            $table->timestamp('served_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            // Paid at the POS, as part of this sale.
            $table->timestamp('settled_at')->nullable();
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['merchant_id', 'settled_at', 'created_at']);
        });

        Schema::create('table_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('table_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('size_id')->nullable();
            $table->string('name');
            $table->json('options')->nullable();
            $table->unsignedBigInteger('unit_price_cents');
            $table->unsignedInteger('quantity');
            $table->string('note', 120)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('table_order_items');
        Schema::dropIfExists('table_orders');
        Schema::dropIfExists('dining_tables');

        Schema::table('merchants', function (Blueprint $table) {
            $table->dropColumn(['table_ordering_enabled', 'table_ordering_paused', 'orders_seen_at']);
        });
    }
};
