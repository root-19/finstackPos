import Modal from '@/Components/Modal';
import { PrintableReport } from '@/Components/ReportPrint';
import TextInput from '@/Components/TextInput';
import { Alert, Badge, DialogLayout, Field } from '@/Components/ui';
import { LocalShift } from '@/lib/db';
import { PAYMENT_LABELS } from '@/lib/format';
import { formatMoney, parseMoney } from '@/lib/money';
import { ServerShiftReport, ShiftSummary } from '@/lib/shifts';
import { MerchantSettings } from '@/types';
import { FormEvent, ReactNode, useState } from 'react';

/*
 * The register's cash shift screens: open (required before selling), the
 * shift panel (X-reading, cash in / cash out), and the blind-count close.
 */

type Money = (cents: number) => string;

function Row({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
    return (
        <div className={`flex items-center justify-between gap-4 py-1.5 ${strong ? 'font-semibold text-gray-950' : 'text-gray-700'}`}>
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}

export function OpenShiftModal({ show, userName, money, onOpen }: { show: boolean; userName: string; money: Money; onOpen: (cents: number) => Promise<void> }) {
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);
    const cents = parseMoney(value);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (cents === null) return;
        setBusy(true);
        try {
            await onOpen(cents);
            setValue('');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal show={show} closeable={false} onClose={() => {}} maxWidth="md">
            <form onSubmit={submit}>
                <DialogLayout
                    title="Open your shift"
                    description={`Hi ${userName}! Count the cash in the drawer before your first sale.`}
                    footer={
                        <>
                            <a href={route('dashboard')} className="btn btn-ghost mr-auto">
                                Back to dashboard
                            </a>
                            <button type="submit" className="btn btn-primary" disabled={busy || cents === null}>
                                Open shift
                            </button>
                        </>
                    }
                >
                    <Field label="Cash in the drawer (opening float)" htmlFor="opening_cash" hint="Type 0 if the drawer is empty.">
                        <TextInput id="opening_cash" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0.00" autoFocus />
                    </Field>
                    {cents !== null && <p className="mt-2 text-sm text-gray-600">Opening with {money(cents)}.</p>}
                    <p className="mt-3 text-xs text-gray-500">Works offline too: the shift uploads with your sales when you’re back online.</p>
                </DialogLayout>
            </form>
        </Modal>
    );
}

export function CashMoveModal({ type, money, onClose, onSave }: { type: 'in' | 'out' | null; money: Money; onClose: () => void; onSave: (cents: number, reason: string) => Promise<void> }) {
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const cents = parseMoney(amount);
    const valid = cents !== null && cents > 0 && reason.trim().length > 0;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!valid || cents === null) return;
        await onSave(cents, reason);
        setAmount('');
        setReason('');
    };

    return (
        <Modal show={type !== null} onClose={onClose} maxWidth="md">
            <form onSubmit={submit}>
                <DialogLayout
                    title={type === 'in' ? 'Cash in' : 'Cash out'}
                    description={type === 'in' ? 'Money added to the drawer, e.g. extra change.' : 'Money taken from the drawer, e.g. paying a delivery.'}
                    footer={
                        <>
                            <button type="button" className="btn btn-secondary" onClick={onClose}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={!valid}>
                                Save {cents ? money(cents) : ''}
                            </button>
                        </>
                    }
                >
                    <div className="space-y-3">
                        <Field label="Amount" htmlFor="move_amount">
                            <TextInput id="move_amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" autoFocus />
                        </Field>
                        <Field label="Reason" htmlFor="move_reason">
                            <TextInput
                                id="move_reason"
                                value={reason}
                                maxLength={120}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder={type === 'in' ? 'Coins for change' : 'Ice delivery'}
                            />
                        </Field>
                    </div>
                </DialogLayout>
            </form>
        </Modal>
    );
}

