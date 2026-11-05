<?php

use App\Enums\UserRole;
use App\Models\AttendanceRecord;
use App\Models\AuditLog;
use App\Models\DeductionRule;
use App\Models\Employee;
use App\Models\Merchant;
use App\Models\PayrollItem;
use App\Models\PayrollRun;
use App\Models\SalaryRate;
use App\Models\Shift;
use App\Models\User;
use App\Services\Payroll\PayrollCalculator;
use Illuminate\Support\Carbon;

// These tests cover Pro features; every store they create is subscribed.
beforeEach(fn () => Merchant::creating(fn (Merchant $m) => $m->subscribed_until ??= now()->addYear()));

function owner(?Merchant $merchant = null): User
{
    $user = User::factory()->make();
    $user->merchant()->associate($merchant ?? Merchant::factory()->create());
    $user->role = UserRole::Owner;
    $user->save();

    return $user;
}

function employee(Merchant $merchant, array $attributes = [], ?User $account = null): Employee
{
    $employee = new Employee(array_merge(['name' => 'Juan Dela Cruz', 'status' => 'active'], $attributes));
    $employee->merchant_id = $merchant->id;
    $employee->user_id = $account?->id;
    $employee->save();

    return $employee;
}

function salary(Employee $employee, array $attributes = []): SalaryRate
{
    $rate = new SalaryRate(array_merge([
        'employee_id' => $employee->id,
        'pay_type' => 'monthly',
        'rate_cents' => 3000000,
        'pay_frequency' => 'semi_monthly',
        'allowance_cents' => 0,
        'overtime_rate_bps' => 12500,
        'effective_from' => '2026-01-01',
    ], $attributes));
    $rate->merchant_id = $employee->merchant_id;
    $rate->save();

    return $rate;
}

function attendance(Employee $employee, string $date, ?string $in, ?string $out, int $break = 0, string $type = 'worked', ?Shift $shift = null): AttendanceRecord
{
    $tz = 'Asia/Manila';
    $record = new AttendanceRecord([
        'employee_id' => $employee->id,
        'shift_id' => $shift?->id,
        'work_date' => $date,
        'type' => $type,
        'clock_in_at' => $in ? Carbon::parse("{$date} {$in}", $tz)->utc() : null,
        'clock_out_at' => $out ? Carbon::parse("{$date} {$out}", $tz)->utc() : null,
        'break_minutes' => $break,
        'status' => AttendanceRecord::APPROVED,
        'source' => 'manual',
    ]);
    $record->merchant_id = $employee->merchant_id;
    $record->save();

    return $record;
}

function enableStatutory(): void
{
    DeductionRule::query()->update(['enabled' => true]);
}

function runPayroll(User $owner, array $employeeIds, string $start = '2026-10-01', string $end = '2026-10-15', string $frequency = 'semi_monthly'): PayrollRun
{
    test()->actingAs($owner)->post('/team/payroll', [
        'period_start' => $start,
        'period_end' => $end,
        'pay_frequency' => $frequency,
        'employee_ids' => $employeeIds,
    ])->assertSessionHasNoErrors();

    return PayrollRun::query()->latest('id')->firstOrFail();
}

function shiftPayload(Employee $employee, array $overrides = []): array
{
    return array_merge([
        'employee_id' => $employee->id,
        'date' => '2026-11-02',
        'start_time' => '09:00',
        'end_time' => '17:00',
        'break_minutes' => 60,
        'status' => 'published',
    ], $overrides);
}

// Access

test('salary, payroll, deductions and the employee list stay with the owner', function () {
    $manager = staffWith(['pos.sell', 'products.manage', 'categories.manage', 'sales.view', 'schedules.manage', 'attendance.manage']);

    $this->actingAs($manager);
    foreach (['/team/employees', '/team/payroll', '/team/deductions'] as $url) {
        $this->get($url)->assertForbidden();
    }
    $this->get('/team/schedule')->assertOk();
    $this->get('/team/attendance')->assertOk();
});

test('scheduling and attendance need their own permissions', function () {
    $this->actingAs(staffWith(['pos.sell']));
    $this->get('/team/schedule')->assertForbidden();
    $this->get('/team/attendance')->assertForbidden();
});

