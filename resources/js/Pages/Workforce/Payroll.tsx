import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { Alert, DialogLayout, Field } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { toDateInput } from '@/lib/format';
import { PageProps } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { FormEventHandler, useEffect, useState } from 'react';
import { Card, EmptyState, FieldErrors, FREQUENCY_LABELS, formatDay, peso, StatusBadge } from './Partials/shared';

interface Run {
    id: number;
    period_start: string;
    period_end: string;
    pay_frequency: string;
    status: string;
    items_count: number;
    gross_cents: number;
    deductions_cents: number;
    net_cents: number;
    employer_cents: number;
}

interface EmployeeOption {
    id: number;
    name: string;
    pay_frequency: string | null;
    has_salary: boolean;
}

export default function Payroll({ runs, employees }: PageProps<{ runs: Run[]; employees: EmployeeOption[] }>) {
    const [creating, setCreating] = useState(false);

    const newButton = (
        <button type="button" onClick={() => setCreating(true)} className="btn btn-primary">
            <Icon name="plus" />
            New payroll
        </button>
    );

    return (
        <AuthenticatedLayout
            header={<PageHeader title="Salary & Payroll" subtitle="Compute pay from approved attendance, review, approve, and pay" />}
        >
            <Head title="Salary & Payroll" />

            <div className="app-page">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <ol className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-gray-600" aria-label="Payroll steps">
                        {['Draft', 'Review', 'Approved (final)', 'Paid'].map((s, i) => (
                            <li key={s} className="flex items-center gap-1.5">
                                {i > 0 && <Icon name="chevronRight" className="h-3.5 w-3.5 text-gray-400" />}
                                <span className="rounded-md bg-white px-2 py-0.5 ring-1 ring-inset ring-gray-200">{s}</span>
                            </li>
                        ))}
                    </ol>
                    <div className="flex flex-wrap gap-2">{newButton}</div>
                </div>

                <Card className="overflow-hidden">
                    {runs.length === 0 ? (
                        <EmptyState title="No payroll runs yet" icon={<Icon name="payroll" className="h-5 w-5" />} action={newButton}>
                            Set each employee’s salary in the Employee List, approve their attendance, then create a payroll.
                        </EmptyState>
                    ) : (
                        <>
                            {/* Phones: one row per run instead of an 8-column table. */}
                            <ul className="divide-y divide-gray-100 md:hidden">
                                {runs.map((r) => (
                                    <li key={r.id}>
                                        <Link href={route('payroll.show', r.id)} className="block px-4 py-3 hover:bg-gray-50">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="min-w-0 text-sm font-semibold text-gray-950">
                                                    {formatDay(r.period_start)} – {formatDay(r.period_end)}
                                                </p>
                                                <StatusBadge status={r.status} />
                                            </div>
                                            <div className="mt-1 flex items-end justify-between gap-3 text-xs text-gray-500">
                                                <span>
                                                    {FREQUENCY_LABELS[r.pay_frequency]} · {r.items_count}{' '}
                                                    {r.items_count === 1 ? 'employee' : 'employees'}
                                                </span>
                                                <span className="text-right">
                                                    <span className="block">Net pay</span>
                                                    <span className="text-sm font-semibold tabular-nums text-gray-950">{peso(r.net_cents)}</span>
                                                </span>
                                            </div>
                                        </Link>
                                    </li>
                                ))}
                            </ul>

                            <div className="hidden overflow-x-auto md:block">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Pay period</th>
                                            <th>Frequency</th>
                                            <th className="num">Employees</th>
                                            <th className="num">Gross</th>
                                            <th className="num">Deductions</th>
                                            <th className="num">Net pay</th>
                                            <th className="num">Employer share</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {runs.map((r) => (
                                            <tr key={r.id}>
                                                <td className="whitespace-nowrap">
                                                    <Link
                                                        href={route('payroll.show', r.id)}
                                                        className="font-semibold text-gray-950 hover:text-brand-700 hover:underline"
                                                    >
                                                        {formatDay(r.period_start)} – {formatDay(r.period_end)}
                                                    </Link>
                                                </td>
                                                <td>{FREQUENCY_LABELS[r.pay_frequency]}</td>
                                                <td className="num">{r.items_count}</td>
                                                <td className="num whitespace-nowrap">{peso(r.gross_cents)}</td>
                                                <td className="num whitespace-nowrap">{peso(r.deductions_cents)}</td>
                                                <td className="num whitespace-nowrap font-semibold text-gray-950">{peso(r.net_cents)}</td>
                                                <td className="num whitespace-nowrap text-gray-500">{peso(r.employer_cents)}</td>
                                                <td>
                                                    <StatusBadge status={r.status} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </Card>
            </div>

            <CreateModal show={creating} employees={employees} onClose={() => setCreating(false)} />
        </AuthenticatedLayout>
    );
}

/** The current half-month (1–15 or 16–end), the usual semi-monthly cut-off. */
function currentHalf(): [string, string] {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    return now.getDate() <= 15
        ? [toDateInput(new Date(y, m, 1)), toDateInput(new Date(y, m, 15))]
        : [toDateInput(new Date(y, m, 16)), toDateInput(new Date(y, m + 1, 0))];
}

function CreateModal({ show, employees, onClose }: { show: boolean; employees: EmployeeOption[]; onClose: () => void }) {
    const [start, end] = currentHalf();
    const form = useForm({
        period_start: start,
        period_end: end,
        pay_frequency: 'semi_monthly',
        employee_ids: [] as number[],
        notes: '',
    });
    const errors = form.errors as FieldErrors;
    const eligible = (frequency: string) => employees.filter((e) => e.has_salary && e.pay_frequency === frequency).map((e) => e.id);

    useEffect(() => {
        if (show) {
            form.clearErrors();
            form.setData((d) => ({ ...d, employee_ids: eligible(d.pay_frequency) }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show]);

    const setFrequency = (frequency: string) => {
        const now = new Date();
        const [s, e] =
            frequency === 'semi_monthly'
                ? currentHalf()
                : frequency === 'monthly'
                  ? [toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)), toDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0))]
                  : (() => {
                        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
                        return [toDateInput(monday), toDateInput(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6))];
                    })();
        form.setData({ ...form.data, pay_frequency: frequency, period_start: s, period_end: e, employee_ids: eligible(frequency) });
    };

    const toggle = (id: number) =>
        form.setData(
            'employee_ids',
            form.data.employee_ids.includes(id) ? form.data.employee_ids.filter((x) => x !== id) : [...form.data.employee_ids, id],
        );

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        form.post(route('payroll.store'), { onSuccess: onClose });
    };

    return (
        <Modal show={show} onClose={onClose} maxWidth="lg">
            <form onSubmit={submit}>
                <DialogLayout
                    title="New payroll"
                    description="Pay is computed from salaries in effect and approved attendance. It starts as a draft you can review and recalculate."
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <PrimaryButton disabled={form.processing || form.data.employee_ids.length === 0}>Create draft</PrimaryButton>
                        </>
                    }
                >
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <Field label="Frequency" error={errors.pay_frequency} htmlFor="payroll-frequency">
                                <select
                                    id="payroll-frequency"
                                    className="input"
                                    value={form.data.pay_frequency}
                                    onChange={(e) => setFrequency(e.target.value)}
                                >
                                    {Object.entries(FREQUENCY_LABELS).map(([v, l]) => (
                                        <option key={v} value={v}>
                                            {l}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Period start" error={errors.period_start} required htmlFor="payroll-start">
                                <input
                                    id="payroll-start"
                                    type="date"
                                    required
                                    className="input"
                                    value={form.data.period_start}
                                    onChange={(e) => form.setData('period_start', e.target.value)}
                                />
                            </Field>
                            <Field label="Period end" error={errors.period_end} required htmlFor="payroll-end">
                                <input
                                    id="payroll-end"
                                    type="date"
                                    required
                                    className="input"
                                    value={form.data.period_end}
                                    onChange={(e) => form.setData('period_end', e.target.value)}
                                />
                            </Field>
                        </div>

                        <div>
                            <div className="flex items-center justify-between gap-2">
                                <p className="label">
                                    Employees <span className="font-normal text-gray-500">· {form.data.employee_ids.length} selected</span>
                                </p>
                                <button
                                    type="button"
                                    onClick={() =>
                                        form.setData(
                                            'employee_ids',
                                            form.data.employee_ids.length ? [] : employees.filter((e) => e.has_salary).map((e) => e.id),
                                        )
                                    }
                                    className="btn btn-ghost btn-sm"
                                >
                                    {form.data.employee_ids.length ? 'Clear' : 'Select all with salary'}
                                </button>
                            </div>
                            <ul className="mt-1 max-h-60 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                                {employees.map((e) => (
                                    <li key={e.id}>
                                        <label
                                            className={`flex items-center gap-3 px-3 py-2.5 text-sm ${e.has_salary ? 'cursor-pointer hover:bg-gray-50' : 'cursor-not-allowed opacity-60'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                disabled={!e.has_salary}
                                                checked={form.data.employee_ids.includes(e.id)}
                                                onChange={() => toggle(e.id)}
                                                className="checkbox"
                                            />
                                            <span className="min-w-0 flex-1 truncate font-medium text-gray-950">{e.name}</span>
                                            <span className="shrink-0 text-xs text-gray-500">
                                                {e.has_salary ? FREQUENCY_LABELS[e.pay_frequency ?? ''] : 'No salary set'}
                                            </span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                            {(errors.employee_ids || errors['employee_ids.0']) && (
                                <Alert tone="red" className="mt-2">
                                    {errors.employee_ids ?? errors['employee_ids.0']}
                                </Alert>
                            )}
                        </div>

                        <Field label="Notes (optional)" error={errors.notes} htmlFor="payroll-notes">
                            <input
                                id="payroll-notes"
                                className="input"
                                value={form.data.notes}
                                onChange={(e) => form.setData('notes', e.target.value)}
                            />
                        </Field>
                    </div>
                </DialogLayout>
            </form>
        </Modal>
    );
}
