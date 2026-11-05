<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('merchants', function (Blueprint $table) {
            // Receipt
            $table->string('address')->nullable()->after('name');
            $table->string('tin', 30)->nullable()->after('address');
            $table->string('contact_number', 30)->nullable()->after('tin');
            $table->string('receipt_footer', 500)->nullable()->after('prices_include_tax');
            $table->unsignedSmallInteger('receipt_paper_mm')->default(80)->after('receipt_footer');
            $table->boolean('auto_print_receipt')->default(false)->after('receipt_paper_mm');

            // Senior citizen / PWD discount (PH: 20%, VAT-exempt by default)
            $table->boolean('senior_discount_enabled')->default(true)->after('auto_print_receipt');
            $table->boolean('pwd_discount_enabled')->default(true)->after('senior_discount_enabled');
            $table->unsignedInteger('discount_rate_bps')->default(2000)->after('pwd_discount_enabled');
            $table->boolean('discount_vat_exempt')->default(true)->after('discount_rate_bps');

            $table->unsignedInteger('service_charge_bps')->default(0)->after('discount_vat_exempt');

            // Payments
            $table->boolean('manual_qr_enabled')->default(false)->after('service_charge_bps');
            $table->string('manual_qr_label', 60)->nullable()->after('manual_qr_enabled');
            $table->string('manual_qr_image_path')->nullable()->after('manual_qr_label');
            $table->boolean('paymongo_enabled')->default(false)->after('manual_qr_image_path');
            // Encrypted at rest (Eloquent "encrypted" cast); never sent to the browser.
            $table->text('paymongo_secret_key')->nullable()->after('paymongo_enabled');
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->string('discount_type', 20)->nullable()->after('subtotal_cents');
            $table->string('discount_id_number', 50)->nullable()->after('discount_type');
            $table->string('discount_customer_name', 100)->nullable()->after('discount_id_number');
            $table->unsignedBigInteger('vat_exempt_cents')->default(0)->after('discount_customer_name');
            $table->unsignedBigInteger('discount_cents')->default(0)->after('vat_exempt_cents');
            $table->unsignedBigInteger('service_charge_cents')->default(0)->after('discount_cents');
            $table->string('payment_reference', 100)->nullable()->after('payment_method');
        });

        // Gateway payments started from the POS, so a sale can only claim a
        // payment that this store created and that really succeeded.
        Schema::create('payment_intents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 20);
            $table->string('provider_id')->unique();
            $table->unsignedBigInteger('amount_cents');
            $table->string('status', 40);
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payment_intents');

        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn([
                'discount_type', 'discount_id_number', 'discount_customer_name', 'vat_exempt_cents',
                'discount_cents', 'service_charge_cents', 'payment_reference',
            ]);
        });

        Schema::table('merchants', function (Blueprint $table) {
            $table->dropColumn([
                'address', 'tin', 'contact_number', 'receipt_footer', 'receipt_paper_mm', 'auto_print_receipt',
                'senior_discount_enabled', 'pwd_discount_enabled', 'discount_rate_bps', 'discount_vat_exempt',
                'service_charge_bps', 'manual_qr_enabled', 'manual_qr_label', 'manual_qr_image_path',
                'paymongo_enabled', 'paymongo_secret_key',
            ]);
        });
    }
};
