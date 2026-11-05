import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import Modal from '@/Components/Modal';
import { Icon, NavIcon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';
import { Alert, Badge, CardHeader, ConfirmDialog, DialogLayout, Stat } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { toDateInput } from '@/lib/format';
import { PageProps, Permission } from '@/types';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { FormEventHandler, useEffect, useMemo, useState } from 'react';
import {
    Card,
    EmptyState,
    Field,
    FieldErrors,
    FREQUENCY_LABELS,
    formatDay,
    inputClass,
    PAY_TYPE_LABELS,
    peso,
    StatusBadge,
    toAmount,
} from './Partials/shared';
import { AccessChips, PERMISSION_ICONS, PermissionOption, RoleRow, RolesPanel, TabButton } from './Partials/Roles';

/** Initials for the avatar circle. */
const initials = (name: string) =>
    name
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0])
        .join('');

interface Salary {
    pay_type: 'monthly' | 'daily' | 'hourly';
    rate_cents: number;
    pay_frequency: string;
    allowance_cents: number;
    overtime_rate_bps: number;
}

interface SalaryHistory extends Salary {
    id: number;
    effective_from: string;
    note: string | null;
}

interface Employee {
    id: number;
    employee_no: string | null;
    name: string;
    position: string | null;
    email: string | null;
    phone: string | null;
    hired_on: string | null;
    status: 'active' | 'inactive';
    /** Where they work (null: every branch). */
    branch_id: number | null;
    user_id: number | null;
    account: Account | null;
    sss_no: string | null;
    philhealth_no: string | null;
    pagibig_no: string | null;
    tin: string | null;
    salary: Salary | null;
    salary_history: SalaryHistory[];
}

interface Account {
    id: number;
    name: string;
    email: string;
    is_owner: boolean;
    role_id: number | null;
    role_name: string;
}

const PER: Record<string, string> = {
    monthly: '/ month',
    daily: '/ day',
    hourly: '/ hour',
};

type Props = {
    employees: Employee[];
    linkableUsers: Account[];
    roles: RoleRow[];
    permissions: PermissionOption[];
    branches: BranchOption[];
};

type BranchOption = { id: number; name: string; is_active: boolean };

