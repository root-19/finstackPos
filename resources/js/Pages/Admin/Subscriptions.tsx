import PageHeader from '@/Components/PageHeader';
import Pagination from '@/Components/Pagination';
import { Badge, Card, EmptyState, Field, Stat } from '@/Components/ui';
import AdminLayout from '@/Layouts/AdminLayout';
import { PageProps, Paginated } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { peso, shortDate } from './Partials/shared';

type Payment = {
    id: number;
    store_id: number;
    store: string;
    created_at: string;
    months: number;
    amount_cents: number;
    provider: 'paymongo' | 'manual' | 'trial';
    applied: boolean;
    expired: boolean;
    period_end: string | null;
    reference: string | null;
    note: string | null;
    by: string | null;
};

type Filters = { from: string; to: string; status: 'paid' | 'unpaid' | null; provider: 'paymongo' | 'manual' | 'trial' | null };

type Props = {
    payments: Paginated<Payment>;
    totals: { revenue_cents: number; paid: number; months_sold: number; unpaid: number };
    filters: Filters;
};

export default function Subscriptions({ payments, totals, filters }: PageProps<Props>) {
    const go = (changes: Partial<Filters>) =>
        router.get(
            route('admin.subscriptions'),
            Object.fromEntries(Object.entries({ ...filters, ...changes }).filter(([, v]) => v !== null && v !== '')),
            { preserveState: true, preserveScroll: true, replace: true },
        );

    return (
        <AdminLayout header={<PageHeader title="Subscriptions" subtitle="Payments and plan changes across all stores" />}>
            <Head title="Subscriptions" />

            <div className="app-page">
                <Card className="p-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Field label="From">
                            <input
                                type="date"
                                className="input"
                                value={filters.from}
                                onChange={(e) => e.target.value && go({ from: e.target.value })}
                            />
                        </Field>
                        <Field label="To">
                            <input type="date" className="input" value={filters.to} onChange={(e) => e.target.value && go({ to: e.target.value })} />
                        </Field>
                        <Field label="Status">
                            <select
                                className="input"
                                value={filters.status ?? ''}
                                onChange={(e) => go({ status: (e.target.value || null) as Filters['status'] })}
                            >
                                <option value="">All</option>
                                <option value="paid">Paid / applied</option>
                                <option value="unpaid">Not paid</option>
                            </select>
                        </Field>
                        <Field label="Source">
                            <select
                                className="input"
                                value={filters.provider ?? ''}
                                onChange={(e) => go({ provider: (e.target.value || null) as Filters['provider'] })}
                            >
                                <option value="">All</option>
                                <option value="paymongo">QR Ph (PayMongo)</option>
                                <option value="manual">By admin</option>
                                <option value="trial">Free trials</option>
                            </select>
                        </Field>
                    </div>
                </Card>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label="Revenue (QR Ph, paid)" value={peso(totals.revenue_cents)} />
                    <Stat label="Months sold" value={totals.months_sold.toLocaleString()} />
                    <Stat label="Paid / applied" value={totals.paid.toLocaleString()} />
                    <Stat label="Started, not paid" value={totals.unpaid.toLocaleString()} hint="QR codes that were never paid" />
                </div>

                <Card className="overflow-hidden">
                    {payments.data.length === 0 ? (
                        <EmptyState title="Nothing in this range" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Store</th>
                                        <th>Status</th>
                                        <th className="num">Months</th>
                                        <th className="num">Amount</th>
                                        <th>Pro until</th>
                                        <th>Reference / note</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.data.map((p) => (
                                        <tr key={p.id}>
                                            <td className="whitespace-nowrap">
                                                {new Date(p.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                                            </td>
                                            <td>
                                                <Link
                                                    href={route('admin.stores.show', p.store_id)}
                                                    className="font-medium text-gray-950 hover:text-brand-700"
                                                >
                                                    {p.store}
                                                </Link>
                                            </td>
                                            <td>
                                                {p.provider === 'trial' ? (
                                                    <Badge tone="blue">Free trial</Badge>
                                                ) : p.provider === 'manual' ? (
                                                    <Badge>By admin</Badge>
                                                ) : p.applied ? (
                                                    <Badge tone="green">Paid</Badge>
                                                ) : p.expired ? (
                                                    <Badge>Not paid</Badge>
                                                ) : (
                                                    <Badge tone="amber">Waiting</Badge>
                                                )}
                                            </td>
                                            <td className="num">{p.months || '—'}</td>
                                            <td className="num">{p.amount_cents ? peso(p.amount_cents) : '—'}</td>
                                            <td className="whitespace-nowrap">{shortDate(p.period_end)}</td>
                                            <td className="max-w-xs text-xs text-gray-600">
                                                {p.note ?? p.reference ?? '—'}
                                                {p.by && <span className="block text-gray-400">Started by {p.by}</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <Pagination paginator={payments} noun="payments" />
                </Card>
            </div>
        </AdminLayout>
    );
}
