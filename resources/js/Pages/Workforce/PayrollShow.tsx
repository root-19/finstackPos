import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { Alert, CardHeader, ConfirmDialog, DialogLayout, Field, Stat } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatDateTime } from '@/lib/format';
import { PageProps } from '@/types';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { FormEventHandler, useState } from 'react';
import { Payslip, PayslipItem, PayslipLine, usePayslipPrinter } from './Partials/Payslip';
import { AuditEntry, AuditTrail, Card, FieldErrors, FREQUENCY_LABELS, formatDay, peso, StatusBadge } from './Partials/shared';

interface Run {
    id: number;
    period_start: string;
    period_end: string;
    pay_frequency: string;
    status: 'draft' | 'review' | 'approved' | 'paid';
    notes: string | null;
    gross_cents: number;
    deductions_cents: number;
    net_cents: number;
    employer_cents: number;
    approved_by: string | null;
    approved_at: string | null;
    paid_at: string | null;
}

const STEPS: { status: Run['status']; label: string }[] = [
    { status: 'draft', label: 'Draft' },
    { status: 'review', label: 'Review' },
    { status: 'approved', label: 'Approved (final)' },
    { status: 'paid', label: 'Paid' },
];

const STEP_HINTS: Record<Run['status'], string> = {
    draft: 'Amounts can still change. Add earnings or recalculate, then submit for review.',
    review: 'Check the register, then approve it or return it to draft.',
    approved: 'Final: amounts are locked and employees can see their payslips. Mark as paid once net pay is released.',
    paid: 'Net pay has been released to employees.',
};

