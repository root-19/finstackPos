import DangerButton from '@/Components/DangerButton';
import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { Alert, Badge, CardHeader, DialogLayout, Stat } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import axios from 'axios';
import { FormEventHandler, useEffect, useState } from 'react';
import { AuditEntry, AuditTrail, Card, EmptyState, Field, FieldErrors, formatDay, hours, inputClass, StatusBadge, time12 } from './Partials/shared';
import type { ShiftRow } from './Schedule';

export interface AttendanceRow {
    id: number;
    employee_id: number;
    employee: string | null;
    work_date: string;
    type: 'worked' | 'absent';
    clock_in: string | null;
    clock_out: string | null;
    clock_out_date: string | null;
    break_minutes: number;
    shift: ShiftRow | null;
    worked_minutes: number;
    overtime_minutes: number;
    late_minutes: number;
    status: 'pending' | 'approved' | 'rejected';
    source: 'clock' | 'manual';
    note: string | null;
    approved_by: string | null;
    /** Paid by a finalized payroll: no more changes. */
    locked: boolean;
}

interface Filters {
    from: string;
    to: string;
    employee: number | null;
    status: string | null;
}

type Props = {
    filters: Filters;
    records: AttendanceRow[];
    missing: ShiftRow[];
    employees: { id: number; name: string; status: string }[];
};

interface EntryDefaults {
    record?: AttendanceRow;
    employee_id?: number;
    work_date?: string;
    type?: 'worked' | 'absent';
    clock_in?: string;
    clock_out?: string;
    break_minutes?: number;
}

