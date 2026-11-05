import InputError from '@/Components/InputError';
import Modal from '@/Components/Modal';
import { Icon, ICONS, NavIcon } from '@/Components/NavIcons';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';
import { Badge, ConfirmDialog, DialogLayout, Field } from '@/Components/ui';
import { Permission } from '@/types';
import { router, useForm } from '@inertiajs/react';
import { FormEventHandler, ReactNode, useEffect, useState } from 'react';

export type RoleRow = {
    id: number;
    name: string;
    permissions: Permission[];
    users_count: number;
};

export type PermissionOption = {
    value: Permission;
    /** The sidebar page name, e.g. "Point of Sale". */
    label: string;
    description: string;
};

/** Each permission shows the icon of the sidebar page it opens. */
export const PERMISSION_ICONS: Record<Permission, ReactNode> = {
    'pos.sell': ICONS.pos,
    'products.manage': ICONS.products,
    'categories.manage': ICONS.categories,
    'sales.view': ICONS.sales,
    'inventory.manage': ICONS.inventory,
    'staff.manage': ICONS.staff,
    'settings.manage': ICONS.settings,
    'schedules.manage': ICONS.schedule,
    'attendance.manage': ICONS.attendance,
    'employees.manage': ICONS.employees,
    'payroll.manage': ICONS.payroll,
};

