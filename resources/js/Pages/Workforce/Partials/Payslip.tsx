import { Icon } from '@/Components/NavIcons';
import { PageProps } from '@/types';
import { usePage } from '@inertiajs/react';
import { useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { FREQUENCY_LABELS, formatDay, hours, peso } from './shared';

export interface PayslipLine {
    id: number;
    kind: 'earning' | 'deduction' | 'employer';
    code: string;
    label: string;
    amount_cents: number;
    detail: string | null;
    manual: boolean;
}

export interface PayslipItem {
    id: number;
    employee_id: number;
    employee: string;
    position: string | null;
    period_start: string;
    period_end: string;
    basic_cents: number;
    earnings_cents: number;
    gross_cents: number;
    sss_cents: number;
    philhealth_cents: number;
    pagibig_cents: number;
    tax_cents: number;
    other_deductions_cents: number;
    deductions_cents: number;
    net_cents: number;
    employer_cents: number;
    lines: PayslipLine[];
    breakdown: {
        period?: { frequency: string };
        attendance?: Partial<Record<'days_worked' | 'regular_minutes' | 'overtime_minutes' | 'absences' | 'late_minutes', number>>;
        warnings?: string[];
    } | null;
    status?: string;
}

/**
 * One employee's payslip: earnings, deductions, net pay, and (separately) employer contributions.
 * It is also printed on A4, so it relies on borders rather than background fills, which browsers drop when printing.
 */
export function Payslip({
    item,
    onRemoveLine,
    showWarnings = true,
}: {
    item: PayslipItem;
    /** Rate-verification warnings are for the owner, not the employee. */
    showWarnings?: boolean;
    /** Shown on manual earnings while the payroll is still a draft. */
    onRemoveLine?: (line: PayslipLine) => void;
}) {
    const merchant = usePage<PageProps>().props.auth.merchant;
    const earnings = item.lines.filter((l) => l.kind === 'earning');
    const deductions = item.lines.filter((l) => l.kind === 'deduction');
    const employer = item.lines.filter((l) => l.kind === 'employer');
    const att = item.breakdown?.attendance;
    const frequency = item.breakdown?.period?.frequency;

    return (
        <div className="payslip text-sm text-gray-900">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-gray-900 pb-4">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Payslip</p>
                    <p className="text-lg font-semibold text-gray-950">{merchant?.name}</p>
                    {merchant?.address && <p className="text-xs text-gray-500">{merchant.address}</p>}
                </div>
                <div className="sm:text-right">
                    <p className="font-semibold text-gray-950">{item.employee}</p>
                    {item.position && <p className="text-xs text-gray-500">{item.position}</p>}
                    <p className="text-xs text-gray-500">
                        Pay period: {formatDay(item.period_start)} – {formatDay(item.period_end)}
                        {frequency && ` · ${FREQUENCY_LABELS[frequency]}`}
                    </p>
                </div>
            </div>

            {att && (
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-gray-200 px-3 py-2.5 text-xs sm:grid-cols-5">
                    <Metric label="Days worked" value={String(att.days_worked ?? 0)} />
                    <Metric label="Regular hours" value={hours(att.regular_minutes ?? 0)} />
                    <Metric label="Overtime" value={hours(att.overtime_minutes ?? 0)} />
                    <Metric label="Absences" value={String(att.absences ?? 0)} />
                    <Metric label="Late" value={`${att.late_minutes ?? 0}m`} />
                </dl>
            )}

            <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <Section title="Earnings" lines={earnings} total={item.gross_cents} totalLabel="Gross pay" onRemoveLine={onRemoveLine} />
                <Section title="Deductions" lines={deductions} total={item.deductions_cents} totalLabel="Total deductions" negative />
            </div>

            <div className="mt-5 flex items-baseline justify-between gap-3 border-y-2 border-gray-900 py-3">
                <span className="text-base font-semibold text-gray-950">Net pay</span>
                <span className={`text-xl font-semibold tabular-nums ${item.net_cents < 0 ? 'text-red-700' : 'text-gray-950'}`}>
                    {peso(item.net_cents)}
                </span>
            </div>

            {employer.length > 0 && (
                <div className="mt-5 rounded-lg border border-dashed border-gray-300 px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Employer contributions</p>
                    <p className="text-xs text-gray-500">
                        Paid by the employer on top of pay. Not deducted from the employee and not part of net pay.
                    </p>
                    <ul className="mt-2 space-y-1">
                        {employer.map((l) => (
                            <li key={l.id} className="flex justify-between gap-3 text-xs">
                                <span>{l.label}</span>
                                <span className="tabular-nums">{peso(l.amount_cents)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {showWarnings && (item.breakdown?.warnings?.length ?? 0) > 0 && (
                <ul className="no-print mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                    {item.breakdown!.warnings!.map((w) => (
                        <li key={w} className="flex items-start gap-1.5">
                            <Icon name="warning" className="mt-px h-3.5 w-3.5" />
                            <span>{w}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-gray-500">{label}</dt>
            <dd className="font-semibold tabular-nums text-gray-950">{value}</dd>
        </div>
    );
}

function Section({
    title,
    lines,
    total,
    totalLabel,
    negative = false,
    onRemoveLine,
}: {
    title: string;
    lines: PayslipLine[];
    total: number;
    totalLabel: string;
    negative?: boolean;
    onRemoveLine?: (line: PayslipLine) => void;
}) {
    return (
        <div>
            <p className="border-b border-gray-200 pb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
            <ul className="divide-y divide-gray-100">
                {lines.length === 0 && <li className="py-1.5 text-gray-400">None</li>}
                {lines.map((l) => (
                    <li key={l.id} className="py-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0">
                                {l.label}
                                {l.manual && onRemoveLine && (
                                    <button
                                        type="button"
                                        onClick={() => onRemoveLine(l)}
                                        aria-label={`Remove ${l.label}`}
                                        className="no-print ms-2 inline-flex items-center gap-1 rounded text-xs font-medium text-red-700 hover:underline"
                                    >
                                        <Icon name="trash" className="h-3.5 w-3.5" />
                                        Remove
                                    </button>
                                )}
                            </span>
                            <span className="shrink-0 tabular-nums">
                                {negative ? '−' : ''}
                                {peso(l.amount_cents)}
                            </span>
                        </div>
                        {l.detail && <p className="text-xs text-gray-500">{l.detail}</p>}
                    </li>
                ))}
            </ul>
            <div className="flex justify-between gap-3 border-t border-gray-300 pt-2 font-semibold text-gray-950">
                <span>{totalLabel}</span>
                <span className="tabular-nums">{peso(total)}</span>
            </div>
        </div>
    );
}

/** Prints a payslip on A4 through the same print-only portal as receipts. */
export function usePayslipPrinter(showWarnings = true) {
    const [item, setItem] = useState<PayslipItem | null>(null);

    const printPayslip = (payslip: PayslipItem) => {
        flushSync(() => setItem(payslip));
        window.print();
    };

    const printer = item
        ? createPortal(
              <div id="receipt-print">
                  <style>{'@page { size: A4; margin: 14mm; } #receipt-print .no-print { display: none; }'}</style>
                  <Payslip item={item} showWarnings={showWarnings} />
              </div>,
              document.body,
          )
        : null;

    return { printPayslip, printer };
}
