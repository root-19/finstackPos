<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Pro subscriptions: how long each store is paid up, and every payment
     * for it. Additive only; existing stores start on the free plan.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('merchants', 'subscribed_until')) {
            Schema::table('merchants', function (Blueprint $table) {
                $table->timestamp('subscribed_until')->nullable();
            });
        }

        if (! Schema::hasTable('subscription_payments')) {
            Schema::create('subscription_payments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
                $table->unsignedSmallInteger('months');
                $table->unsignedBigInteger('amount_cents');
                // paymongo, or manual for months granted by the operator.
                $table->string('provider', 20);
                $table->string('provider_id')->nullable()->unique();
                $table->string('status', 40);
                // Set once the payment is applied; never applied twice.
                $table->timestamp('period_start')->nullable();
                $table->timestamp('period_end')->nullable();
                $table->timestamp('paid_at')->nullable();
                $table->string('note')->nullable();
                $table->timestamps();

                $table->index(['merchant_id', 'created_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_payments');
        if (Schema::hasColumn('merchants', 'subscribed_until')) {
            Schema::table('merchants', function (Blueprint $table) {
                $table->dropColumn('subscribed_until');
            });
        }
    }
};