export function ShiftPanel({
    show,
    shift,
    summary,
    money,
    onClose,
    onMove,
    onPrint,
    onCloseShift,
}: {
    show: boolean;
    shift: LocalShift | null;
    summary: ShiftSummary | null;
    money: Money;
    onClose: () => void;
    onMove: (type: 'in' | 'out') => void;
    onPrint: () => void;
    onCloseShift: () => void;
}) {
    if (!shift || !summary) return null;

    return (
        <Modal show={show} onClose={onClose} maxWidth="lg">
            <DialogLayout
                title="Shift"
                description={`Opened by ${shift.opened_by_name} at ${new Date(shift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary mr-auto" onClick={onPrint}>
                            Print X-reading
                        </button>
                        <button type="button" className="btn btn-primary" onClick={onCloseShift}>
                            Close shift
                        </button>
                    </>
                }
            >
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMove('in')}>
                        + Cash in
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMove('out')}>
                        − Cash out
                    </button>
                    {shift.sync_status === 'pending' && <Badge tone="amber">Not uploaded yet</Badge>}
                </div>

                <div className="mt-4 divide-y divide-gray-100 text-sm">
                    <Row label="Sales" value={summary.salesCount} />
                    {Object.entries(summary.byMethod).map(([method, row]) => (
                        <Row key={method} label={`${PAYMENT_LABELS[method as keyof typeof PAYMENT_LABELS] ?? method} (${row.count})`} value={money(row.totalCents)} />
                    ))}
                    <Row label="Total sales" value={money(summary.netCents)} strong />
                    {summary.discounts.senior + summary.discounts.pwd > 0 && (
                        <Row label={`Senior / PWD discounts (${summary.discounts.senior + summary.discounts.pwd})`} value={`-${money(summary.discounts.discountCents)}`} />
                    )}
                    <Row label="Opening cash" value={money(summary.cash.openingCents)} />
                    {shift.cash_moves.map((m) => (
                        <Row key={m.id} label={`${m.type === 'in' ? 'Cash in' : 'Cash out'}: ${m.reason}`} value={`${m.type === 'in' ? '+' : '−'}${money(m.amount_cents)}`} />
                    ))}
                </div>
                <p className="mt-3 text-xs text-gray-500">
                    From the sales on this register. Voids and cash refunds are counted in the shift report once it uploads.
                </p>
            </DialogLayout>
        </Modal>
    );
}

export function CloseShiftModal({
    show,
    money,
    expectedCents,
    server,
    closing,
    onCount,
    onPrint,
    onDone,
    onCancel,
}: {
    show: boolean;
    money: Money;
    /** null until counted: the cashier counts blind. */
    expectedCents: number | null;
    server: ServerShiftReport | null;
    closing: { counted: number } | null;
    onCount: (cents: number) => Promise<void>;
    onPrint: () => void;
    onDone: () => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState('');
    const cents = parseMoney(value);

    if (!closing) {
        return (
            <Modal show={show} onClose={onCancel} maxWidth="md">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (cents !== null) void onCount(cents).then(() => setValue(''));
                    }}
                >
                    <DialogLayout
                        title="Close shift: count the drawer"
                        description="Count all the cash in the drawer and type the total. You’ll see if it’s over or short after you save."
                        footer={
                            <>
                                <button type="button" className="btn btn-secondary" onClick={onCancel}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={cents === null}>
                                    Close shift
                                </button>
                            </>
                        }
                    >
                        <Field label="Cash counted" htmlFor="counted_cash">
                            <TextInput id="counted_cash" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0.00" autoFocus />
                        </Field>
                    </DialogLayout>
                </form>
            </Modal>
        );
    }

    const expected = server?.cash.expected_cents ?? expectedCents ?? 0;
    const diff = closing.counted - expected;

    return (
        <Modal show={show} closeable={false} onClose={() => {}} maxWidth="md">
            <DialogLayout
                title="Shift closed"
                footer={
                    <>
                        <button type="button" className="btn btn-secondary mr-auto" onClick={onPrint}>
                            Print shift report
                        </button>
                        <button type="button" className="btn btn-primary" onClick={onDone}>
                            Done
                        </button>
                    </>
                }
            >
                <div className="divide-y divide-gray-100 text-sm">
                    <Row label="Cash expected in the drawer" value={money(expected)} />
                    <Row label="Cash counted" value={money(closing.counted)} />
                    <Row
                        label={diff === 0 ? 'Balanced' : diff > 0 ? 'Over' : 'Short'}
                        value={<span className={diff === 0 ? 'text-green-700' : diff > 0 ? 'text-blue-700' : 'text-red-700'}>{(diff > 0 ? '+' : '') + money(diff)}</span>}
                        strong
                    />
                </div>
                {server ? (
                    server.cash.refunds_cents > 0 || server.voids.count > 0 ? (
                        <p className="mt-3 text-xs text-gray-500">Includes voids and {money(server.cash.refunds_cents)} in cash refunds from the server.</p>
                    ) : null
                ) : (
                    <Alert tone="amber" className="mt-3">
                        Worked out on this register. The final figures, with any voids or cash refunds, are in Shifts once it uploads.
                    </Alert>
                )}
            </DialogLayout>
        </Modal>
    );
}

/** The X-reading or shift report as printable rows. */
export function shiftReport(
    kind: 'x' | 'close',
    shift: LocalShift,
    summary: ShiftSummary,
    merchant: Pick<MerchantSettings, 'name'>,
    money: Money,
    close?: { counted: number; expected: number },
): PrintableReport {
    const rows: PrintableReport['rows'] = [
        { left: 'Opened', right: new Date(shift.opened_at).toLocaleString() },
        { left: 'By', right: shift.opened_by_name },
        ...(shift.closed_at ? [{ left: 'Closed', right: new Date(shift.closed_at).toLocaleString() }] : []),
        'divider',
        { heading: 'Sales' },
        ...Object.entries(summary.byMethod).map(([method, row]) => ({
            left: `${PAYMENT_LABELS[method as keyof typeof PAYMENT_LABELS] ?? method} (${row.count})`,
            right: money(row.totalCents),
        })),
        { left: `Total (${summary.salesCount})`, right: money(summary.netCents), bold: true },
        ...(summary.discounts.senior + summary.discounts.pwd > 0
            ? [{ left: `Senior/PWD discounts (${summary.discounts.senior + summary.discounts.pwd})`, right: `-${money(summary.discounts.discountCents)}` }]
            : []),
        'divider',
        { heading: 'Cash drawer' },
        { left: 'Opening cash', right: money(summary.cash.openingCents) },
        { left: 'Cash sales', right: money(summary.cash.salesCents) },
        ...shift.cash_moves.map((m) => ({ left: `${m.type === 'in' ? 'In' : 'Out'}: ${m.reason}`, right: `${m.type === 'in' ? '+' : '-'}${money(m.amount_cents)}` })),
    ];
    if (close) {
        const diff = close.counted - close.expected;
        rows.push(
            { left: 'Expected', right: money(close.expected), bold: true },
            { left: 'Counted', right: money(close.counted), bold: true },
            { left: diff === 0 ? 'Balanced' : diff > 0 ? 'Over' : 'Short', right: (diff > 0 ? '+' : '') + money(diff), bold: true },
        );
    }

    return { title: kind === 'x' ? 'X-reading' : 'Shift report', subtitle: [merchant.name, `Register ${shift.terminal}`], rows };
}

export const shiftMoney = (currency: string): Money => (cents) => formatMoney(cents, currency);
