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
        Schema::create('merchants', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->char('currency', 3)->default('PHP');
            // Basis points (1200 = 12%) so tax math stays in integers.
            $table->unsignedInteger('tax_rate_bps')->default(0);
            $table->boolean('prices_include_tax')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('merchant_id')->nullable()->after('id')->constrained()->nullOnDelete();
            $table->string('role')->default('owner')->after('merchant_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('merchant_id');
            $table->dropColumn('role');
        });

        Schema::dropIfExists('merchants');
    }
};
