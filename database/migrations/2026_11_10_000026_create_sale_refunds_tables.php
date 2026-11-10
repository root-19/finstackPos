<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Refunds of a sale (full or partial): the items and quantities given back,
 * the money returned and its share of VAT, VAT exemption, Senior/PWD
 * discount and service charge, who did it, and who approved it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sale_refunds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('sale_id')->constrained()->cascadeOnDelete();
            // Made by the screen, so a double tap or a retry never refunds twice.
            $table->uuid('client_uuid');
            $table->string('method', 20);
            $table->string('reason', 200);
            $table->boolean('restocked')->default(false);
            $table->unsignedBigInteger('subtotal_cents');
            $table->unsignedBigInteger('vat_exempt_cents')->default(0);
            $table->unsignedBigInteger('discount_cents')->default(0);
            $table->unsignedBigInteger('service_charge_cents')->default(0);
            $table->unsignedBigInteger('tax_cents')->default(0);
            $table->unsignedBigInteger('amount_cents');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('refunded_at');
            $table->timestamps();

            $table->unique(['merchant_id', 'client_uuid']);
            $table->index(['merchant_id', 'refunded_at']);
        });

        Schema::create('sale_refund_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_refund_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sale_item_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('quantity');
            // Unit price × quantity, before the sale-level discount.
            $table->unsignedBigInteger('amount_cents');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_refund_items');
        Schema::dropIfExists('sale_refunds');
    }
};
