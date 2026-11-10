<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A sale's status (completed, voided, refunded, partially_refunded), who
 * voided it and why, and how much of it has been refunded so far. Every
 * existing sale is a completed one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->string('status', 20)->default('completed')->after('change_cents');
            $table->timestamp('voided_at')->nullable()->after('status');
            $table->foreignId('voided_by')->nullable()->after('voided_at')->constrained('users')->nullOnDelete();
            // The manager who approved it at the register (null: the cashier could void).
            $table->foreignId('void_approved_by')->nullable()->after('voided_by')->constrained('users')->nullOnDelete();
            $table->string('void_reason', 200)->nullable()->after('void_approved_by');
            // Sum of its refunds, so lists and reports needn't add them up.
            $table->unsignedBigInteger('refunded_cents')->default(0)->after('void_reason');

            $table->index(['merchant_id', 'status']);
        });

        Schema::table('sale_items', function (Blueprint $table) {
            $table->unsignedInteger('refunded_quantity')->default(0)->after('quantity');
        });
    }

    public function down(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropColumn('refunded_quantity');
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->dropIndex(['merchant_id', 'status']);
            $table->dropConstrainedForeignId('void_approved_by');
            $table->dropConstrainedForeignId('voided_by');
            $table->dropColumn(['status', 'voided_at', 'void_reason', 'refunded_cents']);
        });
    }
};
