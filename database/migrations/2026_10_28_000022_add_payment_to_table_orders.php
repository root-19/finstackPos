<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Customers pay for each table order at checkout: cash (collected by the
 * staff), QR Ph through the store's PayMongo (confirmed by itself), or the
 * store's own QR (the customer says paid, the staff confirms it).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('table_orders', function (Blueprint $table) {
            $table->string('payment_method', 10)->default('cash')->after('note');
            // unpaid, awaiting (the customer says they paid by QR), paid.
            $table->string('payment_status', 10)->default('unpaid')->after('payment_method');
            // What the customer pays: the subtotal with service charge and VAT.
            $table->unsignedBigInteger('total_cents')->default(0)->after('subtotal_cents');
            $table->foreignId('payment_intent_id')->nullable()->after('payment_status')->constrained()->nullOnDelete();
            // The PayMongo QR to scan, until it's paid.
            $table->longText('payment_qr')->nullable()->after('payment_intent_id');
            // E-wallet reference the customer typed after paying the store's QR.
            $table->string('payment_reference', 100)->nullable()->after('payment_qr');
        });
    }

    public function down(): void
    {
        Schema::table('table_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('payment_intent_id');
            $table->dropColumn(['payment_method', 'payment_status', 'total_cents', 'payment_qr', 'payment_reference']);
        });
    }
};
