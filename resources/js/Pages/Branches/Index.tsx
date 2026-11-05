import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';
import { Alert, Badge, CardHeader, ConfirmDialog, DialogLayout, EmptyState, Field, Segmented, Stat } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatDate, formatDateTime } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import BarChart from '@/Pages/Reports/Partials/BarChart';
import { PageProps } from '@/types';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { FormEventHandler, useEffect, useMemo, useState } from 'react';

interface BranchRow {
    id: number;
    name: string;
    address: string | null;
    is_active: boolean;
    staff: number;
    tables: number;
    has_sales: boolean;
    last_sale_at: string | null;
    total_cents: number;
    previous_cents: number;
    count: number;
    average_cents: number;
    discount_cents: number;
    cash_cents: number;
    top: { name: string; quantity: number; revenue_cents: number } | null;
    daily: number[];
}

interface StaffRow {
    id: number;
    name: string;
    email: string;
    role: string;
    branch_id: number | null;
}

type Props = {
    filters: { from: string; to: string };
    today: string;
    currency: string;
    dates: string[];
    branches: BranchRow[];
    unassigned_cents: number;
    staff: StaffRow[];
};

/** Percent change from the period before; null when there is nothing to compare. */
function change(now: number, before: number): number | null {
    return before > 0 ? Math.round(((now - before) / before) * 100) : null;
}