export default function Employees({ auth, employees, linkableUsers, roles, permissions, branches }: PageProps<Props>) {
    const branchName = (id: number | null) => (branches.length > 1 ? (id === null ? 'All branches' : (branches.find((b) => b.id === id)?.name ?? null)) : null);
    const [tab, setTab] = useState<'people' | 'roles'>('people');
    const [search, setSearch] = useState('');
    // undefined: closed, null: adding
    const [editing, setEditing] = useState<Employee | null | undefined>();
    const [salaryFor, setSalaryFor] = useState<Employee | null>(null);
    const [archiving, setArchiving] = useState<Employee | null>(null);
    const [removeLogin, setRemoveLogin] = useState(true);
    const [revoking, setRevoking] = useState<Account | null>(null);
    const roleError = (usePage().props.errors as FieldErrors).role;

    const changeRole = (account: Account, roleId: string) =>
        router.patch(route('staff.update', account.id), { role_id: Number(roleId) }, { preserveScroll: true });
    const revoke = () =>
        revoking &&
        router.delete(route('staff.destroy', revoking.id), {
            preserveScroll: true,
            onSuccess: () => setRevoking(null),
        });
    const makeEmployee = (account: Account) =>
        router.post(
            route('employees.store'),
            {
                name: account.name,
                email: account.email,
                status: 'active',
                user_id: account.id,
            },
            { preserveScroll: true },
        );

    const roleControl = (account: Account) =>
        account.is_owner || account.id === auth.user.id ? (
            <Badge tone="brand">{account.role_name}</Badge>
        ) : (
            <select
                value={account.role_id ?? ''}
                onChange={(e) => changeRole(account, e.target.value)}
                aria-label={`Role for ${account.name}`}
                className="input h-8 w-auto min-w-0 max-w-[12rem] py-1 pe-8 ps-2.5"
            >
                {account.role_id === null && <option value="">No role (no access)</option>}
                {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                        {role.name}
                    </option>
                ))}
            </select>
        );

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();

        return q ? employees.filter((e) => [e.name, e.position, e.employee_no, e.email].some((v) => v?.toLowerCase().includes(q))) : employees;
    }, [employees, search]);

    const active = employees.filter((e) => e.status === 'active').length;
    const withoutSalary = employees.filter((e) => e.status === 'active' && !e.salary).length;

    const archive = () => {
        if (archiving) {
            router.delete(route('employees.destroy', archiving.id), {
                data: { remove_login: removeLogin },
                preserveScroll: true,
                onSuccess: () => setArchiving(null),
            });
        }
    };

    return (
        <AuthenticatedLayout header={<PageHeader title="Employee List" subtitle="Your people, their logins and access, IDs, and pay rates" />}>
            <Head title="Employee List" />

            <div className="app-page">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="segmented" role="group" aria-label="Employee list sections">
                        <TabButton active={tab === 'people'} onClick={() => setTab('people')} count={employees.length}>
                            Employees
                        </TabButton>
                        <TabButton active={tab === 'roles'} onClick={() => setTab('roles')} count={roles.length}>
                            Roles & access
                        </TabButton>
                    </div>
                    {tab === 'people' && (
                        <button type="button" onClick={() => setEditing(null)} className="btn btn-primary">
                            <Icon name="plus" />
                            Add employee
                        </button>
                    )}
                </div>

                {roleError && <Alert tone="red">{roleError}</Alert>}

                {tab === 'roles' ? (
                    <RolesPanel roles={roles} permissions={permissions} />
                ) : (
                    <>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                            <Stat label="Active employees" value={String(active)} />
                            <Stat label="With a login" value={String(employees.filter((e) => e.account).length)} />
                            <Stat label="Need a salary" value={String(withoutSalary)} tone={withoutSalary > 0 ? 'amber' : undefined} />
                        </div>

                        <Card className="overflow-hidden">
                            <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
                                <div className="relative sm:max-w-sm">
                                    <Icon
                                        name="search"
                                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                                    />
                                    <input
                                        type="search"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search by name, position, email, or employee no."
                                        aria-label="Search employees"
                                        className="input ps-9"
                                    />
                                </div>
                            </div>

                            {shown.length === 0 ? (
                                <EmptyState
                                    title={employees.length ? 'No employees match your search' : 'No employees yet'}
                                    action={
                                        !employees.length && (
                                            <button type="button" onClick={() => setEditing(null)} className="btn btn-primary">
                                                <Icon name="plus" />
                                                Add employee
                                            </button>
                                        )
                                    }
                                >
                                    {!employees.length && 'Add the people you schedule and pay. Link them to a staff login so they can clock in.'}
                                </EmptyState>
                            ) : (
                                <ul className="divide-y divide-gray-100">
                                    {shown.map((e) => (
                                        <li key={e.id} className="flex flex-col gap-3 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:gap-4">
                                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold uppercase text-gray-700">
                                                    {initials(e.name)}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-gray-950">
                                                        {e.name}
                                                        {e.employee_no && (
                                                            <span className="ms-2 text-xs font-normal text-gray-500">#{e.employee_no}</span>
                                                        )}
                                                    </p>
                                                    <p className="truncate text-xs text-gray-500">
                                                        {[e.position, branchName(e.branch_id), e.account?.email ?? e.email].filter(Boolean).join(' · ') || '—'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 ps-12 lg:contents lg:ps-0">
                                                <div className="flex items-center gap-1 text-sm lg:w-56">
                                                    {e.account ? (
                                                        <>
                                                            {roleControl(e.account)}
                                                            {!e.account.is_owner && e.account.id !== auth.user.id && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setRevoking(e.account)}
                                                                    title="Remove login"
                                                                    aria-label={`Remove ${e.name}'s login`}
                                                                    className="btn btn-ghost btn-sm w-8 px-0 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                                                >
                                                                    <Icon name="x" />
                                                                </button>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditing(e)}
                                                            disabled={roles.length === 0}
                                                            className="btn btn-sm border border-dashed border-gray-300 text-gray-600 hover:border-brand-400 hover:text-brand-700"
                                                        >
                                                            <Icon name="plus" className="h-3.5 w-3.5" />
                                                            Give login
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="text-sm lg:w-44">
                                                    {e.salary ? (
                                                        <>
                                                            <p className="font-medium tabular-nums text-gray-950">
                                                                {peso(e.salary.rate_cents)}{' '}
                                                                <span className="font-normal text-gray-500">{PER[e.salary.pay_type]}</span>
                                                            </p>
                                                            <p className="text-xs text-gray-500">
                                                                Paid {FREQUENCY_LABELS[e.salary.pay_frequency]?.toLowerCase()}
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <Badge tone="amber">No salary set</Badge>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-1.5 ps-12 lg:w-72 lg:justify-end lg:ps-0">
                                                <StatusBadge status={e.status} />
                                                <button type="button" onClick={() => setSalaryFor(e)} className="btn btn-secondary btn-sm">
                                                    <Icon name="cash" />
                                                    Salary
                                                </button>
                                                <button type="button" onClick={() => setEditing(e)} className="btn btn-secondary btn-sm">
                                                    <Icon name="pencil" />
                                                    Edit
                                                </button>
                                                {e.account?.id !== auth.user.id && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setRemoveLogin(true);
                                                            setArchiving(e);
                                                        }}
                                                        className="btn btn-ghost btn-sm text-red-600 hover:bg-red-50 hover:text-red-700"
                                                    >
                                                        Archive
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>

                        {linkableUsers.length > 0 && (
                            <Card className="overflow-hidden">
                                <CardHeader
                                    title="Logins without an employee record"
                                    subtitle="Make them an employee to schedule them, track their time, and pay them."
                                />
                                <ul className="divide-y divide-gray-100">
                                    {linkableUsers.map((a) => (
                                        <li key={a.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-gray-950">
                                                    {a.name}
                                                    {a.id === auth.user.id && <span className="ms-2 text-xs font-normal text-gray-500">(you)</span>}
                                                </p>
                                                <p className="truncate text-xs text-gray-500">{a.email}</p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {roleControl(a)}
                                                <button type="button" onClick={() => makeEmployee(a)} className="btn btn-secondary btn-sm">
                                                    <Icon name="plus" />
                                                    Make employee
                                                </button>
                                                {!a.is_owner && a.id !== auth.user.id && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setRevoking(a)}
                                                        className="btn btn-ghost btn-sm text-red-600 hover:bg-red-50 hover:text-red-700"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        )}
                    </>
                )}
            </div>

            <ConfirmDialog
                show={revoking !== null}
                title={`Remove ${revoking?.name ?? ''}’s login?`}
                confirmLabel="Remove login"
                onConfirm={revoke}
                onClose={() => setRevoking(null)}
            >
                They can no longer sign in. Their employee record, attendance, payslips, and past sales are kept.
            </ConfirmDialog>

            <EmployeeModal
                show={editing !== undefined}
                employee={editing ?? null}
                roles={roles}
                permissions={permissions}
                branches={branches}
                currentUserId={auth.user.id}
                onClose={() => setEditing(undefined)}
            />
            <SalaryModal employee={salaryFor} onClose={() => setSalaryFor(null)} />

            <ConfirmDialog
                show={archiving !== null}
                title={`Archive ${archiving?.name ?? ''}?`}
                confirmLabel="Archive"
                onConfirm={archive}
                onClose={() => setArchiving(null)}
            >
                <p>They leave the schedule and new payrolls. Their past attendance and payslips are kept.</p>
                {archiving?.account && !archiving.account.is_owner && (
                    <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={removeLogin} onChange={(e) => setRemoveLogin(e.target.checked)} className="checkbox" />
                        Also remove their login ({archiving.account.email})
                    </label>
                )}
            </ConfirmDialog>
        </AuthenticatedLayout>
    );
}

function EmployeeModal({
    show,
    employee,
    roles,
    permissions,
    branches,
    currentUserId,
    onClose,
}: {
    show: boolean;
    employee: Employee | null;
    roles: RoleRow[];
    permissions: PermissionOption[];
    branches: BranchOption[];
    currentUserId: number;
    onClose: () => void;
}) {
    const blank = {
        name: '',
        employee_no: '',
        position: '',
        email: '',
        phone: '',
        hired_on: '',
        status: 'active',
        branch_id: '' as number | '',
        sss_no: '',
        philhealth_no: '',
        pagibig_no: '',
        tin: '',
        // Login
        create_login: true,
        password: '',
        password_confirmation: '',
        role_mode: 'existing' as 'existing' | 'new',
        role_id: '' as number | '',
        new_role_name: '',
        new_role_permissions: ['pos.sell'] as Permission[],
    };
    const form = useForm(blank);
    const errors = form.errors as FieldErrors;
    const { data, setData } = form;

    const account = employee?.account ?? null;
    // The owner's own login (and yours) is changed from Profile, not here.
    const lockedAccount = account !== null && (account.is_owner || account.id === currentUserId);
    const hasLoginSection = !lockedAccount && (account !== null || data.create_login);

    useEffect(() => {
        if (show) {
            form.clearErrors();
            setData({
                ...blank,
                ...(employee && {
                    name: employee.name,
                    employee_no: employee.employee_no ?? '',
                    position: employee.position ?? '',
                    email: employee.account?.email ?? employee.email ?? '',
                    phone: employee.phone ?? '',
                    hired_on: employee.hired_on ?? '',
                    status: employee.status,
                    branch_id: employee.branch_id ?? '',
                    sss_no: employee.sss_no ?? '',
                    philhealth_no: employee.philhealth_no ?? '',
                    pagibig_no: employee.pagibig_no ?? '',
                    tin: employee.tin ?? '',
                    // Existing employees without a login: offer one, don't force it.
                    create_login: !employee.account,
                }),
                role_mode: roles.length ? 'existing' : 'new',
                role_id: employee?.account?.role_id ?? roles[0]?.id ?? '',
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show, employee]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const options = {
            preserveScroll: true,
            onSuccess: onClose,
            onFinish: () => form.reset('password', 'password_confirmation'),
        };
        if (employee) {
            form.put(route('employees.update', employee.id), options);
        } else {
            form.post(route('employees.store'), options);
        }
    };

    const text = (
        key: 'name' | 'employee_no' | 'position' | 'phone' | 'sss_no' | 'philhealth_no' | 'pagibig_no' | 'tin',
        label: string,
        props: Record<string, unknown> = {},
    ) => (
        <Field label={label} error={errors[key]}>
            <input className={inputClass} value={data[key]} onChange={(e) => setData(key, e.target.value)} {...props} />
        </Field>
    );

    const togglePermission = (value: Permission) =>
        setData(
            'new_role_permissions',
            data.new_role_permissions.includes(value) ? data.new_role_permissions.filter((p) => p !== value) : [...data.new_role_permissions, value],
        );
    const labelOf = (p: Permission) => permissions.find((o) => o.value === p)?.label ?? p;
    const selectedRole = roles.find((r) => r.id === data.role_id);

    return (
        <Modal show={show} onClose={onClose}>
            <form onSubmit={submit}>
                <DialogLayout
                    title={employee ? `Edit ${employee.name}` : 'Add employee'}
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <PrimaryButton disabled={form.processing}>{employee ? 'Save changes' : 'Add employee'}</PrimaryButton>
                        </>
                    }
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        {text('name', 'Full name', { required: true, autoFocus: true })}
                        {text('employee_no', 'Employee no. (optional)')}
                        {text('position', 'Position', { placeholder: 'e.g. Cashier, Barista' })}
                        <Field label="Date hired" error={errors.hired_on}>
                            <input type="date" className={inputClass} value={data.hired_on} onChange={(e) => setData('hired_on', e.target.value)} />
                        </Field>
                        {text('phone', 'Phone')}
                        <Field label="Status" error={errors.status}>
                            <select className={inputClass} value={data.status} onChange={(e) => setData('status', e.target.value)}>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </Field>
                        {branches.length > 1 && (
                            <Field
                                label="Branch"
                                error={errors.branch_id}
                                hint="Where they work. With a login, they sell there only and see only its sales and stock."
                                className="sm:col-span-2"
                            >
                                <select
                                    className={inputClass}
                                    value={data.branch_id}
                                    onChange={(e) => setData('branch_id', e.target.value === '' ? '' : Number(e.target.value))}
                                >
                                    <option value="">All branches</option>
                                    {branches.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}
                                            {!b.is_active ? ' (closed)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        )}
                    </div>

                    {/* Login account: used to sign in, clock in and out, and see payslips. */}
                    <fieldset className="mt-5 rounded-lg border border-gray-200 p-4">
                        <legend className="px-1 text-sm font-semibold text-gray-950">Login account</legend>

                        {lockedAccount ? (
                            <p className="text-sm text-gray-600">
                                Signs in as <strong className="font-medium text-gray-950">{account?.email}</strong> ({account?.role_name}). Change
                                this login from your Profile.
                            </p>
                        ) : (
                            <>
                                <p className="help mt-0">They use it to log in, time in and out, and see their schedule and payslips.</p>

                                {employee && !account && (
                                    <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={data.create_login}
                                            onChange={(e) => setData('create_login', e.target.checked)}
                                            className="checkbox"
                                        />
                                        Create a login for {employee.name}
                                    </label>
                                )}

                                {hasLoginSection && (
                                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                                        <Field label="Email (used to log in)" error={errors.email} className="sm:col-span-2">
                                            <input
                                                type="email"
                                                required
                                                autoComplete="off"
                                                className={inputClass}
                                                value={data.email}
                                                onChange={(e) => setData('email', e.target.value)}
                                            />
                                        </Field>
                                        <div>
                                            <InputLabel htmlFor="emp-password" value={account ? 'New password (optional)' : 'Password'} />
                                            <TextInput
                                                id="emp-password"
                                                type="password"
                                                value={data.password}
                                                onChange={(e) => setData('password', e.target.value)}
                                                className="mt-1 block w-full"
                                                autoComplete="new-password"
                                                required={!account}
                                            />
                                            <InputError message={errors.password} className="mt-1" />
                                        </div>
                                        <div>
                                            <InputLabel htmlFor="emp-password-confirmation" value="Confirm password" />
                                            <TextInput
                                                id="emp-password-confirmation"
                                                type="password"
                                                value={data.password_confirmation}
                                                onChange={(e) => setData('password_confirmation', e.target.value)}
                                                className="mt-1 block w-full"
                                                autoComplete="new-password"
                                                required={!account || data.password !== ''}
                                            />
                                        </div>

                                        <div className="sm:col-span-2">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <InputLabel value="Role and access" />
                                                <div className="segmented" role="group" aria-label="Role">
                                                    <button
                                                        type="button"
                                                        disabled={roles.length === 0}
                                                        onClick={() => setData('role_mode', 'existing')}
                                                        aria-pressed={data.role_mode === 'existing'}
                                                        className={`segmented-item px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                                                            data.role_mode === 'existing' ? 'segmented-item-active' : ''
                                                        }`}
                                                    >
                                                        Existing role
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setData('role_mode', 'new')}
                                                        aria-pressed={data.role_mode === 'new'}
                                                        className={`segmented-item px-2.5 py-1 text-xs ${data.role_mode === 'new' ? 'segmented-item-active' : ''}`}
                                                    >
                                                        <Icon name="plus" className="h-3.5 w-3.5" />
                                                        New role
                                                    </button>
                                                </div>
                                            </div>

                                            {data.role_mode === 'existing' ? (
                                                <>
                                                    <select
                                                        required
                                                        aria-label="Role"
                                                        className={inputClass}
                                                        value={data.role_id}
                                                        onChange={(e) => setData('role_id', Number(e.target.value))}
                                                    >
                                                        {roles.map((role) => (
                                                            <option key={role.id} value={role.id}>
                                                                {role.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {selectedRole && (
                                                        <div className="mt-2">
                                                            <AccessChips
                                                                permissions={selectedRole.permissions}
                                                                labelOf={labelOf}
                                                                empty="This role has no access yet."
                                                            />
                                                        </div>
                                                    )}
                                                    <InputError message={errors.role_id} className="mt-1" />
                                                </>
                                            ) : (
                                                <div className="mt-2 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                                                    <Field label="New role name" error={errors.new_role_name}>
                                                        <input
                                                            required
                                                            maxLength={60}
                                                            className={inputClass}
                                                            value={data.new_role_name}
                                                            onChange={(e) => setData('new_role_name', e.target.value)}
                                                            placeholder="e.g. Barista, Supervisor"
                                                        />
                                                    </Field>
                                                    <p className="label">Pages this role can open</p>
                                                    <div className="grid gap-2 sm:grid-cols-2">
                                                        {permissions.map((p) => {
                                                            const checked = data.new_role_permissions.includes(p.value);
                                                            return (
                                                                <label
                                                                    key={p.value}
                                                                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border bg-white px-2.5 py-2 transition-colors ${
                                                                        checked
                                                                            ? 'border-brand-300 bg-brand-50/60'
                                                                            : 'border-gray-200 hover:border-gray-300'
                                                                    }`}
                                                                >
                                                                    <span
                                                                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md [&_svg]:h-4 [&_svg]:w-4 ${
                                                                            checked ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'
                                                                        }`}
                                                                    >
                                                                        <NavIcon>{PERMISSION_ICONS[p.value]}</NavIcon>
                                                                    </span>
                                                                    <span className="min-w-0 flex-1 text-sm font-medium text-gray-950">
                                                                        {p.label}
                                                                    </span>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={() => togglePermission(p.value)}
                                                                        className="checkbox"
                                                                    />
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                    <InputError
                                                        message={
                                                            errors.new_role_permissions ??
                                                            Object.entries(errors).find(([k]) => k.startsWith('new_role_permissions.'))?.[1]
                                                        }
                                                    />
                                                    <p className="help">
                                                        The role is saved and can be reused for other employees under Roles &amp; access.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </fieldset>

                    <fieldset className="mt-5 rounded-lg border border-gray-200 p-4">
                        <legend className="px-1 text-sm font-semibold text-gray-950">Government numbers</legend>
                        <p className="help mt-0">Stored encrypted. Only the store owner can see them.</p>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            {text('sss_no', 'SSS no.')}
                            {text('philhealth_no', 'PhilHealth no.')}
                            {text('pagibig_no', 'Pag-IBIG MID no.')}
                            {text('tin', 'TIN')}
                        </div>
                    </fieldset>
                </DialogLayout>
            </form>
        </Modal>
    );
}

function SalaryModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
    const form = useForm({
        pay_type: 'monthly',
        rate: '',
        pay_frequency: 'semi_monthly',
        allowance: '',
        overtime_rate: '125',
        effective_from: toDateInput(new Date()),
        note: '',
    });
    const errors = form.errors as FieldErrors;

    useEffect(() => {
        if (employee) {
            const s = employee.salary;
            form.clearErrors();
            form.setData({
                pay_type: s?.pay_type ?? 'monthly',
                rate: toAmount(s?.rate_cents),
                pay_frequency: s?.pay_frequency ?? 'semi_monthly',
                allowance: s?.allowance_cents ? toAmount(s.allowance_cents) : '',
                overtime_rate: s ? String(s.overtime_rate_bps / 100) : '125',
                effective_from: toDateInput(new Date()),
                note: '',
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employee]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        if (employee) {
            form.post(route('employees.salary', employee.id), {
                preserveScroll: true,
                onSuccess: onClose,
            });
        }
    };

    return (
        <Modal show={employee !== null} onClose={onClose}>
            <form onSubmit={submit}>
                <DialogLayout
                    title={`Salary · ${employee?.name ?? ''}`}
                    description="A change starts on its effective date. Earlier payrolls keep the rate they were computed with."
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Close</SecondaryButton>
                            <PrimaryButton disabled={form.processing}>Save salary</PrimaryButton>
                        </>
                    }
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Pay type" error={errors.pay_type}>
                            <select className={inputClass} value={form.data.pay_type} onChange={(e) => form.setData('pay_type', e.target.value)}>
                                {Object.entries(PAY_TYPE_LABELS).map(([v, l]) => (
                                    <option key={v} value={v}>
                                        {l}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label={`Rate (₱ ${PER[form.data.pay_type]})`} error={errors.rate}>
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                required
                                className={inputClass}
                                value={form.data.rate}
                                onChange={(e) => form.setData('rate', e.target.value)}
                            />
                        </Field>
                        <Field label="Paid" error={errors.pay_frequency}>
                            <select
                                className={inputClass}
                                value={form.data.pay_frequency}
                                onChange={(e) => form.setData('pay_frequency', e.target.value)}
                            >
                                {Object.entries(FREQUENCY_LABELS).map(([v, l]) => (
                                    <option key={v} value={v}>
                                        {l}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Allowance per pay period (₱)" error={errors.allowance} hint="Optional, added to every payslip.">
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                className={inputClass}
                                value={form.data.allowance}
                                onChange={(e) => form.setData('allowance', e.target.value)}
                            />
                        </Field>
                        <Field
                            label="Overtime rate (% of hourly)"
                            error={errors.overtime_rate}
                            hint="125% is the usual regular-day overtime premium."
                        >
                            <input
                                type="number"
                                min="100"
                                max="400"
                                step="0.01"
                                required
                                className={inputClass}
                                value={form.data.overtime_rate}
                                onChange={(e) => form.setData('overtime_rate', e.target.value)}
                            />
                        </Field>
                        <Field label="Effective from" error={errors.effective_from}>
                            <input
                                type="date"
                                required
                                className={inputClass}
                                value={form.data.effective_from}
                                onChange={(e) => form.setData('effective_from', e.target.value)}
                            />
                        </Field>
                        <Field label="Note" error={errors.note} className="sm:col-span-2">
                            <input
                                className={inputClass}
                                value={form.data.note}
                                onChange={(e) => form.setData('note', e.target.value)}
                                placeholder="e.g. Regularization increase"
                            />
                        </Field>
                    </div>

                    {employee && employee.salary_history.length > 0 && (
                        <div className="mt-5">
                            <h3 className="text-sm font-semibold text-gray-950">History</h3>
                            <div className="mt-2 overflow-hidden rounded-lg border border-gray-200">
                                <div className="overflow-x-auto">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th className="!px-3">From</th>
                                                <th className="num !px-3">Rate</th>
                                                <th className="!px-3">Paid</th>
                                                <th className="!px-3">Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {employee.salary_history.map((h) => (
                                                <tr key={h.id}>
                                                    <td className="whitespace-nowrap !px-3 !py-2">{formatDay(h.effective_from)}</td>
                                                    <td className="num whitespace-nowrap !px-3 !py-2 font-medium text-gray-950">
                                                        {peso(h.rate_cents)} <span className="font-normal text-gray-500">{PER[h.pay_type]}</span>
                                                    </td>
                                                    <td className="!px-3 !py-2">{FREQUENCY_LABELS[h.pay_frequency]}</td>
                                                    <td className="!px-3 !py-2 text-gray-500">{h.note ?? '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogLayout>
            </form>
        </Modal>
    );
}
