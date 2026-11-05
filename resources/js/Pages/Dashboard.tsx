import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import { Alert, Badge, Card, CardHeader, EmptyState, Stat } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PAYMENT_LABELS } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { PageProps } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import BarChart from './Reports/Partials/BarChart';
import { formatDay, time12 } from './Workforce/Partials/shared';

type Totals = { count: number; total_cents: number };

type Props = {
    today: string | null;
    sales?: {
        today: Totals & { average_cents: number; items: number };
        yesterday: Totals;
        week: (Totals & { date: string })[];
        top: { name: string; quantity: number; revenue_cents: number }[];
        recent: {
            id: number;
            reference: string;
            sold_at: string;
            cashier: string | null;
            items_count: number;
            payment_method: keyof typeof PAYMENT_LABELS;
            total_cents: number;
        }[];
        /** Today at each branch, when the store has several (null for staff tied to one). */
        branches: { id: number; name: string; count: number; total_cents: number }[] | null;
    } | null;
    lowStock?: {
        count: number;
        out: number;
        items: { id: number; name: string; unit: string; quantity: number; reorder_level: number | null }[];
    } | null;
    team?: {
        scheduled: number;
        shifts: { employee: string | null; start: string; end: string; on_shift: boolean }[];
        onShift: { employee: string | null; since: string }[] | null;
        pending: number | null;
    } | null;
};

