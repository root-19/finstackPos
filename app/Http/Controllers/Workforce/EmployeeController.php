<?php

namespace App\Http\Controllers\Workforce;

use App\Enums\Permission;
use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Employee;
use App\Models\PayrollItem;
use App\Models\PayrollRun;
use App\Models\Role;
use App\Models\SalaryRate;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Employee list: each employee's login and role, government numbers, and
 * salaries. Owner only (Permission::EmployeesManage), since it holds
 * sensitive pay data and decides who can access what.
 */
class EmployeeController extends Controller
{
    public function index(Request $request): Response
    {
        $employees = Employee::query()
            ->with(['user.staffRole:id,name', 'salaryRates'])
            ->orderByRaw("case status when 'active' then 0 else 1 end")
            ->orderBy('name')
            ->get();

        $linked = $employees->pluck('user_id')->filter()->all();

        return Inertia::render('Workforce/Employees', [
            'employees' => $employees->map(fn (Employee $e) => [
                'id' => $e->id,
                'employee_no' => $e->employee_no,
                'name' => $e->name,
                'position' => $e->position,
                'email' => $e->email,
                'phone' => $e->phone,
                'hired_on' => $e->hired_on?->toDateString(),
                'status' => $e->status,
                'branch_id' => $e->branch_id,
                'user_id' => $e->user_id,
                'account' => $e->user ? $this->account($e->user) : null,
                'sss_no' => $e->sss_no,
                'philhealth_no' => $e->philhealth_no,
                'pagibig_no' => $e->pagibig_no,
                'tin' => $e->tin,
                'salary' => $e->salaryRates->first(fn ($r) => $r->effective_from->lte(today()))?->only([
                    'pay_type', 'rate_cents', 'pay_frequency', 'allowance_cents', 'overtime_rate_bps',
                ]),
                'salary_history' => $e->salaryRates->map(fn (SalaryRate $r) => [
                    'id' => $r->id,
                    'pay_type' => $r->pay_type,
                    'rate_cents' => $r->rate_cents,
                    'pay_frequency' => $r->pay_frequency,
                    'allowance_cents' => $r->allowance_cents,
                    'overtime_rate_bps' => $r->overtime_rate_bps,
                    'effective_from' => $r->effective_from->toDateString(),
                    'note' => $r->note,
                ])->values(),
            ]),
            // Logins (the owner included) not yet linked to an employee.
            'linkableUsers' => User::query()
                ->with('staffRole:id,name')
                ->where('merchant_id', $request->user()->merchant_id)
                ->whereNotIn('id', $linked)
                ->orderByRaw("case role when 'owner' then 0 else 1 end")
                ->orderBy('name')
                ->get()
                ->map(fn (User $u) => $this->account($u)),
            'roles' => Role::query()->withCount('users')->orderBy('name')->get(['id', 'name', 'permissions']),
            'branches' => Branch::query()->orderBy('id')->get(['id', 'name', 'is_active']),
            'permissions' => collect(Permission::assignable())->map(fn (Permission $p) => [
                'value' => $p->value,
                'label' => $p->label(),
                'description' => $p->description(),
            ]),
        ]);
    }

    /**
     * A new employee always gets a login (they clock in and out with it),
     * unless an existing login is being turned into an employee.
     */
    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $linking = isset($data['user_id']);
        $account = $linking ? null : $this->validatedAccount($request, required: true);

        $employee = DB::transaction(function () use ($request, $data, $account) {
            $employee = new Employee($data);
            $employee->user_id = $data['user_id'] ?? null;
            if ($account) {
                $employee->user_id = $this->saveAccount($request, null, $account, $data)->id;
            }
            $employee->save();
            $this->syncLoginBranch($employee);
            AuditLog::record($employee, 'created', null, ['name' => $employee->name, 'login' => $employee->user?->email]);

            return $employee;
        });