test('a staff login can be linked to only one employee', function () {
    $owner = owner();
    $staff = staffWith(['pos.sell'], $owner->merchant);
    employee($owner->merchant, ['name' => 'First'], $staff);

    $this->actingAs($owner)->post('/team/employees', [
        'name' => 'Second', 'status' => 'active', 'user_id' => $staff->id,
    ])->assertSessionHasErrors('user_id');
});

test('government numbers are encrypted at rest', function () {
    $owner = owner();
    $this->actingAs($owner)->post('/team/employees', [
        'name' => 'Ana', 'status' => 'active', 'sss_no' => '34-1234567-8',
        'email' => 'ana@example.com', 'password' => 'password', 'password_confirmation' => 'password',
        'role_mode' => 'existing', 'role_id' => $owner->merchant->roles()->first()->id,
    ])->assertSessionHasNoErrors();

    $raw = DB::table('employees')->where('name', 'Ana')->value('sss_no');
    expect($raw)->not->toContain('34-1234567-8')
        ->and(Employee::firstWhere('name', 'Ana')->sss_no)->toBe('34-1234567-8');
});

// Scheduling

test('an overnight shift ends the next day', function () {
    $owner = owner();
    $employee = employee($owner->merchant);

    $this->actingAs($owner)->post('/team/shifts', shiftPayload($employee, [
        'start_time' => '22:00', 'end_time' => '06:00', 'break_minutes' => 30,
    ]))->assertSessionHasNoErrors();

    $shift = Shift::firstOrFail();
    expect($shift->ends_at->diffInHours($shift->starts_at, true))->toEqual(8.0)
        ->and($shift->netMinutes())->toBe(450);
});

test('overlapping shifts for the same employee are refused', function () {
    $owner = owner();
    $employee = employee($owner->merchant);
    $this->actingAs($owner)->post('/team/shifts', shiftPayload($employee));

    $this->post('/team/shifts', shiftPayload($employee, ['start_time' => '16:00', 'end_time' => '20:00', 'break_minutes' => 0]))
        ->assertSessionHasErrors('start_time');

    // Back-to-back is fine, and a cancelled shift no longer blocks.
    $this->post('/team/shifts', shiftPayload($employee, ['start_time' => '17:00', 'end_time' => '20:00', 'break_minutes' => 0]))
        ->assertSessionHasNoErrors();
    $this->post('/team/shifts/'.Shift::first()->id.'/cancel')->assertSessionHasNoErrors();
    $this->post('/team/shifts', shiftPayload($employee, ['start_time' => '10:00', 'end_time' => '12:00', 'break_minutes' => 0]))
        ->assertSessionHasNoErrors();
});

test('a weekly repeat creates every shift, or none if one clashes', function () {
    $owner = owner();
    $employee = employee($owner->merchant);
    $repeat = ['repeat_weekdays' => [1, 3, 5], 'repeat_until' => '2026-11-15'];

    $this->actingAs($owner)->post('/team/shifts', shiftPayload($employee, $repeat))->assertSessionHasNoErrors();
    expect(Shift::count())->toBe(6)
        ->and(Shift::pluck('series_id')->unique())->toHaveCount(1);

    Shift::query()->delete();
    $this->post('/team/shifts', shiftPayload($employee, ['date' => '2026-11-11']));
    $this->post('/team/shifts', shiftPayload($employee, $repeat))->assertSessionHasErrors('start_time');
    expect(Shift::count())->toBe(1);
});

test('shift times are validated', function () {
    $owner = owner();
    $employee = employee($owner->merchant);
    $this->actingAs($owner);

    $this->post('/team/shifts', shiftPayload($employee, ['break_minutes' => 480]))->assertSessionHasErrors('break_minutes');
    $this->post('/team/shifts', shiftPayload($employee, ['end_time' => '09:00']))->assertSessionHasErrors('end_time');
    $this->post('/team/shifts', shiftPayload($employee, ['start_time' => '25:00']))->assertSessionHasErrors('start_time');
});

// Attendance

