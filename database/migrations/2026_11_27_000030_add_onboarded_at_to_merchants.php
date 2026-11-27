<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * When the owner finished or skipped the setup guide with Fin. Stores
     * that already exist count as set up, so the guide only greets new ones
     * (owners can still run it again from Settings → Customize).
     */
    public function up(): void
    {
        Schema::table('merchants', function (Blueprint $table) {
            $table->timestamp('onboarded_at')->nullable()->after('modules');
        });

        DB::table('merchants')->update(['onboarded_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('merchants', function (Blueprint $table) {
            $table->dropColumn('onboarded_at');
        });
    }
};
