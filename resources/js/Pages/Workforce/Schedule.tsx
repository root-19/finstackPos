import DangerButton from '@/Components/DangerButton';
import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { DialogLayout, Segmented } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { FormEventHandler, useEffect, useMemo, useState } from 'react';
import ScheduleGeneratorModal, { GeneratorSettings, mondayOf } from './Partials/ScheduleGenerator';
import { addDays, Card, EmptyState, Field, FieldErrors, formatDay, hours, inputClass, StatusBadge, time12 } from './Partials/shared';

export interface ShiftRow {
    id: number;
    employee_id: number;
    employee: string | null;
    date: string;
    start_time: string;
    end_time: string;
    overnight: boolean;
    break_minutes: number;
    net_minutes: number;
    position: string | null;
    notes: string | null;
    status: 'draft' | 'published' | 'cancelled';
    series_id: string | null;
}

interface EmployeeOption {
    id: number;
    name: string;
    position: string | null;
}

type View = 'day' | 'week' | 'month';

type Props = {
    view: View;
    date: string;
    range: { from: string; to: string };
    today: string;
    shifts: ShiftRow[];
    employees: EmployeeOption[];
    generatorSettings: GeneratorSettings;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Chip colors by status: published solid, draft dashed, cancelled struck through. */
const CHIP_STYLES: Record<ShiftRow['status'], string> = {
    published: 'bg-brand-600 text-white hover:bg-brand-700',
    draft: 'border border-dashed border-gray-400 bg-white text-gray-800 hover:border-gray-600 hover:bg-gray-50',
    cancelled: 'bg-gray-100 text-gray-400 line-through',
};

/** Dates from..to inclusive. */
function daysBetween(from: string, to: string): string[] {
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
        out.push(d);
    }

    return out;
}

function weekdayOf(ymd: string): number {
    const [y, m, d] = ymd.split('-').map(Number);

    return new Date(y, m - 1, d).getDay();
}

/** "+1" marker for a shift that ends the next day. */
function NextDay() {
    return (
        <span
            className="ms-1 inline-block rounded px-0.5 text-[11px] font-semibold leading-none opacity-80 ring-1 ring-inset ring-current"
            title="Ends the next day"
        >
            +1<span className="sr-only"> (ends the next day)</span>
        </span>
    );
}