test('manual attendance needs a reason and corrections keep old and new values', function () {
    $owner = owner();
    $employee = employee($owner->merchant);
    $entry = ['employee_id' => $employee->id, 'work_date' => '2026-10-05', 'type' => 'worked', 'clock_in' => '08:00', 'clock_out' => '17:00', 'break_minutes' => 60];

    $this->actingAs($owner)->post('/team/attendance', $entry)->assertSessionHasErrors('reason');
    $this->post('/team/attendance', [...$entry, 'reason' => 'Forgot to clock in'])->assertSessionHasNoErrors();

    $record = AttendanceRecord::firstOrFail();
    expect($record->status)->toBe('approved')->and($record->minutes()['worked'])->toBe(480);

    $this->put("/team/attendance/{$record->id}", [...$entry, 'clock_out' => '18:00', 'reason' => 'Stayed late for inventory'])->assertSessionHasNoErrors();

    $log = AuditLog::where('action', 'corrected')->firstOrFail();
    expect($log->reason)->toBe('Stayed late for inventory')
        ->and($log->old_values['clock_out_at'])->not->toBe($log->new_values['clock_out_at']);
});

test('employees clock in and out, and it waits for approval', function () {
    $owner = owner();
    $staff = staffWith(['pos.sell'], $owner->merchant);
    $employee = employee($owner->merchant, [], $staff);

    $this->actingAs($staff)->post('/my-work/clock-in')->assertSessionHasNoErrors();
    $this->post('/my-work/clock-in')->assertSessionHasErrors('clock');
    $this->travel(5)->hours();
    $this->post('/my-work/clock-out', ['break_minutes' => 30])->assertSessionHasNoErrors();

    $record = $employee->attendance()->firstOrFail();
    expect($record->status)->toBe('pending')
        ->and($record->minutes()['worked'])->toBe(270);

    $this->actingAs($owner)->post('/team/attendance/review', ['ids' => [$record->id], 'decision' => 'approved'])->assertSessionHasNoErrors();
    expect($record->fresh()->status)->toBe('approved');
});

// Payroll calculation

test('semi-monthly payroll itemizes statutory deductions and keeps employer shares out of net pay', function () {
    $owner = owner();
    $employee = employee($owner->merchant);
    salary($employee);
    enableStatutory();

    $item = runPayroll($owner, [$employee->id])->items()->with('lines')->firstOrFail();

    // ₱30,000 monthly → ₱15,000 basic. SSS 5% of 30,000 = 1,500 → 750; PhilHealth 2.5% → 375;
    // Pag-IBIG 2% of the 10,000 ceiling = 200 → 100; tax: 27,550 taxable → 15% over 20,833 = 1,007.55 → 503.78.
    expect($item->basic_cents)->toBe(1500000)
        ->and($item->lineTotal('deduction', 'sss'))->toBe(75000)
        ->and($item->lineTotal('deduction', 'philhealth'))->toBe(37500)
        ->and($item->lineTotal('deduction', 'pagibig'))->toBe(10000)
        ->and($item->lineTotal('deduction', 'withholding_tax'))->toBe(50378)
        ->and($item->deductions_cents)->toBe(172878)
        ->and($item->net_cents)->toBe(1500000 - 172878)
        ->and($item->employer_cents)->toBe(150000 + 37500 + 10000)
        ->and($item->breakdown['warnings'])->toContain('“SSS contribution” uses rates that have not been marked verified.');
});

test('disabled rules are not applied', function () {
    $owner = owner();
    $employee = employee($owner->merchant);
    salary($employee);

    $item = runPayroll($owner, [$employee->id])->items()->firstOrFail();

    expect($item->deductions_cents)->toBe(0)->and($item->net_cents)->toBe(1500000);
});

test('hourly pay counts regular hours and overtime from approved attendance only', function () {
    $owner = owner();
    $employee = employee($owner->merchant);
    salary($employee, ['pay_type' => 'hourly', 'rate_cents' => 10000, 'pay_frequency' => 'weekly']);
    attendance($employee, '2026-10-05', '08:00', '19:00', 60); // 10h: 8 regular + 2 OT
    attendance($employee, '2026-10-06', '08:00', '17:00', 60)->update(['status' => 'pending']);

    $item = runPayroll($owner, [$employee->id], '2026-10-05', '2026-10-11', 'weekly')->items()->firstOrFail();

    expect($item->basic_cents)->toBe(80000)          // 8h × ₱100
        ->and($item->lineTotal('earning', 'overtime'))->toBe(25000) // 2h × ₱100 × 125%
        ->and($item->gross_cents)->toBe(105000);
});

