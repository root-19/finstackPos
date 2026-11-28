<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Feature ideas from stores ("Suggest a feature"), read by FinstackPOS
     * administrators. `plan` is the store's plan when it was sent (free,
     * trial or pro), so it stays true even after the store's plan changes.
     */
    public function up(): void
    {
        Schema::create('feature_suggestions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('category', 30);
            $table->string('title', 120);
            $table->text('details')->nullable();
            $table->string('plan', 10);
            $table->string('status', 20)->default('new');
            $table->text('admin_note')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index(['plan', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('feature_suggestions');
    }
};
