<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * What the cashier saw when looking a PWD discount's ID up on the DOH PWD
     * registry (pwd.doh.gov.ph): found, not_found, or null when not checked.
     * A record for audits only: an ID that isn't listed may still be valid,
     * so it never blocks the discount. Additive only.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('sales', 'discount_doh_check')) {
            Schema::table('sales', function (Blueprint $table) {
                $table->string('discount_doh_check', 12)->nullable()->after('discount_customer_name');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('sales', 'discount_doh_check')) {
            Schema::table('sales', function (Blueprint $table) {
                $table->dropColumn('discount_doh_check');
            });
        }
    }
};