export default function Dashboard({ auth, today, sales, lowStock, team }: PageProps<Props>) {
    const { user, merchant, can, roleName } = auth;
    const currency = merchant?.currency ?? 'PHP';
    const money = (cents: number) => formatMoney(cents, currency);
    const canSell = Boolean(merchant && can?.['pos.sell']);
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const nothingToShow = !sales && !lowStock && !team;

    return (
        <AuthenticatedLayout header={<PageHeader title="Dashboard" subtitle={merchant ? `${merchant.name} · overview` : 'Overview'} />}>
            <Head title="Dashboard" />

            <div className="app-page">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-950">
                            {greeting}, {user.name.split(' ')[0]}
                        </h2>
                        <p className="text-sm text-gray-500">
                            {today
                                ? formatDay(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                                : 'Your account is not linked to a store yet.'}
                            {roleName && ` · ${roleName}`}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {can?.['sales.view'] && (
                            <Link href={route('sales.index')} className="btn btn-secondary">
                                <Icon name="sales" />
                                Sales history
                            </Link>
                        )}
                    </div>
                </div>

                {merchant && auth.subscription?.trial && auth.subscription.until && (
                    <Alert tone="blue">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                                <strong>Pro free trial:</strong>{' '}
                                {Math.max(0, Math.ceil((new Date(auth.subscription.until).getTime() - Date.now()) / 86400000))} day(s) left, until{' '}
                                {new Date(auth.subscription.until).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}. After that,
                                Management locks unless you subscribe.
                            </span>
                            {user.role === 'owner' && (
                                <Link href={route('subscription.index')} className="btn btn-secondary btn-sm">
                                    <Icon name="star" />
                                    Subscribe
                                </Link>
                            )}
                        </div>
                    </Alert>
                )}

                {!merchant && (
                    <Card>
                        <EmptyState title="No store yet">Ask your store owner to add you, or register a new store.</EmptyState>
                    </Card>
                )}

                {sales && <SalesOverview sales={sales} money={money} />}

                {(lowStock || team) && (
                    <div className="grid gap-5 lg:grid-cols-2">
                        {lowStock && <LowStockCard lowStock={lowStock} />}
                        {team && <TeamCard team={team} />}
                    </div>
                )}

                {merchant && nothingToShow && (
                    <Card>
                        <EmptyState
                            title="You're all set"
                            action={
                                canSell ? (
                                    <a href={route('pos.index')} className="btn btn-primary">
                                        <Icon name="pos" />
                                        Open the register
                                    </a>
                                ) : undefined
                            }
                        >
                            {canSell
                                ? 'Ring up sales on the POS. Sales made offline upload automatically once you are back online.'
                                : 'Use the menu to open the pages your role gives you access to.'}
                        </EmptyState>
                    </Card>
                )}
            </div>
        </AuthenticatedLayout>
    );
}

function BranchesToday({ branches, money }: { branches: NonNullable<NonNullable<Props['sales']>['branches']>; money: (cents: number) => string }) {
    const max = Math.max(...branches.map((b) => b.total_cents), 1);
    const { auth } = usePage<PageProps>().props;

    return (
        <Card>
            <CardHeader
                title="Today by branch"
                actions={
                    auth.can?.['settings.manage'] &&
                    auth.subscription?.active && (
                        <Link href={route('branches.index')} className="btn btn-ghost btn-sm">
                            Compare branches
                            <Icon name="chevronRight" />
                        </Link>
                    )
                }
            />
            <ul className="grid gap-x-6 gap-y-3 px-4 pb-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
                {branches.map((b) => (
                    <li key={b.id}>
                        <Link href={route('sales.index', { branch: b.id })} className="block rounded-lg px-2 py-1.5 -mx-2 hover:bg-gray-50">
                            <span className="flex items-baseline justify-between gap-3">
                                <span className="truncate text-sm font-medium text-gray-950">{b.name}</span>
                                <span className="text-sm font-semibold tabular-nums text-gray-950">{money(b.total_cents)}</span>
                            </span>
                            <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-gray-100">
                                <span className="block h-full rounded-full bg-brand-600" style={{ width: `${(b.total_cents / max) * 100}%` }} />
                            </span>
                            <span className="mt-1 block text-xs text-gray-500">{b.count} sale(s)</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </Card>
    );
}

function SalesOverview({ sales, money }: { sales: NonNullable<Props['sales']>; money: (cents: number) => string }) {
    const { today, yesterday } = sales;
    const change = yesterday.total_cents > 0 ? Math.round(((today.total_cents - yesterday.total_cents) / yesterday.total_cents) * 100) : null;
    const weekTotal = sales.week.reduce((sum, d) => sum + d.total_cents, 0);

    return (
        <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat
                    label="Net sales today"
                    value={money(today.total_cents)}
                    hint={
                        change === null
                            ? `Yesterday: ${money(yesterday.total_cents)}`
                            : `${change >= 0 ? '+' : ''}${change}% vs yesterday (${money(yesterday.total_cents)})`
                    }
                />
                <Stat label="Transactions" value={today.count.toLocaleString()} hint={`Yesterday: ${yesterday.count.toLocaleString()}`} />
                <Stat label="Average sale" value={money(today.average_cents)} />
                <Stat label="Items sold" value={today.items.toLocaleString()} />
            </div>

            {sales.branches && <BranchesToday branches={sales.branches} money={money} />}

            <div className="grid gap-5 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader
                        title="Net sales, last 7 days"
                        subtitle={`${money(weekTotal)} total`}
                        actions={
                            <Link href={route('reports.index', { type: 'sales' })} className="btn btn-ghost btn-sm">
                                Full report
                                <Icon name="chevronRight" />
                            </Link>
                        }
                    />
                    <div className="card-body">
                        <BarChart
                            title="Net sales, last 7 days"
                            height={200}
                            format={(cents) => (cents >= 100000 ? `₱${Math.round(cents / 100000)}k` : `₱${Math.round(cents / 100)}`)}
                            bars={sales.week.map((d) => ({
                                key: d.date,
                                label: formatDay(d.date, { weekday: 'short' }),
                                value: d.total_cents,
                                tooltip: `${formatDay(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}: ${money(d.total_cents)} · ${d.count} sale(s)`,
                            }))}
                        />
                    </div>
                </Card>

                <Card>
                    <CardHeader title="Top sellers today" />
                    {sales.top.length === 0 ? (
                        <EmptyState title="No sales yet today" />
                    ) : (
                        <ol className="divide-y divide-gray-100">
                            {sales.top.map((p, i) => (
                                <li key={p.name} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                                    <span className="w-4 text-xs font-semibold tabular-nums text-gray-400">{i + 1}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-gray-950">{p.name}</span>
                                        <span className="text-xs text-gray-500">{p.quantity} sold</span>
                                    </span>
                                    <span className="text-sm font-semibold tabular-nums text-gray-950">{money(p.revenue_cents)}</span>
                                </li>
                            ))}
                        </ol>
                    )}
                </Card>
            </div>

            <Card className="overflow-hidden">
                <CardHeader
                    title="Recent transactions"
                    actions={
                        <Link href={route('sales.index')} className="btn btn-ghost btn-sm">
                            View all
                            <Icon name="chevronRight" />
                        </Link>
                    }
                />
                {sales.recent.length === 0 ? (
                    <EmptyState title="No sales recorded yet" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Receipt</th>
                                    <th>Time</th>
                                    <th className="hidden sm:table-cell">Cashier</th>
                                    <th className="hidden md:table-cell">Payment</th>
                                    <th className="num">Items</th>
                                    <th className="num">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sales.recent.map((s) => (
                                    <tr key={s.id}>
                                        <td>
                                            <Link
                                                href={route('sales.show', s.id)}
                                                className="font-mono text-xs font-semibold text-gray-950 hover:text-brand-700"
                                            >
                                                #{s.reference}
                                            </Link>
                                        </td>
                                        <td className="whitespace-nowrap">
                                            {new Date(s.sold_at).toLocaleString(undefined, {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: 'numeric',
                                                minute: '2-digit',
                                            })}
                                        </td>
                                        <td className="hidden sm:table-cell">{s.cashier ?? '—'}</td>
                                        <td className="hidden md:table-cell">
                                            <Badge>{PAYMENT_LABELS[s.payment_method] ?? s.payment_method}</Badge>
                                        </td>
                                        <td className="num">{s.items_count}</td>
                                        <td className="num font-semibold text-gray-950">{money(s.total_cents)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </>
    );
}

function LowStockCard({ lowStock }: { lowStock: NonNullable<Props['lowStock']> }) {
    return (
        <Card>
            <CardHeader
                title="Stock alerts"
                subtitle={
                    lowStock.count
                        ? `${lowStock.count} item(s) at or below reorder level · ${lowStock.out} out`
                        : 'Everything is above its reorder level'
                }
                actions={
                    <Link href={route('inventory.index')} className="btn btn-ghost btn-sm">
                        Inventory
                        <Icon name="chevronRight" />
                    </Link>
                }
            />
            {lowStock.items.length === 0 ? (
                <EmptyState title="No low stock" icon={<Icon name="check" className="h-5 w-5" />} />
            ) : (
                <ul className="divide-y divide-gray-100">
                    {lowStock.items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-gray-950">{item.name}</span>
                                {item.reorder_level !== null && (
                                    <span className="text-xs text-gray-500">
                                        Reorder at {Number(item.reorder_level).toLocaleString()} {item.unit}
                                    </span>
                                )}
                            </span>
                            {item.quantity <= 0 ? (
                                <Badge tone="red">Out of stock</Badge>
                            ) : (
                                <Badge tone="amber">
                                    {Number(item.quantity).toLocaleString()} {item.unit} left
                                </Badge>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

function TeamCard({ team }: { team: NonNullable<Props['team']> }) {
    const extra = team.onShift?.filter((o) => !team.shifts.some((s) => s.employee === o.employee)) ?? [];

    return (
        <Card>
            <CardHeader
                title="Team today"
                subtitle={`${team.scheduled} published shift(s)${team.onShift ? ` · ${team.onShift.length} clocked in now` : ''}`}
                actions={
                    team.pending ? (
                        <Link href={route('attendance.index', { status: 'pending' })} className="btn btn-secondary btn-sm">
                            {team.pending} to approve
                        </Link>
                    ) : undefined
                }
            />
            {team.shifts.length === 0 && extra.length === 0 ? (
                <EmptyState title="No shifts scheduled today" />
            ) : (
                <ul className="divide-y divide-gray-100">
                    {team.shifts.map((s, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-gray-950">{s.employee}</span>
                                <span className="text-xs text-gray-500">
                                    {time12(s.start)} – {time12(s.end)}
                                </span>
                            </span>
                            {team.onShift && (s.on_shift ? <Badge tone="green">On shift</Badge> : <Badge>Not clocked in</Badge>)}
                        </li>
                    ))}
                    {extra.map((o, i) => (
                        <li key={`extra-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-gray-950">{o.employee}</span>
                                <span className="text-xs text-gray-500">Clocked in {time12(o.since)}, no shift today</span>
                            </span>
                            <Badge tone="green">On shift</Badge>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
