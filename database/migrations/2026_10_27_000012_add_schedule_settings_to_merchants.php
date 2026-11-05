<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The store's saved auto-schedule settings (start times, hours, break,
     * days off). Additive only.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('merchants', 'schedule_settings')) {
            Schema::table('merchants', function (Blueprint $table) {
                $table->json('schedule_settings')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('merchants', 'schedule_settings')) {
            Schema::table('merchants', function (Blueprint $table) {
                $table->dropColumn('schedule_settings');
            });
        }
    }
};
