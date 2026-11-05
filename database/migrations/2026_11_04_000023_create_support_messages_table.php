<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Support chat: one conversation per store between its people and the
 * FinstackPOS administrators. Open to every plan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            // Who wrote it: a store user, or an administrator (from_admin).
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->boolean('from_admin')->default(false);
            $table->text('body');
            // When the other side opened it.
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['merchant_id', 'created_at']);
            $table->index(['from_admin', 'read_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_messages');
    }
};
