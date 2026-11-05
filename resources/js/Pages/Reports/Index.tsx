import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import { Card, CardHeader, Segmented, Stat } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { DISCOUNT_LABELS, PAYMENT_LABELS } from '@/lib/format';
import { PageProps } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { ReactNode, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { addDays, FREQUENCY_LABELS, formatDay, hours, peso, StatusBadge } from '../Workforce/Partials/shared';
import { qty, StockStatus, unitCost } from '../Inventory/Partials/shared';
import BarChart from './Partials/BarChart';
import ReportTable from './Partials/ReportTable';

type ReportType = 'sales' | 'inventory' | 'payroll' | 'workforce';

/* eslint-disable @typescript-eslint/no-explicit-any -- each report has its own shape; typed per section below */
type Props = {
    available: ReportType[];
    type: ReportType;
    filters: { from: string; to: string; drafts: boolean; branch: number | null };
    /** Several branches, for users who see them all (empty otherwise). */
    branches: { id: number; name: string }[];
    today: string;
    report: any;
    generatedAt: string;
};

const TITLES: Record<ReportType, string> = {
    sales: 'Sales',
    inventory: 'Inventory',
    payroll: 'Salary & Payroll',
    workforce: 'Schedule & Attendance',
};

/** Pesos as a plain CSV number. */
const csvPeso = (cents: number | null | undefined) => (cents === null || cents === undefined ? null : (cents / 100).toFixed(2));
const csvHours = (minutes: number) => (minutes / 60).toFixed(2);

function presets(today: string): { label: string; from: string; to: string }[] {
    const [y, m, d] = today.split('-').map(Number);
    const pad = (n: number) => String(n).padStart(2, '0');
    const ymd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const monday = addDays(today, -((new Date(y, m - 1, d).getDay() + 6) % 7));

    return [
        { label: 'Today', from: today, to: today },
        { label: 'Yesterday', from: addDays(today, -1), to: addDays(today, -1) },
        { label: 'This week', from: monday, to: today },
        { label: 'Last 7 days', from: addDays(today, -6), to: today },
        { label: 'This month', from: ymd(new Date(y, m - 1, 1)), to: today },
        { label: 'Last month', from: ymd(new Date(y, m - 2, 1)), to: ymd(new Date(y, m - 1, 0)) },
        { label: 'Last 30 days', from: addDays(today, -29), to: today },
        { label: 'This year', from: `${y}-01-01`, to: today },
    ];
}

export default function Reports({ available, type, filters, branches, today, report, generatedAt }: PageProps<Props>) {
    const [printing, setPrinting] = useState(false);
    const merchant = usePage<PageProps>().props.auth.merchant;
    const errors = usePage().props.errors as Record<string, string | undefined>;

    const go = (changes: Partial<{ type: ReportType; from: string; to: string; drafts: boolean; branch: number | null }>) => {
        const branch = changes.branch !== undefined ? changes.branch : filters.branch;

        router.get(
            route('reports.index'),
            { type, ...filters, ...changes, drafts: (changes.drafts ?? filters.drafts) ? 1 : 0, branch: branch ?? undefined },
            { preserveState: true, preserveScroll: true },
        );
    };

    const print = () => {
        flushSync(() => setPrinting(true));
        window.print();
        setPrinting(false);
    };

    const dates = filters.from === filters.to ? formatDay(filters.from) : `${formatDay(filters.from)} – ${formatDay(filters.to)}`;
    // Which branch the numbers are for (overall: every branch added up).
    const scope = branches.length > 0 ? (branches.find((b) => b.id === filters.branch)?.name ?? 'All branches') : null;
    const range = scope ? `${scope} · ${dates}` : dates;
    const body = (
        <>
            {type === 'sales' && <SalesReport r={report} from={filters.from} to={filters.to} />}
            {type === 'inventory' && <InventoryReport r={report} from={filters.from} to={filters.to} />}
            {type === 'payroll' && <PayrollReport r={report} from={filters.from} to={filters.to} />}
            {type === 'workforce' && <WorkforceReport r={report} from={filters.from} to={filters.to} />}
        </>
    );

    return (
        <AuthenticatedLayout header={<PageHeader title="Reports" subtitle="Sales, inventory, payroll, and schedule reports for any date range" />}>
            <Head title="Reports" />

            <div className="app-page">
                {/* Filters in one row above the report */}
                <Card className="p-4 sm:px-5">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="-mx-1 max-w-full overflow-x-auto px-1">
                            <p className="label mb-1">Report</p>
                            <Segmented
                                label="Report"
                                value={type}
                                onChange={(t) => go({ type: t })}
                                options={available.map((t) => ({ value: t, label: TITLES[t] }))}
                            />
                        </div>
                        <label className="label">
                            From
                            <input
                                type="date"
                                value={filters.from}
                                max={today}
                                onChange={(e) => e.target.value && go({ from: e.target.value })}
                                className="input mt-1 w-auto"
                            />
                        </label>
                        <label className="label">
                            To
                            <input
                                type="date"
                                value={filters.to}
                                max={today}
                                onChange={(e) => e.target.value && go({ to: e.target.value })}
                                className="input mt-1 w-auto"
                            />
                        </label>
                        {branches.length > 0 && (type === 'sales' || type === 'inventory') && (
                            <label className="label">
                                Branch
                                <select
                                    value={filters.branch ?? ''}
                                    onChange={(e) => go({ branch: e.target.value ? Number(e.target.value) : null })}
                                    className="input mt-1 w-auto pe-8"
                                >
                                    <option value="">All branches (overall)</option>
                                    {branches.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        {type === 'payroll' && (
                            <label className="flex h-9 items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={filters.drafts}
                                    onChange={(e) => go({ drafts: e.target.checked })}
                                    className="checkbox"
                                />
                                Include drafts &amp; payrolls in review
                            </label>
                        )}
                        <button type="button" onClick={print} className="btn btn-secondary ms-auto">
                            <Icon name="printer" />
                            Print / Save as PDF
                        </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Date presets">
                        {presets(today).map((p) => {
                            const active = filters.from === p.from && filters.to === p.to;

                            return (
                                <button
                                    key={p.label}
                                    type="button"
                                    onClick={() => go({ from: p.from, to: p.to })}
                                    aria-pressed={active}
                                    className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                                        active
                                            ? 'bg-brand-50 text-brand-700 ring-brand-200'
                                            : 'text-gray-600 ring-gray-200 hover:bg-gray-50 hover:text-gray-950'
                                    }`}
                                >
                                    {p.label}
                                </button>
                            );
                        })}
                    </div>
                    {errors.from && <p className="field-error mt-2">{errors.from}</p>}
                </Card>

                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h2 className="text-base font-semibold text-gray-950">
                        {TITLES[type]} report <span className="font-normal text-gray-500">· {range}</span>
                    </h2>
                    <p className="text-xs text-gray-500">Generated {generatedAt}</p>
                </div>

                <div className="space-y-4">{body}</div>
            </div>

            {printing &&
                createPortal(
                    <div id="receipt-print" className="report-print">
                        <style>
                            {[
                                '@page { size: A4; margin: 12mm; }',
                                '#receipt-print .no-print { display: none !important; }',
                                '#receipt-print .card, #receipt-print .stat { box-shadow: none; }',
                                // Wide tables print in full instead of being cut off by their scroll box.
                                '#receipt-print .overflow-x-auto { overflow: visible !important; }',
                                '#receipt-print .data-table { font-size: 10px; }',
                                '#receipt-print .data-table th, #receipt-print .data-table td { padding: 4px 6px; }',
                                '#receipt-print .stat { padding: 8px 10px; }',
                                '#receipt-print .truncate { white-space: normal; overflow: visible; }',
                            ].join(' ')}
                        </style>
                        <div className="mb-4 border-b border-gray-300 pb-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{merchant?.name}</p>
                            <h1 className="text-lg font-semibold text-gray-950">
                                {TITLES[type]} report · {range}
                            </h1>
                            <p className="text-xs text-gray-500">Generated {generatedAt}</p>
                        </div>
                        <div className="space-y-4 text-gray-950">{body}</div>
                    </div>,
                    document.body,
                )}
        </AuthenticatedLayout>
    );
}

function Tiles({ children }: { children: ReactNode }) {
    return <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4">{children}</div>;
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'red' | 'amber' | 'green' }) {
    return <Stat label={label} value={value} hint={hint} tone={tone} />;
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
    return (
        <Card className="report-section break-inside-avoid">
            <CardHeader title={title} subtitle={subtitle} />
            <div className="card-body">{children}</div>
        </Card>
    );
}

const shortDay = (d: string) => formatDay(d, { month: 'short', day: 'numeric' });
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;
const compactPeso = (cents: number) =>
    cents >= 100000000
        ? `₱${(cents / 100000000).toFixed(1)}M`
        : cents >= 100000
          ? `₱${(cents / 100000).toFixed(cents >= 1000000 ? 0 : 1)}k`
          : `₱${Math.round(cents / 100)}`;

/* ----------------------------------------------------------------- Sales */

function SalesReport({ r, from, to }: { r: any; from: string; to: string }) {
    const s = r.summary;
    const file = (name: string) => `sales-${name}-${from}-to-${to}.csv`;
    const share = (cents: number) => (s.gross_cents ? `${((cents / s.gross_cents) * 100).toFixed(1)}%` : '—');

    return (
        <>
            <Tiles>
                <Tile label="Net sales" value={peso(s.net_cents)} hint="What customers paid" />
                <Tile label="Transactions" value={s.transactions.toLocaleString()} />
                <Tile label="Average sale" value={peso(s.average_cents)} />
                <Tile label="Items sold" value={s.items_sold.toLocaleString()} />
            </Tiles>
            <Tiles>
                <Tile label="Gross (before discounts)" value={peso(s.gross_cents)} />
                <Tile label="Senior / PWD discounts" value={peso(s.discount_cents)} hint={`VAT exempted ${peso(s.vat_exempt_cents)}`} />
                <Tile label="VAT" value={peso(s.tax_cents)} />
                <Tile label="Service charge" value={peso(s.service_charge_cents)} />
            </Tiles>

            {from !== to && (
                <ChartCard title="Net sales by day">
                    <BarChart
                        title="Net sales by day"
                        format={compactPeso}
                        bars={r.daily.map((d: any) => ({
                            key: d.date,
                            label: shortDay(d.date),
                            value: d.total_cents,
                            tooltip: `${formatDay(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}: ${peso(d.total_cents)} · ${d.count} sale(s)`,
                        }))}
                    />
                </ChartCard>
            )}
            <ChartCard title="Busiest hours" subtitle="Net sales by hour of the day">
                <BarChart
                    title="Net sales by hour"
                    format={compactPeso}
                    labelEvery={2}
                    bars={r.hourly.map((h: any) => ({
                        key: String(h.hour),
                        label: hourLabel(h.hour),
                        value: h.total_cents,
                        tooltip: `${hourLabel(h.hour)}–${hourLabel((h.hour + 1) % 24)}: ${peso(h.total_cents)} · ${h.count} sale(s)`,
                    }))}
                />
            </ChartCard>

            {r.branches && (
                <ReportTable
                    title="By branch"
                    subtitle="Each branch's share of the overall sales"
                    rows={r.branches}
                    csvName={file('branches')}
                    columns={[
                        { label: 'Branch', value: (b: any) => b.branch },
                        { label: 'Sales', value: (b: any) => b.count, align: 'right' },
                        { label: 'Gross', value: (b: any) => csvPeso(b.gross_cents), render: (b: any) => peso(b.gross_cents), align: 'right' },
                        { label: 'Discounts', value: (b: any) => csvPeso(b.discount_cents), render: (b: any) => peso(b.discount_cents), align: 'right' },
                        { label: 'Net sales', value: (b: any) => csvPeso(b.net_cents), render: (b: any) => peso(b.net_cents), align: 'right' },
                        { label: 'Average', value: (b: any) => csvPeso(b.average_cents), render: (b: any) => peso(b.average_cents), align: 'right' },
                        { label: 'Share', value: (b: any) => `${b.share_pct}%`, align: 'right' },
                    ]}
                    footer={['Overall', s.transactions.toLocaleString(), peso(s.gross_cents), peso(s.discount_cents), peso(s.net_cents), peso(s.average_cents), '100%']}
                />
            )}

            <ReportTable
                title="Products sold"
                subtitle="By product and size; amounts before sale discounts"
                rows={r.products}
                limit={25}
                csvName={file('products')}
                columns={[
                    { label: 'Product', value: (p: any) => p.product },
                    { label: 'Size', value: (p: any) => p.size ?? '', render: (p: any) => p.size ?? '—' },
                    { label: 'Qty', value: (p: any) => p.quantity, align: 'right' },
                    { label: 'Sales', value: (p: any) => csvPeso(p.revenue_cents), render: (p: any) => peso(p.revenue_cents), align: 'right' },
                    { label: 'Share', value: (p: any) => share(p.revenue_cents), align: 'right' },
                ]}
            />

            <div className="grid gap-4 lg:grid-cols-2">
                <ReportTable
                    title="By category"
                    rows={r.categories}
                    csvName={file('categories')}
                    columns={[
                        { label: 'Category', value: (c: any) => c.category },
                        { label: 'Qty', value: (c: any) => c.quantity, align: 'right' },
                        { label: 'Sales', value: (c: any) => csvPeso(c.revenue_cents), render: (c: any) => peso(c.revenue_cents), align: 'right' },
                        { label: 'Share', value: (c: any) => share(c.revenue_cents), align: 'right' },
                    ]}
                />
                <ReportTable
                    title="By payment method"
                    rows={r.payments}
                    csvName={file('payments')}
                    columns={[
                        { label: 'Method', value: (p: any) => PAYMENT_LABELS[p.method as keyof typeof PAYMENT_LABELS] ?? p.method },
                        { label: 'Sales', value: (p: any) => p.count, align: 'right' },
                        { label: 'Amount', value: (p: any) => csvPeso(p.total_cents), render: (p: any) => peso(p.total_cents), align: 'right' },
                    ]}
                    footer={['Total', s.transactions.toLocaleString(), peso(s.net_cents)]}
                />
                <ReportTable
                    title="By cashier"
                    rows={r.cashiers}
                    csvName={file('cashiers')}
                    columns={[
                        { label: 'Cashier', value: (c: any) => c.cashier },
                        { label: 'Sales', value: (c: any) => c.count, align: 'right' },
                        { label: 'Amount', value: (c: any) => csvPeso(c.total_cents), render: (c: any) => peso(c.total_cents), align: 'right' },
                        {
                            label: 'Average',
                            value: (c: any) => csvPeso(c.count ? Math.round(c.total_cents / c.count) : 0),
                            render: (c: any) => peso(c.count ? Math.round(c.total_cents / c.count) : 0),
                            align: 'right',
                        },
                    ]}
                />
            </div>

            <ReportTable
                title="Senior Citizen & PWD discounts"
                subtitle="Each discounted sale with the customer’s ID, for your records and BIR reporting"
                rows={r.discounts}
                csvName={file('senior-pwd')}
                empty="No Senior or PWD discounts in this range."
                columns={[
                    { label: 'Date', value: (d: any) => d.date },
                    { label: 'Receipt', value: (d: any) => d.reference },
                    { label: 'Type', value: (d: any) => DISCOUNT_LABELS[d.type as keyof typeof DISCOUNT_LABELS] ?? d.type },
                    { label: 'Customer', value: (d: any) => d.customer },
                    { label: 'ID no.', value: (d: any) => d.id_number },
                    {
                        label: 'DOH check',
                        value: (d: any) => (d.type === 'pwd' ? (d.doh_check === 'found' ? 'Found' : d.doh_check === 'not_found' ? 'Not found' : 'Not checked') : ''),
                    },
                    { label: 'Gross', value: (d: any) => csvPeso(d.gross_cents), render: (d: any) => peso(d.gross_cents), align: 'right' },
                    {
                        label: 'VAT exempt',
                        value: (d: any) => csvPeso(d.vat_exempt_cents),
                        render: (d: any) => peso(d.vat_exempt_cents),
                        align: 'right',
                    },
                    { label: 'Discount', value: (d: any) => csvPeso(d.discount_cents), render: (d: any) => peso(d.discount_cents), align: 'right' },
                    { label: 'Paid', value: (d: any) => csvPeso(d.total_cents), render: (d: any) => peso(d.total_cents), align: 'right' },
                ]}
            />

            <ReportTable
                title="Daily summary"
                rows={r.daily}
                csvName={file('daily')}
                columns={[
                    {
                        label: 'Date',
                        value: (d: any) => d.date,
                        render: (d: any) => formatDay(d.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
                    },
                    { label: 'Sales', value: (d: any) => d.count, align: 'right' },
                    { label: 'Net sales', value: (d: any) => csvPeso(d.total_cents), render: (d: any) => peso(d.total_cents), align: 'right' },
                ]}
                footer={['Total', s.transactions.toLocaleString(), peso(s.net_cents)]}
            />
        </>
    );
}

/* ------------------------------------------------------------- Inventory */

function InventoryReport({ r, from, to }: { r: any; from: string; to: string }) {
    const s = r.summary;
    const file = (name: string) => `inventory-${name}-${from}-to-${to}.csv`;

    return (
        <>
            <Tiles>
                <Tile label="Stock value now" value={peso(s.value_cents)} hint={`${s.items} active items`} />
                <Tile label="Bought (received)" value={peso(s.purchases_cents)} />
                <Tile label="Used by sales (cost)" value={peso(s.cogs_cents)} hint="From product recipes" />
                <Tile
                    label="Waste & spoilage"
                    value={peso(s.waste_cents)}
                    tone={s.waste_cents ? 'red' : undefined}
                    hint={`In-store use ${peso(s.usage_cents)}`}
                />
            </Tiles>

            {r.profit && (
                <Card className="report-section break-inside-avoid">
                    <CardHeader
                        title="Gross profit (estimate)"
                        subtitle="Sales without VAT and service charge, less the recipe cost of what was sold. Products without a recipe count as zero cost."
                    />
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:p-5 md:grid-cols-4 print:grid-cols-4">
                        <div>
                            <dt className="stat-label">Sales</dt>
                            <dd className="stat-value">{peso(r.profit.revenue_cents)}</dd>
                        </div>
                        <div>
                            <dt className="stat-label">Cost of goods sold</dt>
                            <dd className="stat-value">{peso(r.profit.cogs_cents)}</dd>
                        </div>
                        <div className="md:border-l md:border-gray-100 md:pl-4">
                            <dt className="stat-label">Gross profit</dt>
                            <dd className={`stat-value text-2xl ${r.profit.gross_profit_cents < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                                {peso(r.profit.gross_profit_cents)}
                            </dd>
                        </div>
                        <div>
                            <dt className="stat-label">Margin</dt>
                            <dd className="stat-value text-2xl">{r.profit.margin_pct !== null ? `${r.profit.margin_pct}%` : '—'}</dd>
                        </div>
                    </dl>
                </Card>
            )}

            {r.branches && (
                <ReportTable
                    title="By branch"
                    subtitle="Stock value now, and the cost of stock moved in this range, at each branch"
                    rows={r.branches}
                    csvName={file('branches')}
                    columns={[
                        { label: 'Branch', value: (b: any) => b.branch },
                        { label: 'Stock value', value: (b: any) => csvPeso(b.value_cents), render: (b: any) => peso(b.value_cents), align: 'right' },
                        { label: 'Received', value: (b: any) => csvPeso(b.purchases_cents), render: (b: any) => peso(b.purchases_cents), align: 'right' },
                        { label: 'Used by sales', value: (b: any) => csvPeso(b.cogs_cents), render: (b: any) => peso(b.cogs_cents), align: 'right' },
                        { label: 'Waste', value: (b: any) => csvPeso(b.waste_cents), render: (b: any) => peso(b.waste_cents), align: 'right' },
                        { label: 'In-store use', value: (b: any) => csvPeso(b.usage_cents), render: (b: any) => peso(b.usage_cents), align: 'right' },
                    ]}
                    footer={['Overall', peso(s.value_cents), peso(s.purchases_cents), peso(s.cogs_cents), peso(s.waste_cents), peso(s.usage_cents)]}
                />
            )}

            <ReportTable
                title="Reorder list"
                subtitle={`${s.low} low · ${s.out} out of stock`}
                rows={r.reorder}
                csvName={file('reorder')}
                empty="Nothing is low or out of stock."
                columns={[
                    { label: 'Item', value: (i: any) => i.name },
                    { label: 'On hand', value: (i: any) => i.on_hand, render: (i: any) => `${qty(i.on_hand)} ${i.unit}`, align: 'right' },
                    { label: 'Status', value: (i: any) => i.status, render: (i: any) => <StockStatus status={i.status} /> },
                    { label: 'Supplier', value: (i: any) => i.supplier ?? '', render: (i: any) => i.supplier ?? '—' },
                ]}
            />

            <ReportTable
                title="Stock movement by item"
                subtitle="Quantities in each item’s unit for the selected range; on hand and value are as of now"
                rows={r.items}
                csvName={file('movement')}
                columns={[
                    { label: 'Item', value: (i: any) => i.name },
                    { label: 'Unit', value: (i: any) => i.unit },
                    { label: 'Received', value: (i: any) => i.received, render: (i: any) => qty(i.received), align: 'right' },
                    { label: 'Sold', value: (i: any) => i.sold, render: (i: any) => qty(i.sold), align: 'right' },
                    { label: 'Waste', value: (i: any) => i.waste, render: (i: any) => qty(i.waste), align: 'right' },
                    { label: 'Used', value: (i: any) => i.used, render: (i: any) => qty(i.used), align: 'right' },
                    { label: 'Returned', value: (i: any) => i.returned, render: (i: any) => qty(i.returned), align: 'right' },
                    {
                        label: 'Count adj.',
                        value: (i: any) => i.adjusted,
                        render: (i: any) => (i.adjusted > 0 ? '+' : '') + qty(i.adjusted),
                        align: 'right',
                    },
                    { label: 'On hand', value: (i: any) => i.on_hand, render: (i: any) => qty(i.on_hand), align: 'right' },
                    {
                        label: 'Unit cost',
                        value: (i: any) => (i.unit_cost_cents / 100).toFixed(4),
                        render: (i: any) => unitCost(i.unit_cost_cents),
                        align: 'right',
                    },
                    { label: 'Value', value: (i: any) => csvPeso(i.value_cents), render: (i: any) => peso(i.value_cents), align: 'right' },
                ]}
            />
        </>
    );
}

/* --------------------------------------------------------------- Payroll */

function PayrollReport({ r, from, to }: { r: any; from: string; to: string }) {
    const s = r.summary;
    const file = (name: string) => `payroll-${name}-${from}-to-${to}.csv`;
    const sum = (key: string) => r.employees.reduce((t: number, e: any) => t + e[key], 0);

    return (
        <>
            <Tiles>
                <Tile label="Gross pay" value={peso(s.gross_cents)} hint={`${s.payslips} payslip(s) in ${s.runs} payroll(s)`} />
                <Tile label="Employee deductions" value={peso(s.deductions_cents)} />
                <Tile label="Net pay" value={peso(s.net_cents)} />
                <Tile label="Employer contributions" value={peso(s.employer_cents)} hint="Paid on top of gross" />
            </Tiles>
            <Tiles>
                <Tile label="Total labor cost" value={peso(s.labor_cost_cents)} hint="Gross + employer share" />
                {s.sales_cents !== null && <Tile label="Net sales" value={peso(s.sales_cents)} />}
                {s.labor_pct !== null && (
                    <Tile label="Labor cost % of sales" value={`${s.labor_pct}%`} tone={s.labor_pct > 35 ? 'amber' : undefined} />
                )}
            </Tiles>

            <ReportTable
                title="Government remittances"
                subtitle="Employee and employer shares to remit for these payrolls. Check the amounts against each agency’s current tables."
                rows={r.remittances}
                csvName={file('remittances')}
                columns={[
                    { label: 'Agency', value: (x: any) => x.agency },
                    {
                        label: 'Employee share',
                        value: (x: any) => csvPeso(x.employee_cents),
                        render: (x: any) => peso(x.employee_cents),
                        align: 'right',
                    },
                    {
                        label: 'Employer share',
                        value: (x: any) => csvPeso(x.employer_cents),
                        render: (x: any) => peso(x.employer_cents),
                        align: 'right',
                    },
                    { label: 'Total to remit', value: (x: any) => csvPeso(x.total_cents), render: (x: any) => peso(x.total_cents), align: 'right' },
                ]}
            />

            <ReportTable
                title="By employee"
                rows={r.employees}
                csvName={file('employees')}
                columns={[
                    { label: 'Employee', value: (e: any) => e.employee },
                    { label: 'Payslips', value: (e: any) => e.payslips, align: 'right' },
                    { label: 'Basic', value: (e: any) => csvPeso(e.basic_cents), render: (e: any) => peso(e.basic_cents), align: 'right' },
                    {
                        label: 'Other earnings',
                        value: (e: any) => csvPeso(e.earnings_cents),
                        render: (e: any) => peso(e.earnings_cents),
                        align: 'right',
                    },
                    { label: 'Gross', value: (e: any) => csvPeso(e.gross_cents), render: (e: any) => peso(e.gross_cents), align: 'right' },
                    { label: 'SSS', value: (e: any) => csvPeso(e.sss_cents), render: (e: any) => peso(e.sss_cents), align: 'right' },
                    {
                        label: 'PhilHealth',
                        value: (e: any) => csvPeso(e.philhealth_cents),
                        render: (e: any) => peso(e.philhealth_cents),
                        align: 'right',
                    },
                    { label: 'Pag-IBIG', value: (e: any) => csvPeso(e.pagibig_cents), render: (e: any) => peso(e.pagibig_cents), align: 'right' },
                    { label: 'Tax', value: (e: any) => csvPeso(e.tax_cents), render: (e: any) => peso(e.tax_cents), align: 'right' },
                    {
                        label: 'Other ded.',
                        value: (e: any) => csvPeso(e.other_deductions_cents),
                        render: (e: any) => peso(e.other_deductions_cents),
                        align: 'right',
                    },
                    { label: 'Net', value: (e: any) => csvPeso(e.net_cents), render: (e: any) => peso(e.net_cents), align: 'right' },
                    { label: 'Employer', value: (e: any) => csvPeso(e.employer_cents), render: (e: any) => peso(e.employer_cents), align: 'right' },
                ]}
                footer={[
                    'Total',
                    String(sum('payslips')),
                    peso(sum('basic_cents')),
                    peso(sum('earnings_cents')),
                    peso(sum('gross_cents')),
                    peso(sum('sss_cents')),
                    peso(sum('philhealth_cents')),
                    peso(sum('pagibig_cents')),
                    peso(sum('tax_cents')),
                    peso(sum('other_deductions_cents')),
                    peso(sum('net_cents')),
                    peso(sum('employer_cents')),
                ]}
            />

            <ReportTable
                title="Payroll runs"
                subtitle="Payrolls whose pay period ends in this range"
                rows={r.runs}
                csvName={file('runs')}
                empty="No finalized payroll in this range."
                columns={[
                    { label: 'Pay period', value: (x: any) => x.period },
                    { label: 'Frequency', value: (x: any) => FREQUENCY_LABELS[x.frequency] ?? x.frequency },
                    { label: 'Status', value: (x: any) => x.status, render: (x: any) => <StatusBadge status={x.status} /> },
                    { label: 'Employees', value: (x: any) => x.employees, align: 'right' },
                    { label: 'Gross', value: (x: any) => csvPeso(x.gross_cents), render: (x: any) => peso(x.gross_cents), align: 'right' },
                    {
                        label: 'Deductions',
                        value: (x: any) => csvPeso(x.deductions_cents),
                        render: (x: any) => peso(x.deductions_cents),
                        align: 'right',
                    },
                    { label: 'Net', value: (x: any) => csvPeso(x.net_cents), render: (x: any) => peso(x.net_cents), align: 'right' },
                    { label: 'Employer', value: (x: any) => csvPeso(x.employer_cents), render: (x: any) => peso(x.employer_cents), align: 'right' },
                ]}
            />
        </>
    );
}

/* ------------------------------------------------------------- Workforce */

function WorkforceReport({ r, from, to }: { r: any; from: string; to: string }) {
    const s = r.summary;
    const att: boolean = r.withAttendance;
    const file = (name: string) => `schedule-${name}-${from}-to-${to}.csv`;
    const metric = att ? 'worked_minutes' : 'scheduled_minutes';

    return (
        <>
            <Tiles>
                <Tile
                    label="Shifts scheduled"
                    value={s.shifts.toLocaleString()}
                    hint={s.drafts ? `${s.drafts} still draft` : `${s.employees} employee(s)`}
                />
                <Tile label="Scheduled hours" value={hours(s.scheduled_minutes)} />
                {att && <Tile label="Hours worked" value={hours(s.worked_minutes)} hint="Approved attendance" />}
                {att && <Tile label="Overtime" value={hours(s.overtime_minutes)} />}
            </Tiles>
            {att && (
                <Tiles>
                    <Tile label="Late" value={hours(s.late_minutes)} tone={s.late_minutes ? 'amber' : undefined} />
                    <Tile label="Absences" value={String(s.absences)} tone={s.absences ? 'red' : undefined} />
                    <Tile
                        label="Waiting for approval"
                        value={String(s.pending)}
                        tone={s.pending ? 'amber' : undefined}
                        hint="Not counted until approved"
                    />
                </Tiles>
            )}

            {from !== to && (
                <ChartCard title={att ? 'Hours worked by day' : 'Scheduled hours by day'}>
                    <BarChart
                        title={att ? 'Hours worked by day' : 'Scheduled hours by day'}
                        format={(m) => `${Math.round(m / 60)}h`}
                        bars={r.daily.map((d: any) => ({
                            key: d.date,
                            label: shortDay(d.date),
                            value: d[metric],
                            tooltip: `${formatDay(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}: ${hours(d[metric])}${
                                att ? ` worked of ${hours(d.scheduled_minutes)} scheduled` : ` · ${d.shifts} shift(s)`
                            }`,
                        }))}
                    />
                </ChartCard>
            )}

            <ReportTable
                title="By employee"
                rows={r.employees}
                csvName={file('employees')}
                columns={[
                    { label: 'Employee', value: (e: any) => e.employee },
                    { label: 'Shifts', value: (e: any) => e.shifts, align: 'right' },
                    {
                        label: 'Scheduled',
                        value: (e: any) => csvHours(e.scheduled_minutes),
                        render: (e: any) => hours(e.scheduled_minutes),
                        align: 'right',
                    },
                    ...(att
                        ? [
                              { label: 'Days worked', value: (e: any) => e.days_worked, align: 'right' as const },
                              {
                                  label: 'Worked',
                                  value: (e: any) => csvHours(e.worked_minutes),
                                  render: (e: any) => hours(e.worked_minutes),
                                  align: 'right' as const,
                              },
                              {
                                  label: 'Overtime',
                                  value: (e: any) => csvHours(e.overtime_minutes),
                                  render: (e: any) => hours(e.overtime_minutes),
                                  align: 'right' as const,
                              },
                              { label: 'Late (min)', value: (e: any) => e.late_minutes, align: 'right' as const },
                              { label: 'Absences', value: (e: any) => e.absences, align: 'right' as const },
                              { label: 'Pending', value: (e: any) => e.pending, align: 'right' as const },
                              {
                                  label: 'Attendance',
                                  value: (e: any) => (e.attendance_rate === null ? '' : `${e.attendance_rate}%`),
                                  render: (e: any) => (e.attendance_rate === null ? '—' : `${e.attendance_rate}%`),
                                  align: 'right' as const,
                              },
                          ]
                        : []),
                ]}
            />

            <ReportTable
                title="Daily coverage"
                rows={r.daily}
                csvName={file('daily')}
                columns={[
                    {
                        label: 'Date',
                        value: (d: any) => d.date,
                        render: (d: any) => formatDay(d.date, { weekday: 'short', month: 'short', day: 'numeric' }),
                    },
                    { label: 'Shifts', value: (d: any) => d.shifts, align: 'right' },
                    {
                        label: 'Scheduled',
                        value: (d: any) => csvHours(d.scheduled_minutes),
                        render: (d: any) => hours(d.scheduled_minutes),
                        align: 'right',
                    },
                    ...(att
                        ? [
                              {
                                  label: 'Worked',
                                  value: (d: any) => csvHours(d.worked_minutes),
                                  render: (d: any) => hours(d.worked_minutes),
                                  align: 'right' as const,
                              },
                              { label: 'Absences', value: (d: any) => d.absences, align: 'right' as const },
                          ]
                        : []),
                ]}
            />
        </>
    );
}