test('monthly pay deducts absences and tardiness at the daily and hourly rate', function () {
    $owner = owner();
    $employee = employee($owner->merchant);
    salary($employee, ['rate_cents' => 2610000]); // daily ₱1,200, hourly ₱150
    $shift = new Shift(['employee_id' => $employee->id, 'starts_at' => Carbon::parse('2026-10-06 08:00', 'Asia/Manila')->utc(), 'ends_at' => Carbon::parse('2026-10-06 17:00', 'Asia/Manila')->utc(), 'break_minutes' => 60, 'status' => 'published']);
    $shift->merchant_id = $owner->merchant_id;
    $shift->save();

    attendance($employee, '2026-10-05', null, null, 0, 'absent');
    attendance($employee, '2026-10-06', '08:20', '17:00', 60, 'worked', $shift);

    $item = runPayroll($owner, [$employee->id])->items()->with('lines')->firstOrFail();

    expect($item->basic_cents)->toBe(1305000)
        ->and($item->lineTotal('deduction', 'absences'))->toBe(120000)
        ->and($item->lineTotal('deduction', 'tardiness'))->toBe(5000) // 20 min × ₱150/h
        ->and($item->net_cents)->toBe(1305000 - 125000);
});

test('rounding is half up in centavos', function () {
    expect(PayrollCalculator::div(5, 2))->toBe(3)
        ->and(PayrollCalculator::div(4, 3))->toBe(1)
        ->and(PayrollCalculator::div(201510, 4))->toBe(50378);
});

test('the same employee cannot be paid twice for the same or an overlapping period', function () {
    $owner = owner();
    $employee = employee($owner->merchant);
    salary($employee);
    runPayroll($owner, [$employee->id]);

    $this->post('/team/payroll', ['period_start' => '2026-10-10', 'period_end' => '2026-10-25', 'pay_frequency' => 'semi_monthly', 'employee_ids' => [$employee->id]])
        ->assertSessionHasErrors('employee_ids');
    expect(PayrollRun::count())->toBe(1);
});

test('payroll moves draft → review → approved → paid and is final once approved', function () {
    $owner = owner();
    $employee = employee($owner->merchant);
    salary($employee);
    attendance($employee, '2026-10-05', '08:00', '17:00', 60);
    $run = runPayroll($owner, [$employee->id]);

    $this->post("/team/payroll/{$run->id}/status", ['status' => 'approved'])->assertSessionHasErrors('status');
    $this->post("/team/payroll/{$run->id}/status", ['status' => 'review'])->assertSessionHasNoErrors();
    $this->post("/team/payroll/{$run->id}/status", ['status' => 'approved'])->assertSessionHasNoErrors();

    expect($run->fresh()->approved_by)->toBe($owner->id);
    $this->post("/team/payroll/{$run->id}/recalculate")->assertSessionHasErrors('status');
    $this->delete("/team/payroll/{$run->id}")->assertStatus(422);

    // Paid attendance is locked.
    $this->post('/team/attendance', ['employee_id' => $employee->id, 'work_date' => '2026-10-07', 'type' => 'absent', 'reason' => 'late entry'])
        ->assertSessionHasErrors('work_date');

    $this->post("/team/payroll/{$run->id}/status", ['status' => 'paid'])->assertSessionHasNoErrors();
    expect($run->fresh()->status)->toBe('paid');
});

