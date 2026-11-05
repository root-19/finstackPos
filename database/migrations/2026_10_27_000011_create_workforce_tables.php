<?php

use App\Models\DeductionRule;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Employee management: employees (linked to staff accounts where they
 * exist), shifts, attendance, effective-dated salaries, configurable
 * deduction rules, payroll runs with snapshotted calculations, and an
 * audit log. Additive only: no existing data is changed or removed.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            // The staff login, if this employee has one. Never two employees per account.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('employee_no', 30)->nullable();
            $table->string('name');
            $table->string('position', 80)->nullable();
            $table->string('email')->nullable();
            $table->string('phone', 30)->nullable();
            $table->date('hired_on')->nullable();
            $table->string('status', 20)->default('active');
            // Government numbers: encrypted at rest (Eloquent "encrypted" cast).
            $table->text('sss_no')->nullable();
            $table->text('philhealth_no')->nullable();
            $table->text('pagibig_no')->nullable();
            $table->text('tin')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['merchant_id', 'user_id']);
            $table->index(['merchant_id', 'status']);
        });

        Schema::create('shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            // UTC; may cross midnight (overnight shifts).
            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            $table->unsignedSmallInteger('break_minutes')->default(0);
            $table->string('position', 80)->nullable();
            $table->string('notes', 255)->nullable();
            $table->string('status', 20)->default('draft');
            // Shifts created together by a weekly repeat.
            $table->uuid('series_id')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['merchant_id', 'starts_at']);
            $table->index(['employee_id', 'starts_at']);
        });

        Schema::create('attendance_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained()->nullOnDelete();
            // The store-local day this work belongs to (the clock-in day).
            $table->date('work_date');
            $table->string('type', 20)->default('worked');
            $table->dateTime('clock_in_at')->nullable();
            $table->dateTime('clock_out_at')->nullable();
            $table->unsignedSmallInteger('break_minutes')->default(0);
            $table->string('status', 20)->default('pending');
            $table->string('source', 20)->default('manual');
            $table->string('note', 500)->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();

            $table->index(['merchant_id', 'work_date']);
            $table->index(['employee_id', 'work_date']);
        });

        Schema::create('salary_rates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('pay_type', 20);
            $table->unsignedBigInteger('rate_cents');
            $table->string('pay_frequency', 20);
            $table->unsignedBigInteger('allowance_cents')->default(0);
            $table->unsignedInteger('overtime_rate_bps')->default(12500);
            $table->date('effective_from');
            $table->string('note', 255)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // A rate is never edited in place: a change is a new row with its own date.
            $table->unique(['employee_id', 'effective_from']);
        });

        Schema::create('deduction_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $table->string('code', 30);
            $table->string('name', 100);
            $table->boolean('enabled')->default(false);
            $table->string('method', 20);
            $table->string('basis', 30);
            $table->unsignedInteger('employee_rate_bps')->nullable();
            $table->unsignedInteger('employer_rate_bps')->nullable();
            $table->unsignedBigInteger('fixed_cents')->nullable();
            $table->unsignedBigInteger('floor_cents')->nullable();
            $table->unsignedBigInteger('ceiling_cents')->nullable();
            $table->json('brackets')->nullable();
            $table->string('applies_to', 20)->default('all');
            $table->json('employee_ids')->nullable();
            // Custom deductions (loans, cash advances): documented and capped.
            $table->unsignedBigInteger('total_limit_cents')->nullable();
            $table->string('authorization_ref', 255)->nullable();
            $table->date('effective_from');
            $table->boolean('verified')->default(false);
            $table->text('source_note')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['merchant_id', 'code', 'effective_from']);
        });

        Schema::create('payroll_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $table->date('period_start');
            $table->date('period_end');
            $table->string('pay_frequency', 20);
            $table->string('status', 20)->default('draft');
            $table->string('notes', 500)->nullable();
            $table->unsignedBigInteger('gross_cents')->default(0);
            $table->unsignedBigInteger('deductions_cents')->default(0);
            $table->bigInteger('net_cents')->default(0);
            $table->unsignedBigInteger('employer_cents')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index(['merchant_id', 'period_start']);
        });

        Schema::create('payroll_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payroll_run_id')->constrained()->cascadeOnDelete();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            // Copied from the run so the database itself blocks duplicate pay.
            $table->date('period_start');
            $table->date('period_end');
            $table->unsignedBigInteger('basic_cents')->default(0);
            $table->unsignedBigInteger('earnings_cents')->default(0);
            $table->unsignedBigInteger('gross_cents')->default(0);
            $table->unsignedBigInteger('deductions_cents')->default(0);
            $table->bigInteger('net_cents')->default(0);
            $table->unsignedBigInteger('employer_cents')->default(0);
            // Snapshot of every input and step of the calculation.
            $table->json('breakdown');
            $table->timestamps();

            $table->unique(['employee_id', 'period_start', 'period_end']);
        });

        Schema::create('payroll_item_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payroll_item_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 20);
            $table->string('code', 40);
            $table->string('label', 120);
            $table->unsignedBigInteger('amount_cents');
            $table->string('detail', 500)->nullable();
            $table->boolean('manual')->default(false);
            $table->foreignId('deduction_rule_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('subject_type', 60);
            $table->unsignedBigInteger('subject_id');
            $table->string('action', 40);
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('reason', 500)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['merchant_id', 'subject_type', 'subject_id']);
        });

        DB::transaction(function () {
            // Existing staff accounts become employees, once each.
            foreach (DB::table('users')->whereNotNull('merchant_id')->where('role', 'staff')->get() as $user) {
                DB::table('employees')->insertOrIgnore([
                    'merchant_id' => $user->merchant_id,
                    'user_id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'status' => 'active',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            // Statutory templates: disabled and unverified until the owner reviews them.
            foreach (DB::table('merchants')->pluck('id') as $merchantId) {
                DeductionRule::insertDefaultsFor($merchantId);
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        foreach (['audit_logs', 'payroll_item_lines', 'payroll_items', 'payroll_runs', 'deduction_rules', 'salary_rates', 'attendance_records', 'shifts', 'employees'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
