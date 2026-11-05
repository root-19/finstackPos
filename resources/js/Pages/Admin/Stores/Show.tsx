import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import { Alert, Badge, Card, CardHeader, DialogLayout, EmptyState, Field, Stat } from '@/Components/ui';
import AdminLayout from '@/Layouts/AdminLayout';
import { formatMoney } from '@/lib/money';
import { PageProps } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { FormEventHandler, useState } from 'react';
import { DaysLeft, peso, PlanBadge, shortDate } from '../Partials/shared';

type Store = {
    id: number;
    name: string;
    slug: string;
    address: string | null;
    contact_number: string | null;
    tin: string | null;
    timezone: string;
    is_active: boolean;
    pro: boolean;
    trial: boolean;
    trial_ends_at: string | null;
    until: string | null;
    days_left: number | null;
    created_at: string;
};

type Props = {
    store: Store;
    people: { id: number; name: string; email: string; role: string; created_at: string }[];
    stats: {
        products: number;
        employees: number;
        sales: number;
        sales_cents: number;
        sales_30d: number;
        sales_30d_cents: number;
        first_sale_at: string | null;
        last_sale_at: string | null;
        currency: string;
    };
    branches: {
        id: number;
        name: string;
        is_active: boolean;
        sales: number;
        sales_cents: number;
        sales_30d_cents: number;
        last_sale_at: string | null;
    }[];
    payments: {
        id: number;
        created_at: string;
        months: number;
        amount_cents: number;
        provider: string;
        applied: boolean;
        status: string;
        period_start: string | null;
        period_end: string | null;
        note: string | null;
        by: string | null;
    }[];
};

type Action = 'grant' | 'end-date' | 'end-now' | 'active' | null;

