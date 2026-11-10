<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Book a demo" requests from the landing page. Kept even when the
 * notification email fails, so no request is ever lost.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('demo_requests', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->string('business_name', 150);
            $table->string('email');
            $table->string('phone', 30)->nullable();
            // The slot the visitor picked, stored in UTC (chosen in Philippine time).
            $table->timestamp('preferred_at');
            $table->text('notes')->nullable();
            $table->timestamp('notified_at')->nullable();
            $table->timestamps();

            $table->index('preferred_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('demo_requests');
    }
};
