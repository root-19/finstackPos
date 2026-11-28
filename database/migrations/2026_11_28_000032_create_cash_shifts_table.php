<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Cash shifts: a cashier opens a register with a starting float, moves
     * cash in or out with a reason, and closes with a blind count. Created
     * on the register (offline too) and synced by client_uuid, like sales.
     */
    public function up(): void
    {
        Schema::create('cash_shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->uuid('client_uuid');
            // The register (browser or desktop app) it was opened on.
            $table->string('terminal', 40);
            $table->foreignId('opened_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('opened_at');
            $table->timestamp('closed_at')->nullable();
            $table->unsignedBigInteger('opening_cash_cents');
            // [{id, type: in|out, amount_cents, reason, at, user_id}]
            $table->json('cash_moves')->nullable();
            $table->unsignedBigInteger('counted_cash_cents')->nullable();
            $table->timestamps();

            $table->unique(['merchant_id', 'client_uuid']);
            $table->index(['merchant_id', 'opened_at']);
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->foreignId('cash_shift_id')->nullable()->after('branch_id')->constrained('cash_shifts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropConstrainedForeignId('cash_shift_id');
        });
        Schema::dropIfExists('cash_shifts');
    }
};