export default function PayrollShow({ run, items, history }: PageProps<{ run: Run; items: PayslipItem[]; history: AuditEntry[] }>) {
    const [openId, setOpenId] = useState<number | null>(null);
    const [confirm, setConfirm] = useState<'approved' | 'paid' | 'delete' | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const { printPayslip, printer } = usePayslipPrinter();
    const statusError = (usePage().props.errors as FieldErrors).status;

    // Look the open payslip up by id so it refreshes after every change.
    const open = items.find((i) => i.id === openId) ?? null;
    const draft = run.status === 'draft';
    const warnings = Array.from(new Set(items.flatMap((i) => i.breakdown?.warnings ?? [])));
    const negative = items.filter((i) => i.net_cents < 0);

    const transition = (status: Run['status']) =>
        router.post(route('payroll.transition', run.id), { status }, { preserveScroll: true, onFinish: () => setConfirm(null) });
    const recalculate = () => router.post(route('payroll.recalculate', run.id), {}, { preserveScroll: true });
    const destroy = () => router.delete(route('payroll.destroy', run.id));
    const removeLine = (line: PayslipLine) => router.delete(route('payroll.earnings.destroy', [run.id, line.id]), { preserveScroll: true });

    const totalOf = (key: keyof PayslipItem) => items.reduce((s, i) => s + (i[key] as number), 0);
    const currentStep = STEPS.findIndex((s) => s.status === run.status);

    return (
        <AuthenticatedLayout
            header={
                <PageHeader
                    title="Payroll"
                    subtitle={`${formatDay(run.period_start)} – ${formatDay(run.period_end)} · ${FREQUENCY_LABELS[run.pay_frequency]}`}
                />
            }
        >
            <Head title="Payroll" />

            <div className="app-page">
                <Card>
                    <div className="card-body flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-1.5">
                            <Link
                                href={route('payroll.index')}
                                className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-950"
                            >
                                <Icon name="chevronLeft" className="h-3.5 w-3.5" />
                                All payrolls
                            </Link>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-semibold text-gray-950">
                                    {formatDay(run.period_start)} – {formatDay(run.period_end)}
                                </h2>
                                <StatusBadge status={run.status} />
                            </div>
                            <p className="text-xs text-gray-500">
                                {FREQUENCY_LABELS[run.pay_frequency]} · {items.length} {items.length === 1 ? 'employee' : 'employees'}
                                {run.approved_by && run.approved_at && (
                                    <>
                                        {' '}
                                        · Approved by {run.approved_by}, {formatDateTime(run.approved_at)}
                                    </>
                                )}
                                {run.paid_at && <> · Paid {formatDateTime(run.paid_at)}</>}
                            </p>
                            {run.notes && <p className="text-sm text-gray-600">Notes: {run.notes}</p>}
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                            <button type="button" onClick={() => setShowHistory(true)} className="btn btn-ghost">
                                History
                            </button>
                            <a href={route('payroll.export', run.id)} className="btn btn-secondary">
                                <Icon name="download" />
                                Export CSV
                            </a>
                            {draft && (
                                <>
                                    <button type="button" onClick={() => setConfirm('delete')} className="btn btn-danger">
                                        <Icon name="trash" />
                                        Delete draft
                                    </button>
                                    <button type="button" onClick={recalculate} className="btn btn-secondary">
                                        <Icon name="refresh" />
                                        Recalculate
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => transition('review')}
                                        disabled={negative.length > 0}
                                        className="btn btn-primary"
                                    >
                                        Submit for review
                                    </button>
                                </>
                            )}
                            {run.status === 'review' && (
                                <>
                                    <button type="button" onClick={() => transition('draft')} className="btn btn-secondary">
                                        Return to draft
                                    </button>
                                    <button type="button" onClick={() => setConfirm('approved')} className="btn btn-primary">
                                        <Icon name="check" />
                                        Approve
                                    </button>
                                </>
                            )}
                            {run.status === 'approved' && (
                                <button type="button" onClick={() => setConfirm('paid')} className="btn btn-primary">
                                    <Icon name="cash" />
                                    Mark as paid
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-gray-100 px-4 py-3 sm:px-5">
                        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs font-medium" aria-label="Payroll status">
                            {STEPS.map((s, i) => {
                                const done = i < currentStep;
                                const current = i === currentStep;
                                return (
                                    <li key={s.status} className="flex items-center gap-1.5" aria-current={current ? 'step' : undefined}>
                                        {i > 0 && <Icon name="chevronRight" className="h-3.5 w-3.5 text-gray-300" />}
                                        <span
                                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ring-1 ring-inset ${
                                                current
                                                    ? 'bg-brand-50 text-brand-700 ring-brand-200'
                                                    : done
                                                      ? 'bg-white text-gray-700 ring-gray-200'
                                                      : 'bg-white text-gray-400 ring-gray-100'
                                            }`}
                                        >
                                            {done && <Icon name="check" className="h-3 w-3" />}
                                            {s.label}
                                            {current && <span className="sr-only"> (current)</span>}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                        <p className="mt-2 text-xs text-gray-500">{STEP_HINTS[run.status]}</p>
                    </div>
                </Card>

                {statusError && <Alert tone="red">{statusError}</Alert>}

                {negative.length > 0 && (
                    <Alert tone="red" title="Negative net pay">
                        Net pay is negative for {negative.map((i) => i.employee).join(', ')}. Review their deductions before submitting.
                    </Alert>
                )}

                {warnings.length > 0 && (
                    <Alert tone="amber" title="Check before approving">
                        <ul className="list-disc space-y-0.5 pl-5">
                            {warnings.map((w) => (
                                <li key={w}>{w}</li>
                            ))}
                        </ul>
                        <p className="mt-2">
                            Statutory rates are settings you control in{' '}
                            <Link href={route('deductions.index')} className="font-semibold underline">
                                Deduction Settings
                            </Link>
                            . Verify them against current SSS, PhilHealth, Pag-IBIG, and BIR issuances.
                        </p>
                    </Alert>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Stat label="Gross pay" value={peso(run.gross_cents)} />
                    <Stat label="Employee deductions" value={peso(run.deductions_cents)} />
                    <Stat label="Net pay" value={peso(run.net_cents)} tone={run.net_cents < 0 ? 'red' : undefined} hint="After employee deductions" />
                    <Stat label="Employer contributions" value={peso(run.employer_cents)} hint="Paid on top; not deducted" />
                </div>

                <Card className="overflow-hidden">
                    <CardHeader title="Payroll register" subtitle="Per-employee earnings, deductions, and net pay for this period." />
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th className="num">Basic</th>
                                    <th className="num">Other earnings</th>
                                    <th className="num">Gross</th>
                                    <th className="num">SSS</th>
                                    <th className="num">PhilHealth</th>
                                    <th className="num">Pag-IBIG</th>
                                    <th className="num">Tax</th>
                                    <th className="num">Other ded.</th>
                                    <th className="num">Net pay</th>
                                    <th>
                                        <span className="sr-only">Actions</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((i) => (
                                    <tr key={i.id}>
                                        <td className="whitespace-nowrap">
                                            <p className="font-medium text-gray-950">{i.employee}</p>
                                            {i.position && <p className="text-xs text-gray-500">{i.position}</p>}
                                        </td>
                                        <td className="num whitespace-nowrap">{peso(i.basic_cents)}</td>
                                        <td className="num whitespace-nowrap">{peso(i.earnings_cents)}</td>
                                        <td className="num whitespace-nowrap font-medium text-gray-950">{peso(i.gross_cents)}</td>
                                        <td className="num whitespace-nowrap">{peso(i.sss_cents)}</td>
                                        <td className="num whitespace-nowrap">{peso(i.philhealth_cents)}</td>
                                        <td className="num whitespace-nowrap">{peso(i.pagibig_cents)}</td>
                                        <td className="num whitespace-nowrap">{peso(i.tax_cents)}</td>
                                        <td className="num whitespace-nowrap">{peso(i.other_deductions_cents)}</td>
                                        <td className={`num whitespace-nowrap font-semibold ${i.net_cents < 0 ? 'text-red-600' : 'text-gray-950'}`}>
                                            {peso(i.net_cents)}
                                        </td>
                                        <td className="whitespace-nowrap text-right">
                                            <button type="button" onClick={() => setOpenId(i.id)} className="btn btn-ghost btn-sm">
                                                Payslip
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td className="whitespace-nowrap">Total ({items.length})</td>
                                    <td className="num whitespace-nowrap">{peso(totalOf('basic_cents'))}</td>
                                    <td className="num whitespace-nowrap">{peso(totalOf('earnings_cents'))}</td>
                                    <td className="num whitespace-nowrap">{peso(totalOf('gross_cents'))}</td>
                                    <td className="num whitespace-nowrap">{peso(totalOf('sss_cents'))}</td>
                                    <td className="num whitespace-nowrap">{peso(totalOf('philhealth_cents'))}</td>
                                    <td className="num whitespace-nowrap">{peso(totalOf('pagibig_cents'))}</td>
                                    <td className="num whitespace-nowrap">{peso(totalOf('tax_cents'))}</td>
                                    <td className="num whitespace-nowrap">{peso(totalOf('other_deductions_cents'))}</td>
                                    <td className="num whitespace-nowrap">{peso(totalOf('net_cents'))}</td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Card>
            </div>

            <Modal show={open !== null} onClose={() => setOpenId(null)}>
                {open && (
                    <DialogLayout
                        title="Payslip"
                        description={open.employee}
                        footer={
                            <>
                                <SecondaryButton onClick={() => setOpenId(null)}>Close</SecondaryButton>
                                <PrimaryButton type="button" onClick={() => printPayslip(open)}>
                                    <Icon name="printer" />
                                    Print payslip
                                </PrimaryButton>
                            </>
                        }
                    >
                        <Payslip item={open} onRemoveLine={draft ? removeLine : undefined} />
                        {draft && <AddEarningForm runId={run.id} itemId={open.id} />}
                    </DialogLayout>
                )}
            </Modal>

            <Modal show={confirm === 'approved' || confirm === 'paid'} onClose={() => setConfirm(null)} maxWidth="md">
                <DialogLayout
                    title={confirm === 'paid' ? 'Mark as paid?' : 'Approve this payroll?'}
                    footer={
                        <>
                            <SecondaryButton onClick={() => setConfirm(null)}>Cancel</SecondaryButton>
                            <PrimaryButton type="button" onClick={() => confirm && confirm !== 'delete' && transition(confirm)}>
                                {confirm === 'paid' ? 'Mark as paid' : 'Approve'}
                            </PrimaryButton>
                        </>
                    }
                >
                    <p className="text-sm text-gray-600">
                        {confirm === 'paid'
                            ? `Confirm that ${peso(run.net_cents)} in net pay has been released to employees.`
                            : 'Approved payroll is final: amounts are locked, the attendance it covers can no longer change, and employees can see their payslips.'}
                    </p>
                </DialogLayout>
            </Modal>

            <ConfirmDialog
                show={confirm === 'delete'}
                title="Delete this draft?"
                confirmLabel="Delete draft"
                onConfirm={destroy}
                onClose={() => setConfirm(null)}
            >
                The draft and its payslips are removed. Attendance and salaries are not affected.
            </ConfirmDialog>

            <Modal show={showHistory} onClose={() => setShowHistory(false)} maxWidth="lg">
                <DialogLayout title="Payroll history" footer={<SecondaryButton onClick={() => setShowHistory(false)}>Close</SecondaryButton>}>
                    <AuditTrail entries={history} />
                </DialogLayout>
            </Modal>

            {printer}
        </AuthenticatedLayout>
    );
}

function AddEarningForm({ runId, itemId }: { runId: number; itemId: number }) {
    const form = useForm({ code: 'bonus', label: 'Bonus', amount: '' });
    const errors = form.errors as FieldErrors;
    const labels: Record<string, string> = { bonus: 'Bonus', commission: 'Commission', other_earning: 'Other earning' };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        form.post(route('payroll.earnings.store', [runId, itemId]), {
            preserveScroll: true,
            onSuccess: () => form.reset('amount'),
        });
    };

    return (
        <form onSubmit={submit} className="mt-5 rounded-lg border border-gray-200 bg-gray-50/60 p-4">
            <p className="text-sm font-semibold text-gray-950">Add bonus, commission, or other earning</p>
            <p className="help">Taxes and contributions are recomputed with the new amount.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr_9rem_auto] sm:items-end">
                <Field label="Type" error={errors.code} htmlFor="earning-code">
                    <select
                        id="earning-code"
                        className="input"
                        value={form.data.code}
                        onChange={(e) =>
                            form.setData((d) => ({
                                ...d,
                                code: e.target.value,
                                label: Object.values(labels).includes(d.label) || !d.label ? labels[e.target.value] : d.label,
                            }))
                        }
                    >
                        {Object.entries(labels).map(([v, l]) => (
                            <option key={v} value={v}>
                                {l}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Description" error={errors.label} required htmlFor="earning-label">
                    <input
                        id="earning-label"
                        required
                        className="input"
                        value={form.data.label}
                        onChange={(e) => form.setData('label', e.target.value)}
                    />
                </Field>
                <Field label="Amount (₱)" error={errors.amount} required htmlFor="earning-amount">
                    <input
                        id="earning-amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        className="input text-right tabular-nums"
                        value={form.data.amount}
                        onChange={(e) => form.setData('amount', e.target.value)}
                    />
                </Field>
                <PrimaryButton disabled={form.processing}>
                    <Icon name="plus" />
                    Add
                </PrimaryButton>
            </div>
        </form>
    );
}
