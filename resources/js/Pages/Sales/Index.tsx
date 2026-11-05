import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import Pagination from '@/Components/Pagination';
import { Badge, EmptyState, Stat, Tone } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PaymentMethod } from '@/lib/db';
import { formatDateTime, PAYMENT_LABELS, toDateInput } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { PageProps, Paginated } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { FormEventHandler, ReactNode, useState } from 'react';

interface SaleRow {
    id: number;
    reference: string;
    sold_at: string;
    cashier: string | null;
    branch: string | null;
    items_count: number;
    payment_method: PaymentMethod;
    total_cents: number;
}

interface Filters {
    from: string;
    to: string;
    payment_method: string;
    branch: string;
}

export default function SalesIndex({
    auth,
    sales,
    summary,
    filters,
    branches,
}: PageProps<{
    sales: Paginated<SaleRow>;
    summary: {
        today_total_cents: number;
        today_count: number;
        filtered_total_cents: number;
        filtered_count: number;
    };
    filters: Filters;
    /** Only for users who see every branch, when there are several. */
    branches: { id: number; name: string }[];
}>) {
    const currency = auth.merchant?.currency ?? 'PHP';
    const money = (cents: number) => formatMoney(cents, currency);
    const [form, setForm] = useState<Filters>(filters);
    const hasFilters = Boolean(filters.from || filters.to || filters.payment_method || filters.branch);
    const showBranch = branches.length > 0;

    const visit = (next: Filters) => {
        router.get(
            route('sales.index'),
            {
                from: next.from || undefined,
                to: next.to || undefined,
                payment_method: next.payment_method || undefined,
                branch: next.branch || undefined,
            },
            { preserveState: true, preserveScroll: true },
        );
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        visit(form);
    };

    const quickRange = (days: number | 'month') => {
        const today = new Date();
        const start =
            days === 'month'
                ? new Date(today.getFullYear(), today.getMonth(), 1)
                : new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
        const next = { ...form, from: toDateInput(start), to: toDateInput(today) };

        setForm(next);
        visit(next);
    };

    const average = summary.filtered_count > 0 ? Math.round(summary.filtered_total_cents / summary.filtered_count) : 0;

    return (
        <AuthenticatedLayout header={<PageHeader title="Sales" subtitle="Every sale synced from your registers" />}>
            <Head title="Sales" />

            <div className="app-page">
                <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label="Today's sales" value={money(summary.today_total_cents)} />
                    <Stat label="Today's transactions" value={summary.today_count} />
                    <Stat
                        label={hasFilters ? 'Total (filtered)' : 'Total (all time)'}
                        value={money(summary.filtered_total_cents)}
                        hint={`${summary.filtered_count} sale${summary.filtered_count === 1 ? '' : 's'}`}
                    />
                    <Stat label="Average sale" value={money(average)} />
                </section>

                <div className="card overflow-hidden">
                    {/* Filters */}
                    <form onSubmit={submit} className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:px-5 lg:flex-row lg:items-end">
                        <div className={`grid flex-1 grid-cols-2 gap-3 ${showBranch ? 'sm:grid-cols-4 lg:max-w-3xl' : 'sm:grid-cols-3 lg:max-w-2xl'}`}>
                            <FilterField label="From">
                                <input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className="input" />
                            </FilterField>
                            <FilterField label="To">
                                <input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className="input" />
                            </FilterField>
                            <FilterField label="Payment" className="col-span-2 sm:col-span-1">
                                <select
                                    value={form.payment_method}
                                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                                    className="input"
                                >
                                    <option value="">All methods</option>
                                    {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </FilterField>
                            {showBranch && (
                                <FilterField label="Branch" className="col-span-2 sm:col-span-1">
                                    <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className="input">
                                        <option value="">All branches</option>
                                        {branches.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                {b.name}
                                            </option>
                                        ))}
                                    </select>
                                </FilterField>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button type="submit" className="btn btn-primary flex-1 lg:flex-none">
                                Apply
                            </button>
                            {hasFilters && (
                                <Link href={route('sales.index')} className="btn btn-secondary flex-1 lg:flex-none">
                                    Reset
                                </Link>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1 lg:ms-auto" role="group" aria-label="Quick date ranges">
                            <button type="button" onClick={() => quickRange(0)} className="btn btn-ghost btn-sm">
                                Today
                            </button>
                            <button type="button" onClick={() => quickRange(6)} className="btn btn-ghost btn-sm">
                                Last 7 days
                            </button>
                            <button type="button" onClick={() => quickRange('month')} className="btn btn-ghost btn-sm">
                                This month
                            </button>
                        </div>
                    </form>

                    {sales.data.length === 0 ? (
                        <EmptyState icon={<Icon name="sales" className="h-5 w-5" />} title="No sales found">
                            {hasFilters ? 'Try a different date range or payment method.' : 'Sales appear here once your registers sync them.'}
                        </EmptyState>
                    ) : (
                        <>
                            {/* Desktop table */}
                            <div className="hidden overflow-x-auto md:block">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Reference</th>
                                            <th>Date and time</th>
                                            <th>Cashier</th>
                                            {showBranch && <th>Branch</th>}
                                            <th className="num">Items</th>
                                            <th>Payment</th>
                                            <th className="num">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sales.data.map((sale) => (
                                            <tr key={sale.id}>
                                                <td className="whitespace-nowrap">
                                                    <Link
                                                        href={route('sales.show', sale.id)}
                                                        className="font-mono text-sm font-medium text-brand-700 hover:underline"
                                                    >
                                                        {sale.reference}
                                                    </Link>
                                                </td>
                                                <td className="whitespace-nowrap">{formatDateTime(sale.sold_at)}</td>
                                                <td>{sale.cashier ?? <span className="text-gray-500">Former staff</span>}</td>
                                                {showBranch && <td>{sale.branch ?? <span className="text-gray-500">—</span>}</td>}
                                                <td className="num">{sale.items_count}</td>
                                                <td>
                                                    <PaymentBadge method={sale.payment_method} />
                                                </td>
                                                <td className="num whitespace-nowrap font-medium text-gray-950">{money(sale.total_cents)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Phones: stacked list */}
                            <ul className="divide-y divide-gray-100 md:hidden">
                                {sales.data.map((sale) => (
                                    <li key={sale.id}>
                                        <Link href={route('sales.show', sale.id)} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-mono text-sm font-medium text-brand-700">{sale.reference}</p>
                                                <p className="truncate text-xs text-gray-500">
                                                    {formatDateTime(sale.sold_at)} · {sale.cashier ?? 'Former staff'}
                                                    {showBranch && sale.branch && ` · ${sale.branch}`}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {sale.items_count} item{sale.items_count === 1 ? '' : 's'}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 flex-col items-end gap-1">
                                                <p className="text-sm font-semibold tabular-nums text-gray-950">{money(sale.total_cents)}</p>
                                                <PaymentBadge method={sale.payment_method} />
                                            </div>
                                            <Icon name="chevronRight" className="h-4 w-4 text-gray-300" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    <Pagination paginator={sales} noun="sales" />
                </div>
            </div>
        </AuthenticatedLayout>
    );
}

const PAYMENT_TONES: Record<PaymentMethod, Tone> = {
    cash: 'green',
    card: 'blue',
    ewallet: 'gray',
    qrph: 'brand',
};

export function PaymentBadge({ method }: { method: PaymentMethod }) {
    return <Badge tone={PAYMENT_TONES[method]}>{PAYMENT_LABELS[method]}</Badge>;
}

function FilterField({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
    return (
        <label className={`block min-w-0 ${className}`}>
            <span className="label text-xs">{label}</span>
            <div className="mt-1">{children}</div>
        </label>
    );
}
