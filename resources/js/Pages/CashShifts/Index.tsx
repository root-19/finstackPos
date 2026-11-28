import PageHeader from '@/Components/PageHeader';
import Pagination from '@/Components/Pagination';
import { Badge, Card, EmptyState, Field } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatMoney } from '@/lib/money';
import { PageProps, Paginated } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';

type Shift = {
    id: number;
    branch: string | null;
    terminal: string;
    opened_by: string | null;
    closed_by: string | null;
    opened_at: string;
    closed_at: string | null;
    expected_cents: number;
    counted_cents: number | null;
    difference_cents: number | null;
};

type Filters = { from: string; to: string; branch: number | null };

type Props = PageProps<{ shifts: Paginated<Shift>; filters: Filters; branches: { id: number; name: string }[] }>;

export function DifferenceBadge({ cents, currency }: { cents: number | null; currency: string }) {
    if (cents === null) return <Badge tone="blue">Open</Badge>;
    if (cents === 0) return <Badge tone="green">Balanced</Badge>;
    return <Badge tone={cents > 0 ? 'amber' : 'red'}>{`${cents > 0 ? 'Over +' : 'Short '}${formatMoney(cents, currency)}`}</Badge>;
}

/** Every register's cash shifts and whether the drawer was over or short. */
export default function CashShiftsIndex({ shifts, filters, branches }: Props) {
    const currency = usePage<PageProps>().props.auth.merchant?.currency ?? 'PHP';
    const money = (c: number) => formatMoney(c, currency);
    const go = (changes: Partial<Filters>) =>
        router.get(route('cash-shifts.index'), Object.fromEntries(Object.entries({ ...filters, ...changes }).filter(([, v]) => v !== null && v !== '')), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    const time = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    return (
        <AuthenticatedLayout header={<PageHeader title="Shifts" subtitle="Who opened and closed each register, and whether the cash drawer was over or short." />}>
            <Head title="Shifts" />

            <div className="app-page">
                <Card className="p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Field label="From">
                            <input type="date" className="input" value={filters.from} onChange={(e) => e.target.value && go({ from: e.target.value })} />
                        </Field>
                        <Field label="To">
                            <input type="date" className="input" value={filters.to} onChange={(e) => e.target.value && go({ to: e.target.value })} />
                        </Field>
                        {branches.length > 1 && (
                            <Field label="Branch">
                                <select className="input" value={filters.branch ?? ''} onChange={(e) => go({ branch: e.target.value ? Number(e.target.value) : null })}>
                                    <option value="">All branches</option>
                                    {branches.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        )}
                    </div>
                </Card>

                {shifts.data.length === 0 ? (
                    <Card>
                        <div className="card-body">
                            <EmptyState title="No shifts in these dates">Cashiers open a shift on the Point of Sale before their first sale.</EmptyState>
                        </div>
                    </Card>
                ) : (
                    <Card className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Opened</th>
                                    <th>Closed</th>
                                    <th>Cashier</th>
                                    {branches.length > 1 && <th>Branch</th>}
                                    <th className="text-right">Expected</th>
                                    <th className="text-right">Counted</th>
                                    <th>Drawer</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shifts.data.map((s) => (
                                    <tr key={s.id} className="cursor-pointer hover:bg-gray-50" onClick={() => router.visit(route('cash-shifts.show', s.id))}>
                                        <td>
                                            <Link href={route('cash-shifts.show', s.id)} className="font-medium text-gray-900">
                                                {time(s.opened_at)}
                                            </Link>
                                        </td>
                                        <td>{s.closed_at ? time(s.closed_at) : '—'}</td>
                                        <td>
                                            {s.opened_by ?? '—'}
                                            {s.closed_by && s.closed_by !== s.opened_by ? ` → ${s.closed_by}` : ''}
                                        </td>
                                        {branches.length > 1 && <td>{s.branch ?? '—'}</td>}
                                        <td className="text-right tabular-nums">{money(s.expected_cents)}</td>
                                        <td className="text-right tabular-nums">{s.counted_cents === null ? '—' : money(s.counted_cents)}</td>
                                        <td>
                                            <DifferenceBadge cents={s.difference_cents} currency={currency} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Card>
                )}

                <Pagination paginator={shifts} noun="shifts" />
            </div>
        </AuthenticatedLayout>
    );
}