/** A permission icon at inline (chip) size. */
function PermissionIcon({ children, className = 'h-4 w-4' }: { children: ReactNode; className?: string }) {
    return (
        <svg className={`shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
            <g strokeLinecap="round" strokeLinejoin="round">
                {children}
            </g>
        </svg>
    );
}

/** The roles grid: the built-in Owner, each custom role, and a "New role" action. */
export function RolesPanel({ roles, permissions }: { roles: RoleRow[]; permissions: PermissionOption[] }) {
    // undefined: closed, null: creating, RoleRow: editing
    const [editingRole, setEditingRole] = useState<RoleRow | null | undefined>();
    const [deletingRole, setDeletingRole] = useState<RoleRow | null>(null);
    const labelOf = (p: Permission) => permissions.find((o) => o.value === p)?.label ?? p;

    const confirmDeleteRole = () => {
        if (deletingRole) {
            router.delete(route('roles.destroy', deletingRole.id), {
                preserveScroll: true,
                onFinish: () => setDeletingRole(null),
            });
        }
    };

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-500">Roles decide which pages each login can open.</p>
                <button type="button" onClick={() => setEditingRole(null)} className="btn btn-primary">
                    <Icon name="plus" />
                    New role
                </button>
            </div>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {/* The owner, for reference */}
                <article className="card flex flex-col p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-gray-950">Owner</h3>
                        <Badge tone="dark">Built-in</Badge>
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
                        Full access to everything, including staff, roles, and store settings. Only the store owner has it.
                    </p>
                </article>

                {roles.map((role) => (
                    <article key={role.id} className="card flex flex-col p-4 sm:p-5">
                        <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-gray-950">{role.name}</h3>
                            <p className="text-xs text-gray-500">
                                {role.users_count} member
                                {role.users_count === 1 ? '' : 's'}
                            </p>
                        </div>

                        <div className="mt-3 flex-1">
                            <AccessChips permissions={role.permissions} labelOf={labelOf} empty="No access yet" />
                        </div>

                        <div className="mt-4 flex gap-2 border-t border-gray-100 pt-3">
                            <button type="button" onClick={() => setEditingRole(role)} className="btn btn-secondary btn-sm flex-1">
                                <Icon name="pencil" />
                                Edit access
                            </button>
                            <button
                                type="button"
                                onClick={() => setDeletingRole(role)}
                                disabled={role.users_count > 0}
                                title={role.users_count > 0 ? 'Move its staff to another role first' : undefined}
                                className="btn btn-ghost btn-sm text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                                <Icon name="trash" />
                                Delete
                            </button>
                        </div>
                    </article>
                ))}
            </section>

            <RoleEditorModal
                show={editingRole !== undefined}
                role={editingRole ?? null}
                permissions={permissions}
                onClose={() => setEditingRole(undefined)}
            />

            <ConfirmDialog
                show={deletingRole !== null}
                title={`Delete the ${deletingRole?.name ?? ''} role?`}
                confirmLabel="Delete role"
                onConfirm={confirmDeleteRole}
                onClose={() => setDeletingRole(null)}
            >
                This cannot be undone.
            </ConfirmDialog>
        </>
    );
}

/** The sidebar pages a role opens, with their sidebar icons. */
export function AccessChips({ permissions, labelOf, empty }: { permissions: Permission[]; labelOf: (p: Permission) => string; empty: string }) {
    const known = permissions.filter((p) => p in PERMISSION_ICONS);

    if (known.length === 0) {
        return <span className="text-sm text-gray-400">{empty}</span>;
    }

    return (
        <div className="flex flex-wrap gap-1.5">
            {known.map((p) => (
                <Badge key={p} tone="brand">
                    <PermissionIcon className="h-3.5 w-3.5">{PERMISSION_ICONS[p]}</PermissionIcon>
                    {labelOf(p)}
                </Badge>
            ))}
        </div>
    );
}

/** One option of a segmented tab bar (wrap in `.segmented`), with a count. */
export function TabButton({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: string }) {
    return (
        <button type="button" onClick={onClick} aria-pressed={active} className={`segmented-item ${active ? 'segmented-item-active' : ''}`}>
            {children}
            <span className={`rounded px-1.5 text-xs ${active ? 'bg-brand-50 text-brand-700' : 'bg-gray-200/80 text-gray-600'}`}>{count}</span>
        </button>
    );
}

/** Create or edit a role: its name and a checklist of what it can do. */
export function RoleEditorModal({
    show,
    role,
    permissions,
    onClose,
}: {
    show: boolean;
    /** Null when creating. */
    role: RoleRow | null;
    permissions: PermissionOption[];
    onClose: () => void;
}) {
    const form = useForm<{ name: string; permissions: Permission[] }>({
        name: '',
        permissions: [],
    });
    const { data, setData, processing } = form;
    const errors = form.errors as Record<string, string | undefined>;

    useEffect(() => {
        if (show) {
            form.clearErrors();
            // Only permissions that still exist, in sidebar order.
            const current = role?.permissions ?? ['pos.sell'];
            form.setData({
                name: role?.name ?? '',
                permissions: permissions.map((p) => p.value).filter((v) => current.includes(v)),
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show, role]);

    const toggle = (value: Permission, on: boolean) =>
        setData('permissions', on ? [...data.permissions, value] : data.permissions.filter((p) => p !== value));

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const options = { preserveScroll: true, onSuccess: () => onClose() };
        if (role) {
            form.put(route('roles.update', role.id), options);
        } else {
            form.post(route('roles.store'), options);
        }
    };

    return (
        <Modal show={show} onClose={onClose}>
            <form onSubmit={submit}>
                <DialogLayout
                    title={role ? `Edit ${role.name}` : 'New role'}
                    description="Choose the pages people with this role can open."
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <PrimaryButton disabled={processing}>{role ? 'Save role' : 'Create role'}</PrimaryButton>
                        </>
                    }
                >
                    <div className="space-y-4">
                        <Field label="Role name" htmlFor="role-name" error={errors.name} required>
                            <TextInput
                                id="role-name"
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                                placeholder="e.g. Barista, Supervisor, Inventory clerk"
                                className="block w-full"
                                maxLength={60}
                                isFocused
                                required
                            />
                        </Field>

                        <div>
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-gray-950">What can this role do?</p>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setData('permissions', data.permissions.length === permissions.length ? [] : permissions.map((p) => p.value))
                                    }
                                    className="btn btn-ghost btn-sm text-brand-700"
                                >
                                    {data.permissions.length === permissions.length ? 'Clear all' : 'Select all'}
                                </button>
                            </div>

                            {/* The same pages, names, and icons as the sidebar */}
                            <div className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
                                {permissions.map((p) => {
                                    const checked = data.permissions.includes(p.value);

                                    return (
                                        <label
                                            key={p.value}
                                            className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors ${
                                                checked ? 'bg-brand-50/60' : 'bg-white hover:bg-gray-50'
                                            }`}
                                        >
                                            <span
                                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                                    checked ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'
                                                }`}
                                            >
                                                <NavIcon>{PERMISSION_ICONS[p.value]}</NavIcon>
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-medium text-gray-950">{p.label}</span>
                                                <span className="block text-xs text-gray-500">{p.description}</span>
                                            </span>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(e) => toggle(p.value, e.target.checked)}
                                                className="checkbox"
                                            />
                                        </label>
                                    );
                                })}
                            </div>

                            <InputError
                                message={errors.permissions ?? Object.entries(errors).find(([k]) => k.startsWith('permissions.'))?.[1]}
                                className="mt-2"
                            />
                        </div>

                        <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
                            <Icon name="info" className="mt-px h-4 w-4 text-gray-400" />
                            <span>
                                <strong className="font-medium text-gray-700">Employee List</strong>,{' '}
                                <strong className="font-medium text-gray-700">Salary &amp; Payroll</strong>, and{' '}
                                <strong className="font-medium text-gray-700">Settings</strong> stay with the owner, so no one can raise their own
                                access or see salaries.
                            </span>
                        </div>
                    </div>
                </DialogLayout>
            </form>
        </Modal>
    );
}