        return back()->with('success', $linking ? "{$employee->name} was added." : "{$employee->name} was added and can now log in.");
    }

    public function update(Request $request, Employee $employee): RedirectResponse
    {
        $data = $this->validated($request, $employee);
        $user = $employee->user;
        // The owner's own login is managed from their profile, not here.
        $manageable = ! $user || (! $user->isOwner() && ! $user->is($request->user()));
        $account = $manageable ? $this->validatedAccount($request, required: false, user: $user) : null;

        DB::transaction(function () use ($request, $employee, $data, $user, $account) {
            $old = $employee->only(['name', 'position', 'status', 'user_id']);
            $employee->fill($data);
            if ($account) {
                $employee->user_id = $this->saveAccount($request, $user, $account, $data)->id;
            }
            $employee->save();
            $this->syncLoginBranch($employee);
            AuditLog::record($employee, 'updated', $old, $employee->only(['name', 'position', 'status', 'user_id']));
        });

        return back()->with('success', "{$employee->name} was updated.");
    }

    /**
     * Login fields: email and password, and a role that is either an
     * existing one or a new role created here with its permissions.
     * Returns null when an optional login section was left untouched.
     *
     * @return array<string, mixed>|null
     */
    private function validatedAccount(Request $request, bool $required, ?User $user = null): ?array
    {
        $creating = $user === null;
        if (! $required && $creating && ! $request->boolean('create_login')) {
            return null;
        }

        $merchantId = $request->user()->merchant_id;
        $data = $request->validate([
            'email' => ['required', 'string', 'lowercase', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user)],
            'password' => [$creating ? 'required' : 'nullable', 'confirmed', Password::defaults()],
            'role_mode' => ['required', Rule::in(['existing', 'new'])],
            'role_id' => ['nullable', 'required_if:role_mode,existing', 'integer', Rule::exists('roles', 'id')->where('merchant_id', $merchantId)],
            'new_role_name' => [
                'nullable', 'required_if:role_mode,new', 'string', 'max:60',
                Rule::unique('roles', 'name')->where('merchant_id', $merchantId),
                Rule::notIn(['owner', 'Owner', 'OWNER']),
            ],
            'new_role_permissions' => ['nullable', 'array'],
            // Only assignable permissions: the Employee List, payroll, and settings stay with the owner.
            'new_role_permissions.*' => ['string', 'distinct', Rule::in(array_column(Permission::assignable(), 'value'))],
        ], [
            'email.required' => 'Employees need an email to log in and clock in.',
            'email.unique' => 'That email already has a login.',
            'role_id.required_if' => 'Choose a role.',
            'new_role_name.required_if' => 'Name the new role.',
            'new_role_name.unique' => 'A role with that name already exists.',
        ]);

        return $data;
    }

    /**
     * Create or update the employee's login.
     *
     * @param  array<string, mixed>  $account
     * @param  array<string, mixed>  $employee
     */
    private function saveAccount(Request $request, ?User $user, array $account, array $employee): User
    {
        $roleId = $account['role_mode'] === 'new'
            ? Role::create(['name' => $account['new_role_name'], 'permissions' => array_values($account['new_role_permissions'] ?? [])])->id
            : (int) $account['role_id'];

        $user ??= tap(new User, function (User $u) use ($request) {
            $u->merchant()->associate($request->user()->merchant);
            $u->role = UserRole::Staff;
        });
        $user->name = $employee['name'];
        $user->email = $account['email'];
        if (! empty($account['password'])) {
            $user->password = Hash::make($account['password']);
        }
        $user->role_id = $roleId;
        $user->save();

        return $user;
    }

    public function destroy(Request $request, Employee $employee): RedirectResponse
    {
        $removeLogin = $request->boolean('remove_login');
        $user = $employee->user;

        DB::transaction(function () use ($employee, $removeLogin, $user, $request) {
            // Archived, not erased: payroll history keeps pointing at them.
            AuditLog::record($employee, 'archived', ['name' => $employee->name]);
            $employee->delete();

            // Their login can go too, but never the owner's or your own.
            if ($removeLogin && $user && ! $user->isOwner() && ! $user->is($request->user())) {
                $user->delete();
            }
        });

        return back()->with('success', "{$employee->name} was archived.");
    }

    /**
     * @return array<string, mixed>
     */
    private function account(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'is_owner' => $user->isOwner(),
            'role_id' => $user->role_id,
            'role_name' => $user->roleName(),
        ];
    }

    /**
     * Set a salary from a date. A change is a new effective-dated row, so
     * finalized payroll (which snapshots its salary) never changes.
     */
    public function storeSalary(Request $request, Employee $employee): RedirectResponse
    {
        $data = $request->validate([
            'pay_type' => ['required', Rule::in(SalaryRate::PAY_TYPES)],
            'rate' => ['required', 'numeric', 'min:0.01', 'max:99999999.99', 'decimal:0,2'],
            'pay_frequency' => ['required', Rule::in(SalaryRate::FREQUENCIES)],
            'allowance' => ['nullable', 'numeric', 'min:0', 'max:99999999.99', 'decimal:0,2'],
            'overtime_rate' => ['required', 'numeric', 'min:100', 'max:400', 'decimal:0,2'],
            'effective_from' => ['required', 'date_format:Y-m-d'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $existing = $employee->salaryRates()->whereDate('effective_from', $data['effective_from'])->first();
        if ($existing && $this->usedByFinalPayroll($employee, $data['effective_from'])) {
            throw ValidationException::withMessages([
                'effective_from' => 'A finalized payroll already used the salary from this date. Choose a later date for the change.',
            ]);
        }

        $values = [
            'pay_type' => $data['pay_type'],
            'rate_cents' => (int) round($data['rate'] * 100),
            'pay_frequency' => $data['pay_frequency'],
            'allowance_cents' => (int) round(($data['allowance'] ?? 0) * 100),
            'overtime_rate_bps' => (int) round($data['overtime_rate'] * 100),
            'effective_from' => $data['effective_from'],
            'note' => $data['note'] ?? null,
        ];

        DB::transaction(function () use ($employee, $existing, $values, $request) {
            $rate = $existing ?? new SalaryRate(['employee_id' => $employee->id]);
            $old = $existing?->only(array_keys($values));
            $rate->fill($values);
            $rate->created_by = $request->user()->id;
            $rate->save();
            AuditLog::record($employee, 'salary_set', $old, $values);
        });

        return back()->with('success', "Salary for {$employee->name} saved from {$data['effective_from']}.");
    }

    private function usedByFinalPayroll(Employee $employee, string $effectiveFrom): bool
    {
        return PayrollItem::query()
            ->where('employee_id', $employee->id)
            ->whereDate('period_end', '>=', $effectiveFrom)
            ->whereHas('run', fn ($q) => $q->whereIn('status', [PayrollRun::APPROVED, PayrollRun::PAID]))
            ->exists();
    }

    /**
     * @return array<string, mixed>
     */
    /**
     * Their login works at the employee's branch: tied to it, or (without
     * one) at any branch. The owner always works at every branch.
     */
    private function syncLoginBranch(Employee $employee): void
    {
        $user = $employee->user()->first();

        if ($user && ! $user->isOwner() && $user->branch_id !== $employee->branch_id) {
            $user->branch_id = $employee->branch_id;
            $user->save();
        }
    }

    private function validated(Request $request, ?Employee $employee = null): array
    {
        $merchantId = $request->user()->merchant_id;

        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            // Where they work (null: every branch).
            'branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')->where('merchant_id', $merchantId)],
            'employee_no' => ['nullable', 'string', 'max:30'],
            'position' => ['nullable', 'string', 'max:80'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'hired_on' => ['nullable', 'date_format:Y-m-d'],
            'status' => ['required', Rule::in(['active', 'inactive'])],
            // One employee per staff login, and only this store's logins.
            'user_id' => [
                'nullable', 'integer',
                Rule::exists('users', 'id')->where('merchant_id', $merchantId),
                Rule::unique('employees', 'user_id')->where('merchant_id', $merchantId)->whereNull('deleted_at')->ignore($employee),
            ],
            'sss_no' => ['nullable', 'string', 'max:30'],
            'philhealth_no' => ['nullable', 'string', 'max:30'],
            'pagibig_no' => ['nullable', 'string', 'max:30'],
            'tin' => ['nullable', 'string', 'max:30'],
        ], [
            'user_id.unique' => 'That staff account is already linked to another employee.',
        ]);
    }
}
