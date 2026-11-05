<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Ordering from the table QR codes is on unless the owner turns it off:
 * a store on Pro (or its trial) gets it without looking for a setting. On
 * the Free plan the codes still show the menu only.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('merchants', function (Blueprint $table) {
            $table->boolean('table_ordering_enabled')->default(true)->change();
        });

        DB::table('merchants')->update(['table_ordering_enabled' => true]);
    }

    public function down(): void
    {
        Schema::table('merchants', function (Blueprint $table) {
            $table->boolean('table_ordering_enabled')->default(false)->change();
        });
    }
};
