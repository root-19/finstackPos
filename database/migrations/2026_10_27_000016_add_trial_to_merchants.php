<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * When a store's free Pro trial ends. Set once, at sign-up; stores that
     * existed before trials started have none. Additive only.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('merchants', 'trial_ends_at')) {
            Schema::table('merchants', function (Blueprint $table) {
                $table->timestamp('trial_ends_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('merchants', 'trial_ends_at')) {
            Schema::table('merchants', function (Blueprint $table) {
                $table->dropColumn('trial_ends_at');
            });
        }
    }
};