test('finalized payroll keeps its numbers when salaries and rules change later', function () {
    $owner = owner();
    $employee = employee($owner->merchant);
    salary($employee);
    $run = runPayroll($owner, [$employee->id]);
    $this->post("/team/payroll/{$run->id}/status", ['status' => 'review']);
    $this->post("/team/payroll/{$run->id}/status", ['status' => 'approved']);
    $before = PayrollItem::firstOrFail()->only(['gross_cents', 'net_cents', 'breakdown']);

    // Changing the salary from the same date is refused; a later date is fine.
    $this->post("/team/employees/{$employee->id}/salary", ['pay_type' => 'monthly', 'rate' => '40000', 'pay_frequency' => 'semi_monthly', 'overtime_rate' => '125', 'effective_from' => '2026-01-01'])
        ->assertSessionHasErrors('effective_from');
    $this->post("/team/employees/{$employee->id}/salary", ['pay_type' => 'monthly', 'rate' => '40000', 'pay_frequency' => 'semi_monthly', 'overtime_rate' => '125', 'effective_from' => '2026-10-16'])
        ->assertSessionHasNoErrors();
    enableStatutory();

    expect(PayrollItem::firstOrFail()->only(['gross_cents', 'net_cents', 'breakdown']))->toBe($before);

    $next = runPayroll($owner, [$employee->id], '2026-10-16', '2026-10-31')->items()->firstOrFail();
    expect($next->basic_cents)->toBe(2000000);
});

test('bonuses and commissions can be added to a draft payslip', function () {
    $owner = owner();
    $employee = employee($owner->merchant);
    salary($employee);
    $run = runPayroll($owner, [$employee->id]);
    $item = $run->items()->firstOrFail();

    $this->post("/team/payroll/{$run->id}/items/{$item->id}/earnings", ['code' => 'bonus', 'label' => 'Sales bonus', 'amount' => '1500.50'])->assertSessionHasNoErrors();
    $this->post("/team/payroll/{$run->id}/recalculate")->assertSessionHasNoErrors();

    expect($item->fresh()->gross_cents)->toBe(1500000 + 150050);
});

// Deductions

test('deduction changes need a reason and record old and new values', function () {
    $owner = owner();
    $this->actingAs($owner);
    $rule = DeductionRule::where('code', 'pagibig')->firstOrFail();
    $payload = [
        'code' => 'pagibig', 'name' => 'Pag-IBIG', 'enabled' => true, 'method' => 'percentage', 'basis' => 'monthly_basic',
        'employee_rate' => '2', 'employer_rate' => '2', 'ceiling' => '10000', 'applies_to' => 'all',
        'effective_from' => '2024-02-01', 'verified' => true,
    ];

    $this->put("/team/deductions/{$rule->id}", $payload)->assertSessionHasErrors('change_reason');
    $this->put("/team/deductions/{$rule->id}", [...$payload, 'change_reason' => 'Checked against HDMF circular'])->assertSessionHasNoErrors();

    $log = AuditLog::where('subject_type', 'DeductionRule')->firstOrFail();
    expect($log->old_values['verified'])->toBeFalse()
        ->and($log->new_values['verified'])->toBeTrue()
        ->and($log->reason)->toBe('Checked against HDMF circular');
});

test('custom deductions need a documented authorization and stop at their balance', function () {
    $owner = owner();
    $employee = employee($owner->merchant);
    salary($employee);
    $loan = [
        'code' => 'custom', 'name' => 'Cash advance', 'enabled' => true, 'method' => 'fixed', 'basis' => 'period_gross',
        'fixed_amount' => '3000', 'applies_to' => 'selected', 'employee_ids' => [$employee->id], 'total_limit' => '5000',
        'effective_from' => '2026-01-01', 'verified' => true, 'change_reason' => 'Signed cash advance',
    ];

    $this->actingAs($owner)->post('/team/deductions', $loan)->assertSessionHasErrors('authorization_ref');
    $this->post('/team/deductions', [...$loan, 'authorization_ref' => 'CA-2026-001'])->assertSessionHasNoErrors();

    $first = runPayroll($owner, [$employee->id]);
    $this->post("/team/payroll/{$first->id}/status", ['status' => 'review']);
    $this->post("/team/payroll/{$first->id}/status", ['status' => 'approved']);
    $second = runPayroll($owner, [$employee->id], '2026-10-16', '2026-10-31');

    expect($first->items()->first()->lineTotal('deduction', 'custom'))->toBe(300000)
        ->and($second->items()->first()->lineTotal('deduction', 'custom'))->toBe(200000);
});