export default function Schedule({ view, date, range, today, shifts, employees, generatorSettings }: PageProps<Props>) {
    const [generating, setGenerating] = useState(false);
    // undefined: closed; object: new shift defaults or the shift being edited
    const [editing, setEditing] = useState<{ shift?: ShiftRow; employeeId?: number; date?: string } | undefined>();
    const [showCancelled, setShowCancelled] = useState(false);

    const visible = showCancelled ? shifts : shifts.filter((s) => s.status !== 'cancelled');
    const drafts = shifts.filter((s) => s.status === 'draft').length;

    const go = (params: { view?: View; date?: string }) =>
        router.get(route('shifts.index'), { view, date, ...params }, { preserveState: true, preserveScroll: true });

    const step = (dir: 1 | -1) => {
        if (view === 'day') {
            go({ date: addDays(date, dir) });
        } else if (view === 'week') {
            go({ date: addDays(date, 7 * dir) });
        } else {
            const [y, m] = date.split('-').map(Number);
            const next = new Date(y, m - 1 + dir, 1);
            go({ date: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01` });
        }
    };

    const title =
        view === 'day'
            ? formatDay(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
            : view === 'week'
              ? `${formatDay(range.from, { month: 'short', day: 'numeric' })} – ${formatDay(range.to, { month: 'short', day: 'numeric', year: 'numeric' })}`
              : formatDay(date, { month: 'long', year: 'numeric' });

    const publish = () => router.post(route('shifts.publish'), { from: range.from, to: range.to }, { preserveScroll: true });

    return (
        <AuthenticatedLayout header={<PageHeader title="Employee Scheduling" subtitle="Plan shifts, then publish them to your team" />}>
            <Head title="Employee Scheduling" />

            <div className="app-page">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <Segmented
                            label="Calendar view"
                            value={view}
                            onChange={(v) => go({ view: v })}
                            options={[
                                { value: 'day', label: 'Day' },
                                { value: 'week', label: 'Week' },
                                { value: 'month', label: 'Month' },
                            ]}
                        />
                        <div className="inline-flex items-center gap-1">
                            <button type="button" onClick={() => step(-1)} aria-label="Previous" className="btn btn-secondary btn-icon">
                                <Icon name="chevronLeft" />
                            </button>
                            <button type="button" onClick={() => go({ date: today })} className="btn btn-secondary">
                                Today
                            </button>
                            <button type="button" onClick={() => step(1)} aria-label="Next" className="btn btn-secondary btn-icon">
                                <Icon name="chevronRight" />
                            </button>
                        </div>
                        <h2 className="text-sm font-semibold text-gray-950 sm:text-base">{title}</h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <label className="me-1 flex items-center gap-2 text-sm text-gray-600">
                            <input
                                type="checkbox"
                                checked={showCancelled}
                                onChange={(e) => setShowCancelled(e.target.checked)}
                                className="checkbox"
                            />
                            Show cancelled
                        </label>
                        <button type="button" onClick={publish} disabled={drafts === 0} className="btn btn-secondary">
                            <Icon name="check" />
                            Publish {drafts > 0 ? `${drafts} draft${drafts === 1 ? '' : 's'}` : 'drafts'}
                        </button>
                        <button type="button" onClick={() => setGenerating(true)} disabled={employees.length === 0} className="btn btn-secondary">
                            <Icon name="schedule" />
                            Auto-generate
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                setEditing({ date: view === 'day' ? date : today >= range.from && today <= range.to ? today : range.from })
                            }
                            disabled={employees.length === 0}
                            className="btn btn-primary"
                        >
                            <Icon name="plus" />
                            Add shift
                        </button>
                    </div>
                </div>

                {employees.length === 0 ? (
                    <Card>
                        <EmptyState title="No active employees to schedule" icon={<Icon name="schedule" className="h-5 w-5" />}>
                            The store owner adds employees in the Employee List first.
                        </EmptyState>
                    </Card>
                ) : view === 'week' ? (
                    <WeekRoster
                        days={daysBetween(range.from, range.to)}
                        today={today}
                        shifts={visible}
                        employees={employees}
                        onAdd={(employeeId, d) => setEditing({ employeeId, date: d })}
                        onEdit={(shift) => setEditing({ shift })}
                    />
                ) : view === 'day' ? (
                    <DayTimeline date={date} shifts={visible} onEdit={(shift) => setEditing({ shift })} />
                ) : (
                    <MonthGrid
                        days={daysBetween(range.from, range.to)}
                        month={date.slice(0, 7)}
                        today={today}
                        shifts={visible}
                        onOpenDay={(d) => go({ view: 'day', date: d })}
                        onEdit={(shift) => setEditing({ shift })}
                    />
                )}

                <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm bg-brand-600" /> Published
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm border border-dashed border-gray-400 bg-white" /> Draft (only managers see it)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="rounded-sm bg-gray-100 px-1 text-[11px] text-gray-400 line-through">9 AM</span> Cancelled
                    </span>
                    <span className="inline-flex items-center gap-1 text-gray-600">
                        <NextDay /> ends the next day
                    </span>
                    <span>Times are in the store’s time zone.</span>
                </p>
            </div>

            <ScheduleGeneratorModal
                show={generating}
                weekStart={mondayOf(view === 'month' ? (today.slice(0, 7) === date.slice(0, 7) ? today : date) : date)}
                employees={employees}
                defaults={generatorSettings}
                onClose={() => setGenerating(false)}
            />

            <ShiftModal state={editing} employees={employees} onClose={() => setEditing(undefined)} />
        </AuthenticatedLayout>
    );
}

function ShiftChip({ shift, onClick, compact = false }: { shift: ShiftRow; onClick: () => void; compact?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={`${shift.employee ?? ''} ${time12(shift.start_time)}–${time12(shift.end_time)}${shift.notes ? ` · ${shift.notes}` : ''}`}
            className={`block w-full rounded-md px-2 py-1 text-left text-xs font-medium leading-snug transition-colors ${CHIP_STYLES[shift.status]}`}
        >
            {compact && <span className="block truncate font-semibold">{shift.employee}</span>}
            {/* Wraps between start and end in narrow columns instead of cutting the time off. */}
            <span className={`block ${compact ? 'opacity-90' : 'font-semibold'}`}>
                <span className="whitespace-nowrap">{time12(shift.start_time)}–</span>
                <span className="whitespace-nowrap">
                    {time12(shift.end_time)}
                    {shift.overnight && <NextDay />}
                </span>
            </span>
            {!compact && shift.position && <span className="block truncate opacity-80">{shift.position}</span>}
        </button>
    );
}

function WeekRoster({
    days,
    today,
    shifts,
    employees,
    onAdd,
    onEdit,
}: {
    days: string[];
    today: string;
    shifts: ShiftRow[];
    employees: EmployeeOption[];
    onAdd: (employeeId: number, date: string) => void;
    onEdit: (shift: ShiftRow) => void;
}) {
    // Employees no longer active still show if they have shifts this week.
    const rows = useMemo(() => {
        const list = [...employees];
        shifts.forEach((s) => {
            if (!list.some((e) => e.id === s.employee_id)) {
                list.push({ id: s.employee_id, name: s.employee ?? 'Former employee', position: null });
            }
        });

        return list;
    }, [employees, shifts]);

    const cell = (employeeId: number, day: string) => shifts.filter((s) => s.employee_id === employeeId && s.date === day);

    return (
        <Card className="overflow-hidden">
            {/* The roster scrolls sideways inside its card on small screens; the name column stays put. */}
            <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] table-fixed border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-gray-200 bg-gray-50/80">
                            <th className="sticky left-0 z-10 w-40 border-r border-gray-100 bg-gray-50 px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 lg:w-48">
                                Employee
                            </th>
                            {days.map((d) => (
                                <th
                                    key={d}
                                    className={`px-1.5 py-2 text-center text-xs font-medium ${d === today ? 'bg-brand-50/60 text-brand-700' : 'text-gray-500'}`}
                                >
                                    <span className="block uppercase tracking-wide">{WEEKDAYS[weekdayOf(d)]}</span>
                                    <span
                                        className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                                            d === today ? 'bg-brand-600 text-white' : 'text-gray-950'
                                        }`}
                                    >
                                        {Number(d.slice(8))}
                                    </span>
                                </th>
                            ))}
                            <th className="w-20 px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Hours</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.map((e) => {
                            const total = shifts
                                .filter((s) => s.employee_id === e.id && s.status !== 'cancelled')
                                .reduce((sum, s) => sum + s.net_minutes, 0);

                            return (
                                <tr key={e.id} className="align-top">
                                    <td className="sticky left-0 z-10 border-r border-gray-100 bg-white px-4 py-2.5">
                                        <p className="truncate font-medium text-gray-950">{e.name}</p>
                                        {e.position && <p className="truncate text-xs text-gray-500">{e.position}</p>}
                                    </td>
                                    {days.map((d) => {
                                        const items = cell(e.id, d);
                                        const active = employees.some((x) => x.id === e.id);

                                        return (
                                            <td key={d} className={`group px-1 py-1.5 ${d === today ? 'bg-brand-50/30' : ''}`}>
                                                <div className="space-y-1">
                                                    {items.map((s) => (
                                                        <ShiftChip key={s.id} shift={s} onClick={() => onEdit(s)} />
                                                    ))}
                                                    {active && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onAdd(e.id, d)}
                                                            aria-label={`Add a shift for ${e.name} on ${formatDay(d)}`}
                                                            className={`flex h-8 w-full items-center justify-center rounded-md border border-dashed border-transparent text-gray-400 transition hover:border-gray-300 hover:bg-gray-50 hover:text-brand-700 focus:opacity-100 ${
                                                                items.length
                                                                    ? 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100'
                                                                    : ''
                                                            }`}
                                                        >
                                                            <Icon name="plus" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-gray-950">{total ? hours(total) : '—'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

function DayTimeline({ date, shifts, onEdit }: { date: string; shifts: ShiftRow[]; onEdit: (shift: ShiftRow) => void }) {
    const minutes = (hhmm: string) => {
        const [h, m] = hhmm.split(':').map(Number);

        return h * 60 + m;
    };
    // Shifts starting today, plus overnight ones from yesterday that run into today.
    const items = shifts.filter((s) => s.date === date || (s.overnight && s.date === addDays(date, -1)));

    if (items.length === 0) {
        return (
            <Card>
                <EmptyState title="No shifts on this day" icon={<Icon name="schedule" className="h-5 w-5" />} />
            </Card>
        );
    }

    return (
        <Card className="p-4 sm:p-5">
            <div className="hidden grid-cols-[repeat(12,1fr)] border-b border-gray-100 pb-1.5 text-[12px] text-gray-400 sm:ml-48 sm:grid">
                {Array.from({ length: 12 }, (_, i) => (
                    <span key={i}>{time12(`${String(i * 2).padStart(2, '0')}:00`).replace(':00', '')}</span>
                ))}
            </div>
            <ul className="mt-3 space-y-3 sm:space-y-2">
                {items.map((s) => {
                    const fromYesterday = s.date !== date;
                    const start = fromYesterday ? 0 : minutes(s.start_time);
                    const end = s.overnight && !fromYesterday ? 1440 : minutes(s.end_time);

                    return (
                        <li key={s.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-0">
                            <div className="w-48 shrink-0 sm:pe-3">
                                <p className="truncate text-sm font-medium text-gray-950">{s.employee}</p>
                                <p className="text-xs text-gray-500">
                                    {time12(s.start_time)}–{time12(s.end_time)}
                                    {s.overnight && <NextDay />} · {hours(s.net_minutes)} paid
                                </p>
                            </div>
                            <div className="relative h-11 flex-1 rounded-lg bg-gray-50 ring-1 ring-inset ring-gray-100">
                                <button
                                    type="button"
                                    onClick={() => onEdit(s)}
                                    style={{ left: `${(start / 1440) * 100}%`, width: `${Math.max(((end - start) / 1440) * 100, 2)}%` }}
                                    className={`absolute inset-y-1 truncate rounded-md px-2 text-left text-xs font-medium capitalize ${CHIP_STYLES[s.status]}`}
                                >
                                    {s.position ?? s.status}
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </Card>
    );
}

function MonthGrid({
    days,
    month,
    today,
    shifts,
    onOpenDay,
    onEdit,
}: {
    days: string[];
    month: string;
    today: string;
    shifts: ShiftRow[];
    onOpenDay: (date: string) => void;
    onEdit: (shift: ShiftRow) => void;
}) {
    return (
        <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50/80 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <div key={d} className="py-2">
                        {WEEKDAYS[d]}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7">
                {days.map((d) => {
                    const items = shifts.filter((s) => s.date === d);
                    const inMonth = d.startsWith(month);

                    return (
                        <div
                            key={d}
                            className={`min-h-[4.5rem] border-b border-r border-gray-100 p-1 sm:min-h-[6.5rem] sm:p-1.5 ${inMonth ? '' : 'bg-gray-50/70'}`}
                        >
                            <button
                                type="button"
                                onClick={() => onOpenDay(d)}
                                aria-label={formatDay(d, { weekday: 'long', month: 'long', day: 'numeric' })}
                                className={`mb-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                                    d === today ? 'bg-brand-600 text-white' : inMonth ? 'text-gray-950 hover:bg-gray-100' : 'text-gray-400'
                                }`}
                            >
                                {Number(d.slice(8))}
                            </button>

                            {/* Phones: a tappable count that opens the day. Larger screens: the shifts themselves. */}
                            {items.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => onOpenDay(d)}
                                    className="block w-full rounded-md bg-brand-50 px-1 py-1 text-center text-[12px] font-semibold text-brand-700 sm:hidden"
                                >
                                    {items.length}
                                    <span className="sr-only"> shift{items.length === 1 ? '' : 's'}</span>
                                </button>
                            )}
                            <div className="hidden space-y-1 sm:block">
                                {items.slice(0, 3).map((s) => (
                                    <ShiftChip key={s.id} shift={s} onClick={() => onEdit(s)} compact />
                                ))}
                                {items.length > 3 && (
                                    <button
                                        type="button"
                                        onClick={() => onOpenDay(d)}
                                        className="px-1 text-xs font-semibold text-brand-700 hover:underline"
                                    >
                                        +{items.length - 3} more
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

function ShiftModal({
    state,
    employees,
    onClose,
}: {
    state: { shift?: ShiftRow; employeeId?: number; date?: string } | undefined;
    employees: EmployeeOption[];
    onClose: () => void;
}) {
    const shift = state?.shift;
    const form = useForm({
        employee_id: '' as number | '',
        date: '',
        start_time: '09:00',
        end_time: '17:00',
        break_minutes: 60,
        position: '',
        notes: '',
        status: 'published' as 'draft' | 'published',
        repeat: false,
        repeat_weekdays: [] as number[],
        repeat_until: '',
    });
    const errors = form.errors as FieldErrors;
    const [cancelReason, setCancelReason] = useState('');
    const [confirmCancel, setConfirmCancel] = useState(false);

    useEffect(() => {
        if (!state) {
            return;
        }
        form.clearErrors();
        setConfirmCancel(false);
        setCancelReason('');
        const date = shift?.date ?? state.date ?? '';
        form.setData({
            employee_id: shift?.employee_id ?? state.employeeId ?? '',
            date,
            start_time: shift?.start_time ?? '09:00',
            end_time: shift?.end_time ?? '17:00',
            break_minutes: shift?.break_minutes ?? 60,
            position: shift?.position ?? employees.find((e) => e.id === state.employeeId)?.position ?? '',
            notes: shift?.notes ?? '',
            status: shift && shift.status !== 'cancelled' ? shift.status : 'published',
            repeat: false,
            repeat_weekdays: date ? [weekdayOf(date)] : [],
            repeat_until: date ? addDays(date, 27) : '',
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state]);

    const readOnly = shift?.status === 'cancelled';
    const overnight = form.data.end_time !== '' && form.data.end_time <= form.data.start_time;

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        form.transform(({ repeat, repeat_weekdays, repeat_until, ...d }) => (!shift && repeat ? { ...d, repeat_weekdays, repeat_until } : d));
        const options = { preserveScroll: true, onSuccess: onClose };
        if (shift) {
            form.put(route('shifts.update', shift.id), options);
        } else {
            form.post(route('shifts.store'), options);
        }
    };

    const cancelShift = () =>
        shift && router.post(route('shifts.cancel', shift.id), { reason: cancelReason }, { preserveScroll: true, onSuccess: onClose });
    const deleteDraft = () => shift && router.delete(route('shifts.destroy', shift.id), { preserveScroll: true, onSuccess: onClose });

    const toggleDay = (d: number) =>
        form.setData(
            'repeat_weekdays',
            form.data.repeat_weekdays.includes(d) ? form.data.repeat_weekdays.filter((x) => x !== d) : [...form.data.repeat_weekdays, d],
        );

    return (
        <Modal show={state !== undefined} onClose={onClose} maxWidth="lg">
            <form onSubmit={submit}>
                <DialogLayout
                    title={
                        <span className="flex items-center gap-2">
                            {shift ? 'Shift' : 'Add shift'}
                            {shift && <StatusBadge status={shift.status} />}
                        </span>
                    }
                    footer={
                        <>
                            {shift?.status === 'draft' && (
                                <button
                                    type="button"
                                    onClick={deleteDraft}
                                    className="btn btn-ghost me-auto text-red-600 hover:bg-red-50 hover:text-red-700"
                                >
                                    <Icon name="trash" />
                                    Delete draft
                                </button>
                            )}
                            {shift?.status === 'published' && !confirmCancel && (
                                <button
                                    type="button"
                                    onClick={() => setConfirmCancel(true)}
                                    className="btn btn-ghost me-auto text-red-600 hover:bg-red-50 hover:text-red-700"
                                >
                                    Cancel shift…
                                </button>
                            )}
                            <SecondaryButton onClick={onClose}>Close</SecondaryButton>
                            {!readOnly && <PrimaryButton disabled={form.processing}>{shift ? 'Save' : 'Add shift'}</PrimaryButton>}
                        </>
                    }
                >
                    <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
                        <Field label="Employee" error={errors.employee_id} className="sm:col-span-2">
                            <select
                                required
                                className={inputClass}
                                value={form.data.employee_id}
                                onChange={(e) => {
                                    const id = Number(e.target.value);
                                    form.setData((d) => ({
                                        ...d,
                                        employee_id: id,
                                        position: d.position || (employees.find((x) => x.id === id)?.position ?? ''),
                                    }));
                                }}
                            >
                                <option value="" disabled>
                                    Choose…
                                </option>
                                {employees.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {e.name}
                                    </option>
                                ))}
                                {shift && !employees.some((e) => e.id === shift.employee_id) && (
                                    <option value={shift.employee_id}>{shift.employee}</option>
                                )}
                            </select>
                        </Field>
                        <Field label="Date" error={errors.date}>
                            <input
                                type="date"
                                required
                                className={inputClass}
                                value={form.data.date}
                                onChange={(e) => form.setData('date', e.target.value)}
                            />
                        </Field>
                        <Field label="Unpaid break (minutes)" error={errors.break_minutes}>
                            <input
                                type="number"
                                min={0}
                                max={480}
                                required
                                className={inputClass}
                                value={form.data.break_minutes}
                                onChange={(e) => form.setData('break_minutes', Number(e.target.value))}
                            />
                        </Field>
                        <Field label="Start" error={errors.start_time}>
                            <input
                                type="time"
                                required
                                className={inputClass}
                                value={form.data.start_time}
                                onChange={(e) => form.setData('start_time', e.target.value)}
                            />
                        </Field>
                        <Field label="End" error={errors.end_time} hint={overnight ? 'Overnight shift: ends the next day.' : undefined}>
                            <input
                                type="time"
                                required
                                className={inputClass}
                                value={form.data.end_time}
                                onChange={(e) => form.setData('end_time', e.target.value)}
                            />
                        </Field>
                        <Field label="Position / station" error={errors.position}>
                            <input className={inputClass} value={form.data.position} onChange={(e) => form.setData('position', e.target.value)} />
                        </Field>
                        <Field label="Visibility" error={errors.status}>
                            <select
                                className={inputClass}
                                value={form.data.status}
                                onChange={(e) => form.setData('status', e.target.value as 'draft' | 'published')}
                            >
                                <option value="published">Published (employee sees it)</option>
                                <option value="draft">Draft (managers only)</option>
                            </select>
                        </Field>
                        <Field label="Notes" error={errors.notes} className="sm:col-span-2">
                            <input className={inputClass} value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} />
                        </Field>

                        {!shift && (
                            <div className="rounded-lg border border-gray-200 p-3 sm:col-span-2 sm:p-4">
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-950">
                                    <input
                                        type="checkbox"
                                        checked={form.data.repeat}
                                        onChange={(e) => form.setData('repeat', e.target.checked)}
                                        className="checkbox"
                                    />
                                    Repeat weekly
                                </label>
                                {form.data.repeat && (
                                    <div className="mt-3 space-y-3">
                                        <div>
                                            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Repeat on">
                                                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                                                    <button
                                                        key={d}
                                                        type="button"
                                                        onClick={() => toggleDay(d)}
                                                        aria-pressed={form.data.repeat_weekdays.includes(d)}
                                                        className={`h-9 w-12 rounded-lg border text-xs font-semibold transition-colors ${
                                                            form.data.repeat_weekdays.includes(d)
                                                                ? 'border-brand-600 bg-brand-600 text-white'
                                                                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {WEEKDAYS[d]}
                                                    </button>
                                                ))}
                                            </div>
                                            {errors.repeat_weekdays && <p className="field-error">{errors.repeat_weekdays}</p>}
                                        </div>
                                        <Field
                                            label="Until"
                                            error={errors.repeat_until}
                                            hint="Up to 26 weeks. If any day clashes with another shift, nothing is created."
                                        >
                                            <input
                                                type="date"
                                                className={inputClass}
                                                value={form.data.repeat_until}
                                                onChange={(e) => form.setData('repeat_until', e.target.value)}
                                            />
                                        </Field>
                                    </div>
                                )}
                            </div>
                        )}
                    </fieldset>

                    {shift && !readOnly && confirmCancel && (
                        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 sm:p-4">
                            <Field label="Why is this shift cancelled? (optional)">
                                <input className={inputClass} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                            </Field>
                            <div className="mt-3 flex flex-wrap justify-end gap-2">
                                <SecondaryButton onClick={() => setConfirmCancel(false)}>Keep shift</SecondaryButton>
                                <DangerButton type="button" onClick={cancelShift}>
                                    Cancel shift
                                </DangerButton>
                            </div>
                        </div>
                    )}
                </DialogLayout>
            </form>
        </Modal>
    );
}
