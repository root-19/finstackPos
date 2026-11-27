<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The modules a store turned on in Settings → Customize. Null means the
     * store never customized and gets App\Support\Modules::DEFAULTS.
     */
    public function up(): void
    {
        Schema::table('merchants', function (Blueprint $table) {
            $table->json('modules')->nullable()->after('table_ordering_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('merchants', function (Blueprint $table) {
            $table->dropColumn('modules');
        });
    }
};
