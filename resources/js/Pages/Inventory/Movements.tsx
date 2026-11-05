import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import Pagination from '@/Components/Pagination';
import { Badge, Stat, Tone } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps, Paginated } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Card, EmptyState, Field, inputClass, InventoryNav, MOVEMENT_LABELS, peso, qty } from './Partials/shared';

type Movement = {
    id: number;
    at: string;
    branch: string | null;
    item_id: number;
    item: string | null;
    unit: string | null;
    type: string;
    quantity_change: number;
    quantity_after: number;
    unit_cost_cents: number | null;
    total_cost_cents: number | null;
    supplier: string | null;
    reference: string | null;
    sale_id: number | null;
    note: string | null;
    user: string | null;
};

type Filters = { from: string; to: string; type: string | null; item: number | null; branch: number | null };

type Props = {
    movements: Paginated<Movement>;
    totals: Record<string, { cost_cents: number; count: number }>;
    filters: Filters;
    items: { id: number; name: string; unit: string }[];
    /** Empty for staff tied to one branch. */
    branches: { id: number; name: string }[];
};

const TYPE_TONES: Record<string, Tone> = {
    purchase: 'green',
    sale: 'blue',
    adjustment: 'gray',
    waste: 'red',
    usage: 'amber',
    return: 'dark',
};

export default function Movements({ movements, totals, filters, items, branches }: PageProps<Props>) {
    const showBranch = branches.length > 1;
    const apply = (changes: Partial<Filters>) =>
        router.get(
            route('inventory.movements'),
            Object.fromEntries(Object.entries({ ...filters, ...changes }).filter(([, v]) => v !== null && v !== '')),
            { preserveState: true, preserveScroll: true },
        );

    const cost = (type: string) => totals[type]?.cost_cents ?? 0;
    const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== null && v !== ''));
    const count = (type: string, hint?: string) => {
        const n = totals[type]?.count;

        return `${n ?? 0} movement${n === 1 ? '' : 's'}${hint ? ` · ${hint}` : ''}`;
    };

    return (
        <AuthenticatedLayout header={<PageHeader title="Inventory" subtitle="Every delivery, sale, count, and loss" />}>
            <Head title="Stock history" />

            <div className="app-page">
                <InventoryNav />

                <Card className="p-4 sm:px-5">
                    <div
                        className={`grid gap-3 sm:grid-cols-2 lg:items-end ${showBranch ? 'lg:grid-cols-[1fr_1fr_1.5fr_1fr_1fr_auto]' : 'lg:grid-cols-[1fr_1fr_1.5fr_1fr_auto]'}`}
                    >
                        <Field label="From">
                            <input type="date" className={inputClass} value={filters.from} onChange={(e) => apply({ from: e.target.value })} />
                        </Field>
                        <Field label="To">
                            <input type="date" className={inputClass} value={filters.to} onChange={(e) => apply({ to: e.target.value })} />
                        </Field>
                        <Field label="Item">
                            <select
                                className={inputClass}
                                value={filters.item ?? ''}
                                onChange={(e) => apply({ item: e.target.value ? Number(e.target.value) : null })}
                            >
                                <option value="">All items</option>
                                {items.map((i) => (
                                    <option key={i.id} value={i.id}>
                                        {i.name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Type">
                            <select className={inputClass} value={filters.type ?? ''} onChange={(e) => apply({ type: e.target.value || null })}>
                                <option value="">All</option>
                                {Object.entries(MOVEMENT_LABELS).map(([v, l]) => (
                                    <option key={v} value={v}>
                                        {l}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        {showBranch && (
                            <Field label="Branch">
                                <select
                                    className={inputClass}
                                    value={filters.branch ?? ''}
                                    onChange={(e) => apply({ branch: e.target.value ? Number(e.target.value) : null })}
                                >
                                    <option value="">All branches</option>
                                    {branches.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        )}
                        <a href={route('inventory.movements.export', query)} className="btn btn-secondary">
                            <Icon name="download" />
                            Export CSV
                        </a>
                    </div>
                </Card>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Stat label="Received (purchases)" value={peso(cost('purchase'))} hint={count('purchase')} />
                    <Stat label="Used by sales" value={peso(cost('sale'))} hint={count('sale', 'Cost of ingredients sold')} />
                    <Stat label="Waste & spoilage" value={peso(cost('waste'))} hint={count('waste')} tone="red" />
                    <Stat label="In-store use" value={peso(cost('usage'))} hint={count('usage')} />
                </div>

                <Card className="overflow-hidden">
                    {movements.data.length === 0 ? (
                        <EmptyState title="No stock movements in this range" icon={<Icon name="inventory" className="h-5 w-5" />} />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>When</th>
                                        <th>Item</th>
                                        {showBranch && <th>Branch</th>}
                                        <th>Type</th>
                                        <th className="num">Change</th>
                                        <th className="num">{showBranch ? 'At branch after' : 'On hand after'}</th>
                                        <th className="num">Cost</th>
                                        <th>Details</th>
                                        <th>By</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {movements.data.map((m) => (
                                        <tr key={m.id}>
                                            <td className="whitespace-nowrap text-gray-600">{m.at}</td>
                                            <td className="min-w-[9rem]">
                                                <button
                                                    type="button"
                                                    onClick={() => apply({ item: m.item_id })}
                                                    className="text-left font-semibold text-gray-950 hover:text-brand-700"
                                                >
                                                    {m.item}
                                                </button>
                                            </td>
                                            {showBranch && <td className="whitespace-nowrap text-gray-600">{m.branch ?? '—'}</td>}
                                            <td>
                                                <Badge tone={TYPE_TONES[m.type] ?? 'gray'}>{MOVEMENT_LABELS[m.type] ?? m.type}</Badge>
                                            </td>
                                            <td
                                                className={`num whitespace-nowrap font-semibold ${m.quantity_change < 0 ? 'text-red-600' : 'text-emerald-700'}`}
                                            >
                                                {m.quantity_change > 0 ? '+' : ''}
                                                {qty(m.quantity_change)} {m.unit}
                                            </td>
                                            <td className="num whitespace-nowrap">
                                                {qty(m.quantity_after)} {m.unit}
                                            </td>
                                            <td className="num whitespace-nowrap">{m.total_cost_cents !== null ? peso(m.total_cost_cents) : '—'}</td>
                                            <td className="min-w-[12rem] text-gray-600">
                                                {[m.supplier, m.reference && (m.sale_id ? `Sale ${m.reference}` : `Ref ${m.reference}`), m.note]
                                                    .filter(Boolean)
                                                    .join(' · ') || '—'}
                                                {m.sale_id && (
                                                    <Link
                                                        href={route('sales.show', m.sale_id)}
                                                        className="ms-2 text-xs font-semibold text-brand-700 hover:underline"
                                                    >
                                                        View sale
                                                    </Link>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap text-gray-600">{m.user ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <Pagination paginator={movements} noun="movements" />
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
