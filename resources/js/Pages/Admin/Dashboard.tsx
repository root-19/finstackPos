import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import { Badge, Card, CardHeader, EmptyState, Stat } from '@/Components/ui';
import AdminLayout from '@/Layouts/AdminLayout';
import { PageProps } from '@/types';
import { Head, Link } from '@inertiajs/react';
import BarChart from '../Reports/Partials/BarChart';
import { DaysLeft, peso, shortDate } from './Partials/shared';

type Props = {
    counts: {
        stores: number;
        pro: number;
        trial: number;
        free: number;
        expiring: number;
        expired: number;
        suspended: number;
        new_this_month: number;
        trials_ended: number;
        trials_converted: number;
    };
    revenue: { this_month: number; last_month: number; all_time: number; by_month: { month: string; amount_cents: number; payments: number }[] };
    price_cents: number;
    expiringSoon: { id: number; name: string; owner: string | null; until: string; days_left: number | null }[];
    trialsEnding: { id: number; name: string; owner: string | null; until: string; days_left: number | null }[];
    recentPayments: {
        id: number;
        store_id: number;
        store: string | null;
        months: number;
        amount_cents: number;
        provider: string;
        paid_at: string | null;
    }[];
    newStores: { id: number; name: string; owner: string | null; created_at: string; pro: boolean; trial: boolean }[];
};

const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
};