test('bracket tables apply the matching employee and employer amounts', function () {
    $owner = owner();
    $employee = employee($owner->merchant);
    salary($employee);
    $this->actingAs($owner)->post('/team/deductions', [
        'code' => 'sss', 'name' => 'SSS (table)', 'enabled' => true, 'method' => 'bracket', 'basis' => 'monthly_gross',
        'brackets' => [
            ['min' => 0, 'max' => 20000, 'employee' => 500, 'employer' => 1000],
            ['min' => 20000, 'max' => null, 'employee' => 1750, 'employer' => 3500],
        ],
        'applies_to' => 'all', 'effective_from' => '2026-06-01', 'verified' => true, 'change_reason' => 'Use the official table',
    ])->assertSessionHasNoErrors();

    $item = runPayroll($owner, [$employee->id])->items()->firstOrFail();

    expect($item->lineTotal('deduction', 'sss'))->toBe(87500)  // ₱1,750 monthly ÷ 2
        ->and($item->lineTotal('employer', 'sss'))->toBe(175000);
});

// Self service

test('employees see only their own payslips, and only once approved', function () {
    $owner = owner();
    $staff = staffWith(['pos.sell'], $owner->merchant);
    $mine = employee($owner->merchant, ['name' => 'Me'], $staff);
    $other = employee($owner->merchant, ['name' => 'Someone else']);
    salary($mine);
    salary($other);
    $run = runPayroll($owner, [$mine->id, $other->id]);

    $this->actingAs($staff)->get('/my-work')->assertInertia(fn ($p) => $p->has('payslips', 0)->where('timezone', 'Asia/Manila')->has('serverTime'));

    $this->actingAs($owner)->post("/team/payroll/{$run->id}/status", ['status' => 'review']);
    $this->post("/team/payroll/{$run->id}/status", ['status' => 'approved']);

    $this->actingAs($staff)->get('/my-work')->assertInertia(fn ($p) => $p
        ->has('payslips', 1)
        ->where('payslips.0.employee', 'Me'));
});

test('accounts without an employee record cannot open my work', function () {
    $this->actingAs(staffWith(['pos.sell']))->get('/my-work')->assertForbidden();
});

test('an existing employee can be given a login with a role', function () {
    $owner = owner();
    $employee = employee($owner->merchant, ['name' => 'Maria']);
    $role = $owner->merchant->roles()->firstWhere('name', 'Cashier');

    $this->actingAs($owner)->post('/staff', [
        'name' => 'Maria', 'email' => 'maria@example.com', 'role_id' => $role->id,
        'password' => 'password', 'password_confirmation' => 'password', 'employee_id' => $employee->id,
    ])->assertSessionHasNoErrors();

    expect($employee->fresh()->user->email)->toBe('maria@example.com')
        ->and(Employee::count())->toBe(1);

    // Archiving can take the login with it.
    $this->delete("/team/employees/{$employee->id}", ['remove_login' => true])->assertSessionHasNoErrors();
    expect(User::where('email', 'maria@example.com')->exists())->toBeFalse();
});

test('adding an employee creates their login, with a new role if asked', function () {
    $owner = owner();

    $this->actingAs($owner)->post('/team/employees', ['name' => 'No Login', 'status' => 'active'])
        ->assertSessionHasErrors(['email', 'password']);

    $this->post('/team/employees', [
        'name' => 'Pedro', 'status' => 'active', 'position' => 'Barista',
        'email' => 'pedro@example.com', 'password' => 'password', 'password_confirmation' => 'password',
        'role_mode' => 'new', 'new_role_name' => 'Barista', 'new_role_permissions' => ['pos.sell', 'schedules.manage'],
    ])->assertSessionHasNoErrors();

    $user = User::firstWhere('email', 'pedro@example.com');
    expect($user->employee->name)->toBe('Pedro')
        ->and($user->roleName())->toBe('Barista')
        ->and($user->staffRole->permissions)->toBe(['pos.sell', 'schedules.manage']);

    // Owner-only pages cannot be put in a role.
    $this->post('/team/employees', [
        'name' => 'Sneaky', 'status' => 'active',
        'email' => 'sneaky@example.com', 'password' => 'password', 'password_confirmation' => 'password',
        'role_mode' => 'new', 'new_role_name' => 'Boss', 'new_role_permissions' => ['payroll.manage'],
    ])->assertSessionHasErrors('new_role_permissions.0');
});
