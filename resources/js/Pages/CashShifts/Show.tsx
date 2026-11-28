import PageHeader from '@/Components/PageHeader';
import { PrintableReport, useReportPrinter } from '@/Components/ReportPrint';
import { Card, CardHeader } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PAYMENT_LABELS } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { PageProps } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { ReactNode } from 'react';
import { DifferenceBadge } from './Index';

type Report = {
    sales_count: number;
    gross_cents: number;
    net_cents: number;
    by_method: Record<string, { count: number; total_cents: number }>;
    vat: { vatable_cents: number; vat_cents: number; vat_exempt_cents: number; vat_removed_cents: number };
    discounts: { senior_count: number; senior_cents: number; pwd_count: number; pwd_cents: number };
    service_charge_cents: number;
    voids: { count: number; total_cents: number };
    cash: {
        opening_cents: number;
        sales_cents: number;
        in_cents: number;
        out_cents: number;
        refunds_cents: number;
        expected_cents: number;
        counted_cents: number | null;
        difference_cents: number | null;
    };
    moves: { id: string; type: 'in' | 'out'; amount_cents: number; reason: string; at: string }[];
};

type Props = PageProps<{
    shift: { id: number; branch: string | null; terminal: string; opened_by: string | null; closed_by: string | null; opened_at: string; closed_at: string | null };
    report: Report;
}>;

function Row({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
    return (
        <div className={`flex items-center justify-between gap-4 py-2 text-sm ${strong ? 'font-semibold text-gray-950' : 'text-gray-700'}`}>
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}

/** One shift's report: sales, VAT, voids, and the cash drawer count. */
export default function CashShiftShow({ shift, report }: Props) {
    const { merchant } = usePage<PageProps>().props.auth;
    const currency = merchant?.currency ?? 'PHP';
    const money = (c: number) => formatMoney(c, currency);
    const { printReport, reportPrinter } = useReportPrinter(merchant?.receipt_paper_mm ?? 80);
    const c = report.cash;

    const printable: PrintableReport = {
        title: shift.closed_at ? 'Shift report' : 'X-reading',
        subtitle: [merchant?.name ?? '', `Register ${shift.terminal}${shift.branch ? ` · ${shift.branch}` : ''}`],
        rows: [
            { left: 'Opened', right: new Date(shift.opened_at).toLocaleString() },
            { left: 'By', right: shift.opened_by ?? '' },
            ...(shift.closed_at ? [{ left: 'Closed', right: new Date(shift.closed_at).toLocaleString() }, { left: 'By', right: shift.closed_by ?? '' }] : []),
            'divider',
            { heading: 'Sales' },
            ...Object.entries(report.by_method).map(([m, r]) => ({ left: `${PAYMENT_LABELS[m as keyof typeof PAYMENT_LABELS] ?? m} (${r.count})`, right: money(r.total_cents) })),
            { left: `Total (${report.sales_count})`, right: money(report.net_cents), bold: true },
            { left: `Voided (${report.voids.count})`, right: money(report.voids.total_cents) },
            'divider',
            { heading: 'VAT' },
            { left: 'VATable sales', right: money(report.vat.vatable_cents) },
            { left: 'VAT', right: money(report.vat.vat_cents) },
            { left: 'VAT-exempt sales', right: money(report.vat.vat_exempt_cents) },
            { left: `Senior (${report.discounts.senior_count})`, right: `-${money(report.discounts.senior_cents)}` },
            { left: `PWD (${report.discounts.pwd_count})`, right: `-${money(report.discounts.pwd_cents)}` },
            'divider',
            { heading: 'Cash drawer' },
            { left: 'Opening cash', right: money(c.opening_cents) },
            { left: 'Cash sales', right: money(c.sales_cents) },
            { left: 'Cash in', right: money(c.in_cents) },
            { left: 'Cash out', right: `-${money(c.out_cents)}` },
            { left: 'Cash refunds', right: `-${money(c.refunds_cents)}` },
            { left: 'Expected', right: money(c.expected_cents), bold: true },
            ...(c.counted_cents !== null
                ? [
                      { left: 'Counted', right: money(c.counted_cents), bold: true },
                      { left: c.difference_cents === 0 ? 'Balanced' : (c.difference_cents ?? 0) > 0 ? 'Over' : 'Short', right: money(c.difference_cents ?? 0), bold: true },
                  ]
                : []),
        ],
    };

    return (
        <AuthenticatedLayout
            header={<PageHeader title={shift.closed_at ? 'Shift report' : 'Shift (open)'} subtitle={`${shift.opened_by ?? 'Someone'} · register ${shift.terminal}${shift.branch ? ` · ${shift.branch}` : ''}`} />}
        >
            <Head title="Shift report" />

            <div className="app-page">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link href={route('cash-shifts.index')} className="btn btn-ghost btn-sm">
                        ← All shifts
                    </Link>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => printReport(printable)}>
                        Print
                    </button>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    <Card>
                        <CardHeader title="Cash drawer" actions={<DifferenceBadge cents={c.difference_cents} currency={currency} />} />
                        <div className="card-body divide-y divide-gray-100">
                            <Row label="Opening cash" value={money(c.opening_cents)} />
                            <Row label="Cash sales" value={money(c.sales_cents)} />
                            <Row label="Cash in" value={money(c.in_cents)} />
                            <Row label="Cash out" value={`-${money(c.out_cents)}`} />
                            <Row label="Cash refunds" value={`-${money(c.refunds_cents)}`} />
                            <Row label="Expected in the drawer" value={money(c.expected_cents)} strong />
                            <Row label="Counted" value={c.counted_cents === null ? 'Not closed yet' : money(c.counted_cents)} strong />
                        </div>
                    </Card>

                    <Card>
                        <CardHeader title="Sales" subtitle={`${report.sales_count} sales`} />
                        <div className="card-body divide-y divide-gray-100">
                            {Object.entries(report.by_method).map(([m, r]) => (
                                <Row key={m} label={`${PAYMENT_LABELS[m as keyof typeof PAYMENT_LABELS] ?? m} (${r.count})`} value={money(r.total_cents)} />
                            ))}
                            <Row label="Total" value={money(report.net_cents)} strong />
                            <Row label={`Voided (${report.voids.count})`} value={money(report.voids.total_cents)} />
                            <Row label="VATable sales" value={money(report.vat.vatable_cents)} />
                            <Row label="VAT" value={money(report.vat.vat_cents)} />
                            <Row label="VAT-exempt sales" value={money(report.vat.vat_exempt_cents)} />
                            <Row label={`Senior / PWD discounts (${report.discounts.senior_count + report.discounts.pwd_count})`} value={`-${money(report.discounts.senior_cents + report.discounts.pwd_cents)}`} />
                        </div>
                    </Card>

                    {report.moves.length > 0 && (
                        <Card className="lg:col-span-2">
                            <CardHeader title="Cash in and out" />
                            <div className="card-body divide-y divide-gray-100">
                                {report.moves.map((m) => (
                                    <Row
                                        key={m.id}
                                        label={`${new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${m.type === 'in' ? 'Cash in' : 'Cash out'}: ${m.reason}`}
                                        value={`${m.type === 'in' ? '+' : '-'}${money(m.amount_cents)}`}
                                    />
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            </div>
            {reportPrinter}
        </AuthenticatedLayout>
    );
}
