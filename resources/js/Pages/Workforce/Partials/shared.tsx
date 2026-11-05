import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import { formatDateTime } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { Badge, Card, EmptyState, Tone } from '@/Components/ui';
import { ReactNode } from 'react';

/** Payroll amounts are always pesos, whatever the store's sale currency. */
export const peso = (cents: number) => formatMoney(cents, 'PHP');

/** Cents as a plain amount for number inputs ("1250.5"). */
export const toAmount = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : String(cents / 100));

/** Basis points as a percentage for number inputs ("12.5"). */
export const toPercent = (bps: number | null | undefined) => (bps === null || bps === undefined ? '' : String(bps / 100));

export const FREQUENCY_LABELS: Record<string, string> = {
    weekly: 'Weekly',
    semi_monthly: 'Semi-monthly',
    monthly: 'Monthly',
};

export const PAY_TYPE_LABELS: Record<string, string> = {
    monthly: 'Monthly salary',
    daily: 'Daily rate',
    hourly: 'Hourly rate',
};

export function hours(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;

    return m ? `${h}h ${m}m` : `${h}h`;
}

/** "13:30" → "1:30 PM" */
export function time12(hhmm: string | null): string {
    if (!hhmm) {
        return '—';
    }
    const [h, m] = hhmm.split(':').map(Number);

    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** A YYYY-MM-DD date shown without time-zone drift. */
export function formatDay(ymd: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
    const [y, m, d] = ymd.split('-').map(Number);

    return new Date(y, m - 1, d).toLocaleDateString(undefined, options);
}

export function addDays(ymd: string, days: number): string {
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(y, m - 1, d + days);
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The shared form control style (see .input in app.css). */
export const inputClass = 'input mt-1';

/** Same as Components/ui Field, kept for the workforce pages' imports. */
export function Field({
    label,
    error,
    hint,
    className = '',
    children,
}: {
    label: string;
    error?: string;
    hint?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={className}>
            <InputLabel value={label} />
            {children}
            {hint && !error && <p className="help">{hint}</p>}
            <InputError message={error} className="mt-1" />
        </div>
    );
}

const BADGES: Record<string, Tone> = {
    draft: 'gray',
    published: 'green',
    cancelled: 'gray',
    pending: 'amber',
    approved: 'green',
    rejected: 'red',
    review: 'blue',
    paid: 'dark',
    active: 'green',
    inactive: 'gray',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
    return (
        <Badge tone={BADGES[status] ?? 'gray'} className={`capitalize ${status === 'cancelled' ? 'line-through' : ''}`}>
            {label ?? status.replace('_', ' ')}
        </Badge>
    );
}

export { Card, EmptyState };

export interface AuditEntry {
    id: number;
    action: string;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    reason: string | null;
    user: string | null;
    at: string | null;
}

/** Who changed what, when, and why — old and new values side by side. */
export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
    if (entries.length === 0) {
        return <p className="text-sm text-gray-500">No changes recorded yet.</p>;
    }

    const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

    return (
        <ol className="space-y-3">
            {entries.map((entry) => {
                const keys = Array.from(new Set([...Object.keys(entry.old_values ?? {}), ...Object.keys(entry.new_values ?? {})])).filter(
                    (k) => show(entry.old_values?.[k]) !== show(entry.new_values?.[k]),
                );

                return (
                    <li key={entry.id} className="rounded-xl border border-gray-200 p-3 text-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-semibold capitalize text-gray-950">{entry.action.replace('_', ' ')}</span>
                            <span className="text-xs text-gray-500">
                                {entry.user ?? 'System'}
                                {entry.at && ` · ${formatDateTime(entry.at)}`}
                            </span>
                        </div>
                        {entry.reason && <p className="mt-1 text-gray-700">“{entry.reason}”</p>}
                        {keys.length > 0 && (
                            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                                {keys.map((k) => (
                                    <div key={k} className="contents">
                                        <dt className="text-gray-500">{k.replace(/_/g, ' ')}</dt>
                                        <dd className="break-all text-gray-800">
                                            {entry.old_values && <span className="text-gray-400 line-through">{show(entry.old_values[k])}</span>}
                                            {entry.old_values && entry.new_values && ' → '}
                                            {entry.new_values && show(entry.new_values[k])}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

/** Errors keyed by field, typed loosely so nested keys ("brackets.0.min") work. */
export type FieldErrors = Record<string, string | undefined>;