export default function Attendance({ filters, records, missing, employees }: PageProps<Props>) {
    const [selected, setSelected] = useState<number[]>([]);
    const [entry, setEntry] = useState<EntryDefaults | undefined>();
    const [rejecting, setRejecting] = useState(false);
    const [historyFor, setHistoryFor] = useState<AttendanceRow | null>(null);
    const pageErrors = usePage().props.errors as FieldErrors;

    useEffect(() => setSelected([]), [records]);

    const filter = (changes: Partial<Filters>) =>
        router.get(
            route('attendance.index'),
            Object.fromEntries(Object.entries({ ...filters, ...changes }).filter(([, v]) => v !== null && v !== '')),
            { preserveState: true, preserveScroll: true },
        );

    const selectable = records.filter((r) => !r.locked);
    const allSelected = selectable.length > 0 && selected.length === selectable.length;
    const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

    const approve = () => router.post(route('attendance.review'), { ids: selected, decision: 'approved' }, { preserveScroll: true });

    const totals = records
        .filter((r) => r.status !== 'rejected')
        .reduce(
            (t, r) => ({
                worked: t.worked + r.worked_minutes,
                overtime: t.overtime + r.overtime_minutes,
                late: t.late + r.late_minutes,
                absences: t.absences + (r.type === 'absent' ? 1 : 0),
            }),
            { worked: 0, overtime: 0, late: 0, absences: 0 },
        );
    const pending = records.filter((r) => r.status === 'pending').length;

    return (
        <AuthenticatedLayout header={<PageHeader title="Attendance & Timesheets" subtitle="Review clock-ins and approve hours for payroll" />}>
            <Head title="Attendance & Timesheets" />

            <div className="app-page">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4 lg:max-w-4xl">
                        <Field label="From">
                            <input type="date" className={inputClass} value={filters.from} onChange={(e) => filter({ from: e.target.value })} />
                        </Field>
                        <Field label="To">
                            <input type="date" className={inputClass} value={filters.to} onChange={(e) => filter({ to: e.target.value })} />
                        </Field>
                        <Field label="Employee">
                            <select
                                className={inputClass}
                                value={filters.employee ?? ''}
                                onChange={(e) => filter({ employee: e.target.value ? Number(e.target.value) : null })}
                            >
                                <option value="">Everyone</option>
                                {employees.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {e.name}
                                        {e.status !== 'active' ? ' (inactive)' : ''}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Status">
                            <select className={inputClass} value={filters.status ?? ''} onChange={(e) => filter({ status: e.target.value || null })}>
                                <option value="">All</option>
                                <option value="pending">Pending</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                            </select>
                        </Field>
                    </div>
                    <button type="button" onClick={() => setEntry({})} className="btn btn-primary self-start lg:self-auto">
                        <Icon name="plus" />
                        Manual entry
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
                    <Stat label="Waiting for approval" value={String(pending)} tone={pending > 0 ? 'amber' : undefined} />
                    <Stat label="Hours worked" value={hours(totals.worked)} />
                    <Stat label="Overtime" value={hours(totals.overtime)} />
                    <Stat label="Late" value={hours(totals.late)} />
                    <Stat label="Absences" value={String(totals.absences)} />
                </div>

                {pageErrors.work_date && !entry && <Alert tone="red">{pageErrors.work_date}</Alert>}

                {missing.length > 0 && (
                    <Card className="overflow-hidden">
                        <CardHeader
                            title={
                                <span className="flex items-center gap-2">
                                    <Icon name="warning" className="h-4 w-4 text-amber-600" />
                                    Shifts with no attendance
                                </span>
                            }
                            subtitle="These published shifts have ended, but nobody clocked in. Record the time or mark an absence."
                        />
                        <ul className="divide-y divide-gray-100">
                            {missing.map((s) => (
                                <li key={s.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                                    <span className="text-sm">
                                        <span className="font-medium text-gray-950">{s.employee}</span>
                                        <span className="text-gray-500">
                                            {' '}
                                            · {formatDay(s.date, { weekday: 'short', month: 'short', day: 'numeric' })} · {time12(s.start_time)}–
                                            {time12(s.end_time)}
                                        </span>
                                    </span>
                                    <span className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setEntry({
                                                    employee_id: s.employee_id,
                                                    work_date: s.date,
                                                    type: 'worked',
                                                    clock_in: s.start_time,
                                                    clock_out: s.end_time,
                                                    break_minutes: s.break_minutes,
                                                })
                                            }
                                            className="btn btn-secondary btn-sm"
                                        >
                                            Record time
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEntry({ employee_id: s.employee_id, work_date: s.date, type: 'absent' })}
                                            className="btn btn-danger btn-sm"
                                        >
                                            Mark absent
                                        </button>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                )}

                <Card className="overflow-hidden">
                    {selected.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 bg-brand-50 px-4 py-2.5 sm:px-5">
                            <span className="text-sm font-semibold text-brand-800">{selected.length} selected</span>
                            <span className="flex gap-2">
                                <button type="button" onClick={approve} className="btn btn-primary btn-sm">
                                    <Icon name="check" />
                                    Approve
                                </button>
                                <button type="button" onClick={() => setRejecting(true)} className="btn btn-danger btn-sm">
                                    Reject…
                                </button>
                            </span>
                        </div>
                    )}

                    {records.length === 0 ? (
                        <EmptyState
                            title="No attendance in this range"
                            icon={<Icon name="attendance" className="h-5 w-5" />}
                            action={
                                <button type="button" onClick={() => setEntry({})} className="btn btn-secondary">
                                    <Icon name="plus" />
                                    Manual entry
                                </button>
                            }
                        >
                            Clock-ins from My Work and manual entries appear here.
                        </EmptyState>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th className="w-10">
                                            <input
                                                type="checkbox"
                                                aria-label="Select all"
                                                checked={allSelected}
                                                onChange={() => setSelected(allSelected ? [] : selectable.map((r) => r.id))}
                                                className="checkbox"
                                            />
                                        </th>
                                        <th>Date</th>
                                        <th>Employee</th>
                                        <th>Scheduled</th>
                                        <th>In – Out</th>
                                        <th className="num">Break</th>
                                        <th className="num">Worked</th>
                                        <th className="num">OT</th>
                                        <th className="num">Late</th>
                                        <th>Status</th>
                                        <th>
                                            <span className="sr-only">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {records.map((r) => (
                                        <tr
                                            key={r.id}
                                            className={
                                                r.status === 'rejected' ? '[&>td]:!text-gray-400' : selected.includes(r.id) ? 'bg-brand-50/40' : ''
                                            }
                                        >
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Select ${r.employee} on ${r.work_date}`}
                                                    disabled={r.locked}
                                                    checked={selected.includes(r.id)}
                                                    onChange={() => toggle(r.id)}
                                                    className="checkbox disabled:opacity-30"
                                                />
                                            </td>
                                            <td className="whitespace-nowrap">
                                                {formatDay(r.work_date, { weekday: 'short', month: 'short', day: 'numeric' })}
                                            </td>
                                            <td className="whitespace-nowrap font-medium !text-gray-950">{r.employee}</td>
                                            <td className="whitespace-nowrap !text-gray-500">
                                                {r.shift ? `${time12(r.shift.start_time)}–${time12(r.shift.end_time)}` : '—'}
                                            </td>
                                            <td className="whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1.5">
                                                    {r.type === 'absent' ? (
                                                        <Badge tone="red">Absent</Badge>
                                                    ) : (
                                                        <>
                                                            <span>
                                                                {time12(r.clock_in)} –{' '}
                                                                {r.clock_out ? time12(r.clock_out) : <Badge tone="green">On shift</Badge>}
                                                            </span>
                                                            {r.clock_out_date && r.clock_out_date !== r.work_date && (
                                                                <Badge tone="gray" className="px-1.5">
                                                                    <span title="Clocked out the next day">+1 day</span>
                                                                </Badge>
                                                            )}
                                                        </>
                                                    )}
                                                    <span className="text-xs text-gray-400">{r.source === 'manual' ? 'manual' : 'clock'}</span>
                                                </span>
                                            </td>
                                            <td className="num">{r.break_minutes ? `${r.break_minutes}m` : '—'}</td>
                                            <td className="num font-medium !text-gray-950">{r.worked_minutes ? hours(r.worked_minutes) : '—'}</td>
                                            <td className="num">{r.overtime_minutes ? hours(r.overtime_minutes) : '—'}</td>
                                            <td className={`num ${r.late_minutes ? '!text-amber-700' : ''}`}>
                                                {r.late_minutes ? `${r.late_minutes}m` : '—'}
                                            </td>
                                            <td className="whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <StatusBadge status={r.status} />
                                                    {r.locked && (
                                                        <span title="Part of a finalized payroll">
                                                            <Badge tone="gray">Locked</Badge>
                                                        </span>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="whitespace-nowrap text-right">
                                                <span className="inline-flex gap-1">
                                                    {!r.locked && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEntry({ record: r })}
                                                            className="btn btn-ghost btn-sm"
                                                        >
                                                            <Icon name="pencil" />
                                                            Correct
                                                        </button>
                                                    )}
                                                    <button type="button" onClick={() => setHistoryFor(r)} className="btn btn-ghost btn-sm">
                                                        History
                                                    </button>
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>

            <EntryModal defaults={entry} employees={employees} onClose={() => setEntry(undefined)} />
            <RejectModal show={rejecting} ids={selected} onClose={() => setRejecting(false)} />
            <HistoryModal record={historyFor} onClose={() => setHistoryFor(null)} />
        </AuthenticatedLayout>
    );
}

function EntryModal({
    defaults,
    employees,
    onClose,
}: {
    defaults: EntryDefaults | undefined;
    employees: { id: number; name: string; status: string }[];
    onClose: () => void;
}) {
    const record = defaults?.record;
    const form = useForm({
        employee_id: '' as number | '',
        work_date: '',
        type: 'worked' as 'worked' | 'absent',
        clock_in: '',
        clock_out: '',
        break_minutes: 0,
        reason: '',
    });
    const errors = form.errors as FieldErrors;

    useEffect(() => {
        if (!defaults) {
            return;
        }
        form.clearErrors();
        form.setData({
            employee_id: record?.employee_id ?? defaults.employee_id ?? '',
            work_date: record?.work_date ?? defaults.work_date ?? '',
            type: record?.type ?? defaults.type ?? 'worked',
            clock_in: record?.clock_in ?? defaults.clock_in ?? '',
            clock_out: record?.clock_out ?? defaults.clock_out ?? '',
            break_minutes: record?.break_minutes ?? defaults.break_minutes ?? 0,
            reason: '',
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaults]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const options = { preserveScroll: true, onSuccess: onClose };
        if (record) {
            form.put(route('attendance.update', record.id), options);
        } else {
            form.post(route('attendance.store'), options);
        }
    };

    const worked = form.data.type === 'worked';

    return (
        <Modal show={defaults !== undefined} onClose={onClose} maxWidth="lg">
            <form onSubmit={submit}>
                <DialogLayout
                    title={record ? 'Correct attendance' : 'Manual attendance entry'}
                    description={
                        record
                            ? 'The original values are kept in the history together with your reason.'
                            : 'Manual entries are approved right away and logged with your name and reason.'
                    }
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <PrimaryButton disabled={form.processing}>{record ? 'Save correction' : 'Save entry'}</PrimaryButton>
                        </>
                    }
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Employee" error={errors.employee_id} className="sm:col-span-2">
                            <select
                                required
                                className={inputClass}
                                value={form.data.employee_id}
                                onChange={(e) => form.setData('employee_id', Number(e.target.value))}
                            >
                                <option value="" disabled>
                                    Choose…
                                </option>
                                {employees.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {e.name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Work date" error={errors.work_date}>
                            <input
                                type="date"
                                required
                                className={inputClass}
                                value={form.data.work_date}
                                onChange={(e) => form.setData('work_date', e.target.value)}
                            />
                        </Field>
                        <Field label="Type" error={errors.type}>
                            <select
                                className={inputClass}
                                value={form.data.type}
                                onChange={(e) => form.setData('type', e.target.value as 'worked' | 'absent')}
                            >
                                <option value="worked">Worked</option>
                                <option value="absent">Absent</option>
                            </select>
                        </Field>
                        {worked && (
                            <>
                                <Field label="Time in" error={errors.clock_in}>
                                    <input
                                        type="time"
                                        required
                                        className={inputClass}
                                        value={form.data.clock_in}
                                        onChange={(e) => form.setData('clock_in', e.target.value)}
                                    />
                                </Field>
                                <Field
                                    label="Time out"
                                    error={errors.clock_out}
                                    hint={
                                        form.data.clock_out && form.data.clock_out <= form.data.clock_in
                                            ? 'Overnight: counted as the next day.'
                                            : undefined
                                    }
                                >
                                    <input
                                        type="time"
                                        required
                                        className={inputClass}
                                        value={form.data.clock_out}
                                        onChange={(e) => form.setData('clock_out', e.target.value)}
                                    />
                                </Field>
                                <Field label="Unpaid break (minutes)" error={errors.break_minutes}>
                                    <input
                                        type="number"
                                        min={0}
                                        max={480}
                                        className={inputClass}
                                        value={form.data.break_minutes}
                                        onChange={(e) => form.setData('break_minutes', Number(e.target.value))}
                                    />
                                </Field>
                            </>
                        )}
                        <Field label="Reason (required)" error={errors.reason} className="sm:col-span-2">
                            <textarea
                                required
                                rows={2}
                                className={inputClass}
                                value={form.data.reason}
                                onChange={(e) => form.setData('reason', e.target.value)}
                                placeholder={
                                    record ? 'e.g. Forgot to clock out; confirmed with CCTV' : 'e.g. Phone was dead, time confirmed by supervisor'
                                }
                            />
                        </Field>
                    </div>
                </DialogLayout>
            </form>
        </Modal>
    );
}

function RejectModal({ show, ids, onClose }: { show: boolean; ids: number[]; onClose: () => void }) {
    const form = useForm({ ids: [] as number[], decision: 'rejected', reason: '' });

    useEffect(() => {
        if (show) {
            form.setData({ ids, decision: 'rejected', reason: '' });
            form.clearErrors();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        form.post(route('attendance.review'), { preserveScroll: true, onSuccess: onClose });
    };

    return (
        <Modal show={show} onClose={onClose} maxWidth="md">
            <form onSubmit={submit}>
                <DialogLayout
                    title={`Reject ${ids.length} record${ids.length === 1 ? '' : 's'}?`}
                    description="Rejected time is not paid. The employee’s record is kept with your reason."
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <DangerButton disabled={form.processing}>Reject</DangerButton>
                        </>
                    }
                >
                    <Field label="Reason" error={form.errors.reason}>
                        <textarea
                            required
                            rows={2}
                            className={inputClass}
                            value={form.data.reason}
                            onChange={(e) => form.setData('reason', e.target.value)}
                        />
                    </Field>
                </DialogLayout>
            </form>
        </Modal>
    );
}

function HistoryModal({ record, onClose }: { record: AttendanceRow | null; onClose: () => void }) {
    const [entries, setEntries] = useState<AuditEntry[] | null>(null);

    useEffect(() => {
        setEntries(null);
        if (record) {
            axios
                .get<{ history: AuditEntry[] }>(route('attendance.history', record.id))
                .then((res) => setEntries(res.data.history))
                .catch(() => setEntries([]));
        }
    }, [record]);

    return (
        <Modal show={record !== null} onClose={onClose} maxWidth="lg">
            <DialogLayout
                title="History"
                description={
                    record && (
                        <>
                            {record.employee} · {formatDay(record.work_date)}
                            {record.note && <> · Note: “{record.note}”</>}
                        </>
                    )
                }
                footer={<SecondaryButton onClick={onClose}>Close</SecondaryButton>}
            >
                {entries === null ? <p className="text-sm text-gray-500">Loading…</p> : <AuditTrail entries={entries} />}
            </DialogLayout>
        </Modal>
    );
}