function shift(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function BranchesIndex({ filters, today, currency, dates, branches, unassigned_cents, staff }: PageProps<Props>) {
    const errors = usePage().props.errors as Record<string, string>;
    const [chartBranch, setChartBranch] = useState<string>('all');
    const [editing, setEditing] = useState<BranchRow | null>(null);
    const [deleting, setDeleting] = useState<BranchRow | null>(null);
    const add = useForm({ name: '', address: '' });

    const money = (cents: number) => formatMoney(cents, currency);
    const axis = (cents: number) => money(cents).replace(/\.00$/, '');
    const total = branches.reduce((sum, b) => sum + b.total_cents, 0) + unassigned_cents;
    const previous = branches.reduce((sum, b) => sum + b.previous_cents, 0);
    const count = branches.reduce((sum, b) => sum + b.count, 0);
    const ranked = [...branches].sort((a, b) => b.total_cents - a.total_cents);
    const best = ranked[0]?.total_cents ? ranked[0] : null;
    const max = Math.max(...branches.map((b) => b.total_cents), 1);
    const totalChange = change(total, previous);

    const setRange = (from: string, to: string) => router.get(route('branches.index'), { from, to }, { preserveState: true, preserveScroll: true });
    const monthStart = `${today.slice(0, 8)}01`;
    const ranges = [
        { label: 'Today', from: today, to: today },
        { label: '7 days', from: shift(today, -6), to: today },
        { label: '30 days', from: shift(today, -29), to: today },
        { label: 'This month', from: monthStart, to: today },
    ];

    const bars = useMemo(() => {
        const series =
            chartBranch === 'all'
                ? dates.map((_, i) => branches.reduce((sum, b) => sum + b.daily[i], 0))
                : (branches.find((b) => String(b.id) === chartBranch)?.daily ?? []);

        return dates.map((date, i) => ({
            key: date,
            label: new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            value: series[i] ?? 0,
            tooltip: `${formatDate(`${date}T00:00:00`)}: ${money(series[i] ?? 0)}`,
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chartBranch, dates, branches]);

    const submitAdd: FormEventHandler = (e) => {
        e.preventDefault();
        add.post(route('branches.store'), { preserveScroll: true, onSuccess: () => add.reset() });
    };

    const setOpen = (branch: BranchRow, open: boolean) =>
        router.put(route('branches.update', branch.id), { name: branch.name, address: branch.address ?? '', is_active: open }, { preserveScroll: true });

    const assign = (user: StaffRow, branchId: string) =>
        router.patch(route('branches.assign', user.id), { branch_id: branchId === '' ? null : Number(branchId) }, { preserveScroll: true });

    const salesLink = (branchId: number) => route('sales.index', { branch: branchId, from: filters.from, to: filters.to });

    return (
        <AuthenticatedLayout header={<PageHeader title="Branches" subtitle="What each branch earns, side by side" />}>
            <Head title="Branches" />

            <div className="app-page">
                <div className="mx-auto w-full max-w-6xl space-y-5">
                    {/* Period */}
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="flex flex-wrap gap-1.5">
                            {ranges.map((r) => (
                                <button
                                    key={r.label}
                                    type="button"
                                    onClick={() => setRange(r.from, r.to)}
                                    aria-pressed={filters.from === r.from && filters.to === r.to}
                                    className={`btn btn-sm ${filters.from === r.from && filters.to === r.to ? 'btn-dark' : 'btn-secondary'}`}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                        <div className="ms-auto flex flex-wrap items-center gap-2 text-sm text-gray-600">
                            <input type="date" value={filters.from} max={filters.to} onChange={(e) => e.target.value && setRange(e.target.value, filters.to)} className="input w-auto py-1.5" aria-label="From" />
                            to
                            <input type="date" value={filters.to} min={filters.from} max={today} onChange={(e) => e.target.value && setRange(filters.from, e.target.value)} className="input w-auto py-1.5" aria-label="To" />
                        </div>
                    </div>
                    {errors.from && <Alert tone="red">{errors.from}</Alert>}

                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Stat
                            label="Sales, all branches"
                            value={money(total)}
                            hint={totalChange === null ? 'No sales the period before' : `${totalChange >= 0 ? '▲' : '▼'} ${Math.abs(totalChange)}% vs the period before`}
                            tone={totalChange === null ? undefined : totalChange >= 0 ? 'green' : 'red'}
                        />
                        <Stat label="Transactions" value={count.toLocaleString()} />
                        <Stat label="Average sale" value={money(count ? Math.round(total / count) : 0)} />
                        <Stat label="Top branch" value={best ? best.name : '—'} hint={best ? money(best.total_cents) : 'No sales in this period'} />
                    </div>

                    {/* Compare */}
                    <section className="card overflow-hidden">
                        <CardHeader title="Compare branches" subtitle={`${formatDate(`${filters.from}T00:00:00`)} – ${formatDate(`${filters.to}T00:00:00`)}`} />
                        <ul className="divide-y divide-gray-100">
                            {ranked.map((b) => {
                                const delta = change(b.total_cents, b.previous_cents);
                                const share = total ? Math.round((b.total_cents / total) * 100) : 0;

                                return (
                                    <li key={b.id} className="px-4 py-4 sm:px-5">
                                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                            <p className="text-base font-semibold text-gray-950">{b.name}</p>
                                            {!b.is_active && <Badge>Closed</Badge>}
                                            <p className="ms-auto text-lg font-bold tabular-nums text-gray-950">{money(b.total_cents)}</p>
                                            <span className={`w-16 text-right text-xs font-semibold tabular-nums ${delta === null ? 'text-gray-400' : delta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                {delta === null ? '—' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}%`}
                                            </span>
                                        </div>
                                        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                                            <div className="h-full rounded-full bg-brand-600" style={{ width: `${(b.total_cents / max) * 100}%` }} />
                                        </div>
                                        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 sm:grid-cols-3 lg:grid-cols-6">
                                            <Fact label="Share" value={`${share}%`} />
                                            <Fact label="Transactions" value={b.count.toLocaleString()} />
                                            <Fact label="Average sale" value={money(b.average_cents)} />
                                            <Fact label="Cash / QR" value={b.total_cents ? `${Math.round((b.cash_cents / b.total_cents) * 100)}% / ${100 - Math.round((b.cash_cents / b.total_cents) * 100)}%` : '—'} />
                                            <Fact label="Best seller" value={b.top ? `${b.top.name} (${b.top.quantity})` : '—'} />
                                            <Fact label="Last sale" value={b.last_sale_at ? formatDateTime(b.last_sale_at) : 'Never'} />
                                        </dl>
                                        <Link href={salesLink(b.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                                            View its sales
                                            <Icon name="chevronRight" className="h-3 w-3" />
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                        {unassigned_cents > 0 && (
                            <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
                                {money(unassigned_cents)} in sales has no branch (recorded before branches existed).
                            </p>
                        )}
                    </section>

                    {/* Daily */}
                    <section className="card">
                        <CardHeader
                            title="Daily sales"
                            actions={
                                branches.length > 1 && (
                                    <Segmented
                                        label="Branch"
                                        value={chartBranch}
                                        onChange={setChartBranch}
                                        options={[{ value: 'all', label: 'All' }, ...branches.map((b) => ({ value: String(b.id), label: b.name }))]}
                                    />
                                )
                            }
                        />
                        <div className="card-body">
                            <BarChart bars={bars} format={axis} title="Daily sales" />
                        </div>
                    </section>

                    <div className="grid gap-5 lg:grid-cols-2">
                        {/* Manage */}
                        <section className="card overflow-hidden">
                            <CardHeader title="Your branches" subtitle="Each register picks its branch; staff can be tied to one." />
                            <form onSubmit={submitAdd} className="space-y-3 border-b border-gray-100 px-4 py-4 sm:px-5">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Field label="New branch" htmlFor="branch-name" error={add.errors.name} required>
                                        <TextInput id="branch-name" value={add.data.name} maxLength={60} onChange={(e) => add.setData('name', e.target.value)} placeholder="e.g. SM Masinag" required />
                                    </Field>
                                    <Field label="Address" htmlFor="branch-address" error={add.errors.address}>
                                        <TextInput id="branch-address" value={add.data.address} maxLength={255} onChange={(e) => add.setData('address', e.target.value)} placeholder="Optional" />
                                    </Field>
                                </div>
                                <button type="submit" disabled={add.processing} className="btn btn-primary btn-sm">
                                    <Icon name="plus" />
                                    Add branch
                                </button>
                            </form>
                            {(errors.branch || errors.is_active) && (
                                <div className="px-4 pt-3 sm:px-5">
                                    <Alert tone="red">{errors.branch ?? errors.is_active}</Alert>
                                </div>
                            )}
                            <ul className="divide-y divide-gray-100">
                                {branches.map((b) => (
                                    <li key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
                                        <div className="min-w-0 flex-1">
                                            <p className="flex items-center gap-2 truncate text-sm font-medium text-gray-950">
                                                {b.name}
                                                {!b.is_active && <Badge>Closed</Badge>}
                                            </p>
                                            <p className="truncate text-xs text-gray-500">
                                                {[b.address, `${b.staff} staff`, `${b.tables} table(s)`].filter(Boolean).join(' · ')}
                                            </p>
                                        </div>
                                        <button type="button" onClick={() => setEditing(b)} className="btn btn-ghost btn-sm btn-icon w-8 text-gray-500" aria-label={`Edit ${b.name}`} title="Edit">
                                            <Icon name="pencil" />
                                        </button>
                                        <button type="button" onClick={() => setOpen(b, !b.is_active)} className="btn btn-secondary btn-sm">
                                            {b.is_active ? 'Close' : 'Reopen'}
                                        </button>
                                        {!b.has_sales && branches.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => setDeleting(b)}
                                                className="btn btn-ghost btn-sm btn-icon w-8 text-gray-500 hover:bg-red-50 hover:text-red-600"
                                                aria-label={`Delete ${b.name}`}
                                                title="Delete"
                                            >
                                                <Icon name="trash" />
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </section>

                        {/* Who works where */}
                        <section className="card overflow-hidden">
                            <CardHeader title="Who works where" subtitle="Staff tied to a branch sell there only and see only its sales." />
                            {staff.length === 0 ? (
                                <EmptyState title="No staff logins yet">Add staff on the Employee List, then choose their branch here.</EmptyState>
                            ) : (
                                <ul className="divide-y divide-gray-100">
                                    {staff.map((u) => (
                                        <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-gray-950">{u.name}</p>
                                                <p className="truncate text-xs text-gray-500">
                                                    {u.role} · {u.email}
                                                </p>
                                            </div>
                                            <select
                                                value={u.branch_id ?? ''}
                                                onChange={(e) => assign(u, e.target.value)}
                                                aria-label={`Branch of ${u.name}`}
                                                className="input w-auto py-1.5 pe-8 text-sm"
                                            >
                                                <option value="">Any branch</option>
                                                {branches.map((b) => (
                                                    <option key={b.id} value={b.id}>
                                                        {b.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>

                    <p className="text-xs text-gray-500">Products, prices, and inventory are shared by all branches.</p>
                </div>
            </div>

            <EditModal branch={editing} onClose={() => setEditing(null)} />

            <ConfirmDialog
                show={deleting !== null}
                title={`Delete ${deleting?.name ?? 'branch'}?`}
                confirmLabel="Delete branch"
                onConfirm={() => deleting && router.delete(route('branches.destroy', deleting.id), { preserveScroll: true, onSuccess: () => setDeleting(null) })}
                onClose={() => setDeleting(null)}
            >
                It has no sales. Its tables and their QR codes are deleted too; staff tied to it can work at any branch.
            </ConfirmDialog>
        </AuthenticatedLayout>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <dt className="text-gray-400">{label}</dt>
            <dd className="truncate font-medium text-gray-800" title={value}>
                {value}
            </dd>
        </div>
    );
}

function EditModal({ branch, onClose }: { branch: BranchRow | null; onClose: () => void }) {
    const { data, setData, put, processing, errors, clearErrors } = useForm({ name: '', address: '' });

    useEffect(() => {
        if (branch) {
            setData({ name: branch.name, address: branch.address ?? '' });
            clearErrors();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [branch]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        if (branch) {
            put(route('branches.update', branch.id), { preserveScroll: true, onSuccess: () => onClose() });
        }
    };

    return (
        <Modal show={branch !== null} onClose={onClose} maxWidth="md">
            <form onSubmit={submit}>
                <DialogLayout
                    title="Edit branch"
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <PrimaryButton type="submit" disabled={processing}>
                                Save
                            </PrimaryButton>
                        </>
                    }
                >
                    <div className="space-y-4">
                        <Field label="Name" htmlFor="edit-branch-name" error={errors.name} required>
                            <TextInput id="edit-branch-name" value={data.name} maxLength={60} onChange={(e) => setData('name', e.target.value)} isFocused required />
                        </Field>
                        <Field label="Address" htmlFor="edit-branch-address" error={errors.address}>
                            <TextInput id="edit-branch-address" value={data.address} maxLength={255} onChange={(e) => setData('address', e.target.value)} />
                        </Field>
                    </div>
                </DialogLayout>
            </form>
        </Modal>
    );
}