export default function StoreShow({ store, people, stats, branches, payments }: PageProps<Props>) {
    const [action, setAction] = useState<Action>(null);
    const money = (cents: number) => formatMoney(cents, stats.currency);

    return (
        <AdminLayout header={<PageHeader title={store.name} subtitle="Store details and plan" />}>
            <Head title={store.name} />

            <div className="app-page">
                <Link href={route('admin.stores.index')} className="btn btn-ghost btn-sm -ml-2">
                    <Icon name="chevronLeft" />
                    All stores
                </Link>

                {/* Plan */}
                <Card>
                    <div className="card-body flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-lg font-semibold text-gray-950">{store.name}</h2>
                                <PlanBadge pro={store.pro} trial={store.trial} daysLeft={store.days_left} active={store.is_active} />
                            </div>
                            <p className="mt-0.5 text-sm text-gray-600">
                                {store.until ? (
                                    <>
                                        {store.trial ? 'Trial until' : store.pro ? 'Pro until' : 'Pro ended'} {shortDate(store.until)} ·{' '}
                                        <DaysLeft days={store.days_left} />
                                    </>
                                ) : (
                                    'Never subscribed (free plan).'
                                )}
                                {store.trial_ends_at && !store.trial && (
                                    <span className="block text-xs text-gray-500">Free trial ended {shortDate(store.trial_ends_at)}.</span>
                                )}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setAction('grant')} className="btn btn-primary">
                                <Icon name="plus" />
                                Add months
                            </button>
                            <button type="button" onClick={() => setAction('end-date')} className="btn btn-secondary">
                                <Icon name="schedule" />
                                Set end date
                            </button>
                            {store.pro && (
                                <button type="button" onClick={() => setAction('end-now')} className="btn btn-danger">
                                    End Pro now
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setAction('active')}
                                className={store.is_active ? 'btn btn-ghost text-red-600' : 'btn btn-secondary'}
                            >
                                {store.is_active ? 'Suspend store' : 'Reactivate store'}
                            </button>
                        </div>
                    </div>
                </Card>

                {!store.is_active && (
                    <Alert tone="red">This store is suspended: its owner and staff cannot use FinstackPOS until it is reactivated.</Alert>
                )}

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat
                        label="Sales, last 30 days"
                        value={money(stats.sales_30d_cents)}
                        hint={`${stats.sales_30d.toLocaleString()} transaction(s)`}
                    />
                    <Stat label="Sales, all time" value={money(stats.sales_cents)} hint={`${stats.sales.toLocaleString()} transaction(s)`} />
                    <Stat label="Products" value={stats.products.toLocaleString()} />
                    <Stat label="Employees" value={stats.employees.toLocaleString()} hint={`Last sale ${shortDate(stats.last_sale_at)}`} />
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                    <Card>
                        <CardHeader title="Store" />
                        <dl className="card-body grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                            <dt className="text-gray-500">Slug</dt>
                            <dd className="truncate font-mono text-xs">{store.slug}</dd>
                            <dt className="text-gray-500">Address</dt>
                            <dd>{store.address ?? '—'}</dd>
                            <dt className="text-gray-500">Contact</dt>
                            <dd>{store.contact_number ?? '—'}</dd>
                            <dt className="text-gray-500">TIN</dt>
                            <dd>{store.tin ?? '—'}</dd>
                            <dt className="text-gray-500">Time zone</dt>
                            <dd>{store.timezone}</dd>
                            <dt className="text-gray-500">Joined</dt>
                            <dd>{shortDate(store.created_at)}</dd>
                            <dt className="text-gray-500">First sale</dt>
                            <dd>{shortDate(stats.first_sale_at)}</dd>
                        </dl>
                    </Card>

                    <Card className="overflow-hidden">
                        <CardHeader title="Logins" subtitle={`${people.length} account(s)`} />
                        <ul className="divide-y divide-gray-100">
                            {people.map((p) => (
                                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium text-gray-950">{p.name}</span>
                                        <span className="block truncate text-xs text-gray-500">{p.email}</span>
                                    </span>
                                    <Badge tone={p.role === 'owner' ? 'brand' : 'gray'}>{p.role === 'owner' ? 'Owner' : 'Staff'}</Badge>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </div>

                <Card className="overflow-hidden">
                    <CardHeader title="Sales by branch" subtitle={`${branches.length} branch(es)`} />
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Branch</th>
                                    <th className="num">Last 30 days</th>
                                    <th className="num">All time</th>
                                    <th className="num">Transactions</th>
                                    <th className="num">Share</th>
                                    <th>Last sale</th>
                                </tr>
                            </thead>
                            <tbody>
                                {branches.map((b) => (
                                    <tr key={b.id}>
                                        <td className="font-medium text-gray-950">
                                            {b.name} {!b.is_active && <Badge>Closed</Badge>}
                                        </td>
                                        <td className="num">{money(b.sales_30d_cents)}</td>
                                        <td className="num font-medium text-gray-950">{money(b.sales_cents)}</td>
                                        <td className="num">{b.sales.toLocaleString()}</td>
                                        <td className="num">{stats.sales_cents ? `${Math.round((b.sales_cents / stats.sales_cents) * 100)}%` : '—'}</td>
                                        <td className="whitespace-nowrap">{shortDate(b.last_sale_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card className="overflow-hidden">
                    <CardHeader title="Subscription history" subtitle="Payments, and every change made by an administrator" />
                    {payments.length === 0 ? (
                        <EmptyState title="No payments or changes yet" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th className="num">Months</th>
                                        <th className="num">Amount</th>
                                        <th>Pro until</th>
                                        <th>Note</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((p) => (
                                        <tr key={p.id}>
                                            <td className="whitespace-nowrap">{shortDate(p.created_at)}</td>
                                            <td>
                                                {p.provider === 'trial' ? (
                                                    <Badge tone="blue">Free trial</Badge>
                                                ) : p.provider === 'manual' ? (
                                                    <Badge>By admin</Badge>
                                                ) : p.applied ? (
                                                    <Badge tone="green">Paid · QR Ph</Badge>
                                                ) : (
                                                    <Badge tone="amber">Not paid</Badge>
                                                )}
                                            </td>
                                            <td className="num">{p.months || '—'}</td>
                                            <td className="num">{p.amount_cents ? peso(p.amount_cents) : '—'}</td>
                                            <td className="whitespace-nowrap">{shortDate(p.period_end)}</td>
                                            <td className="max-w-xs text-xs text-gray-600">{p.note ?? (p.by ? `By ${p.by}` : '—')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>

            <ActionModal action={action} store={store} onClose={() => setAction(null)} />
        </AdminLayout>
    );
}

function ActionModal({ action, store, onClose }: { action: Action; store: Store; onClose: () => void }) {
    const form = useForm({ months: 1, until: store.until ? store.until.slice(0, 10) : '', note: '' });
    const errors = form.errors as Record<string, string | undefined>;

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const name = {
            grant: 'admin.stores.grant',
            'end-date': 'admin.stores.end-date',
            'end-now': 'admin.stores.end-now',
            active: 'admin.stores.active',
        }[action!];
        form.post(route(name, store.id), {
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                onClose();
            },
        });
    };

    const titles: Record<Exclude<Action, null>, [string, string]> = {
        grant: ['Add Pro months', 'Added after the current end date (or from today). Use for cash or bank payments, promos, or trials.'],
        'end-date': ['Set Pro end date', 'Corrects the paid-up date directly. A past date puts the store on the free plan.'],
        'end-now': ['End Pro now', 'The store returns to the free plan right away. Its data is kept; Management locks.'],
        active: store.is_active
            ? ['Suspend store', 'Nobody in this store can use FinstackPOS until you reactivate it. Nothing is deleted.']
            : ['Reactivate store', 'The owner and staff can sign in and use FinstackPOS again.'],
    };

    return (
        <Modal show={action !== null} onClose={onClose} maxWidth="md">
            {action && (
                <form onSubmit={submit}>
                    <DialogLayout
                        title={titles[action][0]}
                        description={titles[action][1]}
                        footer={
                            <>
                                <button type="button" onClick={onClose} className="btn btn-secondary">
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={form.processing}
                                    className={`btn ${action === 'end-now' || (action === 'active' && store.is_active) ? 'btn-danger-solid' : 'btn-primary'}`}
                                >
                                    {titles[action][0]}
                                </button>
                            </>
                        }
                    >
                        <div className="space-y-4">
                            {action === 'grant' && (
                                <Field label="Months" error={errors.months} required>
                                    <input
                                        type="number"
                                        min={1}
                                        max={120}
                                        className="input w-32"
                                        value={form.data.months}
                                        onChange={(e) => form.setData('months', Number(e.target.value))}
                                    />
                                </Field>
                            )}
                            {action === 'end-date' && (
                                <Field label="Pro until (end of this day, store time)" error={errors.until} required>
                                    <input
                                        type="date"
                                        className="input"
                                        value={form.data.until}
                                        onChange={(e) => form.setData('until', e.target.value)}
                                    />
                                </Field>
                            )}
                            {action !== 'active' && (
                                <Field
                                    label="Note"
                                    error={errors.note}
                                    required={action !== 'grant'}
                                    hint="Saved in the store's subscription history with your name."
                                >
                                    <input
                                        className="input"
                                        value={form.data.note}
                                        onChange={(e) => form.setData('note', e.target.value)}
                                        placeholder={action === 'grant' ? 'e.g. Paid by bank transfer, ref 12345' : 'e.g. Refunded on request'}
                                    />
                                </Field>
                            )}
                        </div>
                    </DialogLayout>
                </form>
            )}
        </Modal>
    );
}