export default function AdminDashboard({ counts, revenue, price_cents, expiringSoon, trialsEnding, recentPayments, newStores }: PageProps<Props>) {
    const conversion = counts.trials_ended ? Math.round((counts.trials_converted / counts.trials_ended) * 100) : null;
    const storesLink = (plan: string) => route('admin.stores.index', { plan });

    return (
        <AdminLayout header={<PageHeader title="Dashboard" subtitle="All FinstackPOS stores at a glance" />}>
            <Head title="Admin dashboard" />

            <div className="app-page">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label="Stores" value={counts.stores.toLocaleString()} hint={`${counts.new_this_month} new this month`} />
                    <Stat label="Paying Pro" value={counts.pro.toLocaleString()} hint={`${counts.free} on the free plan`} tone="green" />
                    <Stat
                        label="On free trial"
                        value={counts.trial.toLocaleString()}
                        hint={
                            conversion === null
                                ? 'No finished trials yet'
                                : `${counts.trials_converted} of ${counts.trials_ended} finished trials paid (${conversion}%)`
                        }
                    />
                    <Stat label="Revenue this month" value={peso(revenue.this_month)} hint={`Last month ${peso(revenue.last_month)}`} />
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardHeader
                            title="Subscription revenue, last 6 months"
                            subtitle={`${peso(revenue.all_time)} all time · Pro is ${peso(price_cents)}/month`}
                            actions={
                                <Link href={route('admin.subscriptions')} className="btn btn-ghost btn-sm">
                                    Payments
                                    <Icon name="chevronRight" />
                                </Link>
                            }
                        />
                        <div className="card-body">
                            <BarChart
                                title="Subscription revenue by month"
                                height={200}
                                format={(c) => (c >= 100000 ? `₱${Math.round(c / 100000)}k` : `₱${Math.round(c / 100)}`)}
                                bars={revenue.by_month.map((m) => ({
                                    key: m.month,
                                    label: monthLabel(m.month),
                                    value: m.amount_cents,
                                    tooltip: `${monthLabel(m.month)}: ${peso(m.amount_cents)} · ${m.payments} payment(s)`,
                                }))}
                            />
                        </div>
                    </Card>

                    <Card>
                        <CardHeader title="Plans" />
                        <ul className="divide-y divide-gray-100 text-sm">
                            {[
                                ['Paying Pro', counts.pro, 'pro', 'green'],
                                ['Free trial', counts.trial, 'trial', 'blue'],
                                ['Free', counts.free, 'free', 'gray'],
                                ['Paid Pro ending within 7 days', counts.expiring, 'expiring', 'amber'],
                                ['Pro ended', counts.expired, 'expired', 'red'],
                                ['Suspended', counts.suspended, 'suspended', 'dark'],
                            ].map(([label, n, plan, tone]) => (
                                <li key={plan as string}>
                                    <Link
                                        href={storesLink(plan as string)}
                                        className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 sm:px-5"
                                    >
                                        <span className="text-gray-700">{label}</span>
                                        <Badge tone={tone as 'green'}>{(n as number).toLocaleString()}</Badge>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                    <Card className="overflow-hidden">
                        <CardHeader
                            title="Paid Pro ending soonest"
                            actions={
                                <Link href={route('admin.stores.index', { sort: 'expiring', plan: 'pro' })} className="btn btn-ghost btn-sm">
                                    All
                                    <Icon name="chevronRight" />
                                </Link>
                            }
                        />
                        {expiringSoon.length === 0 ? (
                            <EmptyState title="No Pro stores yet" />
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {expiringSoon.map((s) => (
                                    <li key={s.id}>
                                        <Link
                                            href={route('admin.stores.show', s.id)}
                                            className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50 sm:px-5"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-medium text-gray-950">{s.name}</span>
                                                <span className="block truncate text-xs text-gray-500">
                                                    {s.owner ?? 'No owner'} · until {shortDate(s.until)}
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-sm">
                                                <DaysLeft days={s.days_left} />
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    <Card className="overflow-hidden">
                        <CardHeader
                            title="Free trials ending soonest"
                            subtitle="Stores to follow up before Management locks"
                            actions={
                                <Link href={route('admin.stores.index', { plan: 'trial', sort: 'expiring' })} className="btn btn-ghost btn-sm">
                                    All
                                    <Icon name="chevronRight" />
                                </Link>
                            }
                        />
                        {trialsEnding.length === 0 ? (
                            <EmptyState title="No stores on a trial" />
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {trialsEnding.map((s) => (
                                    <li key={s.id}>
                                        <Link
                                            href={route('admin.stores.show', s.id)}
                                            className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50 sm:px-5"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-medium text-gray-950">{s.name}</span>
                                                <span className="block truncate text-xs text-gray-500">
                                                    {s.owner ?? 'No owner'} · trial until {shortDate(s.until)}
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-sm">
                                                <DaysLeft days={s.days_left} />
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    <Card className="overflow-hidden">
                        <CardHeader title="Recent payments" />
                        {recentPayments.length === 0 ? (
                            <EmptyState title="No payments yet" />
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {recentPayments.map((p) => (
                                    <li key={p.id}>
                                        <Link
                                            href={route('admin.stores.show', p.store_id)}
                                            className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50 sm:px-5"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-medium text-gray-950">{p.store}</span>
                                                <span className="block text-xs text-gray-500">
                                                    {shortDate(p.paid_at)} ·{' '}
                                                    {p.provider === 'trial'
                                                        ? 'Free trial started'
                                                        : p.months > 0
                                                          ? `${p.months} month(s)`
                                                          : 'Plan change'}
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-sm font-semibold tabular-nums">
                                                {p.provider === 'trial' ? (
                                                    <Badge tone="blue">Trial</Badge>
                                                ) : p.provider === 'manual' ? (
                                                    <Badge>Manual</Badge>
                                                ) : (
                                                    peso(p.amount_cents)
                                                )}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                </div>

                <Card className="overflow-hidden">
                    <CardHeader
                        title="Newest stores"
                        actions={
                            <Link href={route('admin.stores.index')} className="btn btn-ghost btn-sm">
                                All stores
                                <Icon name="chevronRight" />
                            </Link>
                        }
                    />
                    {newStores.length === 0 ? (
                        <EmptyState title="No stores yet" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Store</th>
                                        <th>Owner</th>
                                        <th>Joined</th>
                                        <th>Plan</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {newStores.map((s) => (
                                        <tr key={s.id}>
                                            <td>
                                                <Link
                                                    href={route('admin.stores.show', s.id)}
                                                    className="font-medium text-gray-950 hover:text-brand-700"
                                                >
                                                    {s.name}
                                                </Link>
                                            </td>
                                            <td>{s.owner ?? '—'}</td>
                                            <td className="whitespace-nowrap">{shortDate(s.created_at)}</td>
                                            <td>
                                                {s.trial ? (
                                                    <Badge tone="blue">Trial</Badge>
                                                ) : s.pro ? (
                                                    <Badge tone="green">Pro</Badge>
                                                ) : (
                                                    <Badge>Free</Badge>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
        </AdminLayout>
    );
}
