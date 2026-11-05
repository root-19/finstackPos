import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { Alert, Badge, DialogLayout } from '@/Components/ui';
import { router } from '@inertiajs/react';
import axios, { AxiosError } from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { addDays, Field, formatDay, hours, inputClass, time12 } from './shared';

export type GeneratorSettings = {
    start_times: string[];
    work_hours: number;
    break_minutes: number;
    days_off: number;
    consecutive_days_off: boolean;
    open_days: number[];
    status: 'draft' | 'published';
};

type Preview = {
    seed: number;
    dates: string[];
    plan: { employee_id: number; cells: Record<string, string | null> }[];
    /** employee id → date → description of a shift already there */
    existing: Record<string, Record<string, string>>;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The Monday on or before a YYYY-MM-DD date. */
export function mondayOf(ymd: string): string {
    const [y, m, d] = ymd.split('-').map(Number);

    return addDays(ymd, -((new Date(y, m - 1, d).getDay() + 6) % 7));
}

function endTime(start: string, minutes: number): string {
    const [h, m] = start.split(':').map(Number);
    const total = (h * 60 + m + minutes) % 1440;

    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function errorsOf(error: unknown): string[] {
    const data = (error as AxiosError<{ errors?: Record<string, string[]>; message?: string }>).response?.data;

    return data?.errors ? Object.values(data.errors).flat() : [data?.message ?? 'Something went wrong. Please try again.'];
}

export default function ScheduleGeneratorModal({
    show,
    weekStart,
    employees,
    defaults,
    onClose,
}: {
    show: boolean;
    weekStart: string;
    employees: { id: number; name: string; position: string | null }[];
    defaults: GeneratorSettings;
    onClose: () => void;
}) {
    const [week, setWeek] = useState(weekStart);
    const [employeeIds, setEmployeeIds] = useState<number[]>([]);
    const [settings, setSettings] = useState<GeneratorSettings>(defaults);
    const [replaceDrafts, setReplaceDrafts] = useState(true);
    const [newTime, setNewTime] = useState('11:00');
    const [preview, setPreview] = useState<Preview | null>(null);
    const [errors, setErrors] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (show) {
            setWeek(weekStart);
            setEmployeeIds(employees.map((e) => e.id));
            setSettings(defaults);
            setPreview(null);
            setErrors([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show]);

    const set = <K extends keyof GeneratorSettings>(key: K, value: GeneratorSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));
    const shiftMinutes = Math.round(settings.work_hours * 60) + settings.break_minutes;
    const payload = (seed?: number) => ({ week_start: week, employee_ids: employeeIds, settings, replace_drafts: replaceDrafts, seed });

    const generate = async (seed?: number) => {
        setBusy(true);
        setErrors([]);
        try {
            const res = await axios.post<Preview>(route('shifts.generate.preview'), payload(seed));
            setPreview(res.data);
        } catch (e) {
            setErrors(errorsOf(e));
        } finally {
            setBusy(false);
        }
    };

    const setCell = (employeeId: number, date: string, value: string | null) =>
        setPreview(
            (p) =>
                p && {
                    ...p,
                    plan: p.plan.map((row) => (row.employee_id === employeeId ? { ...row, cells: { ...row.cells, [date]: value } } : row)),
                },
        );

    // Days that already have a shift are left alone.
    const entries = useMemo(
        () =>
            preview?.plan.flatMap((row) =>
                Object.entries(row.cells)
                    .filter(([date, time]) => time && !preview.existing[row.employee_id]?.[date])
                    .map(([date, time]) => ({ employee_id: row.employee_id, date, start_time: time as string })),
            ) ?? [],
        [preview],
    );

    const save = () => {
        setBusy(true);
        setErrors([]);
        router.post(
            route('shifts.generate'),
            { ...payload(preview?.seed), plan: entries },
            {
                preserveScroll: true,
                onSuccess: onClose,
                onError: (errs) => setErrors(Object.values(errs)),
                onFinish: () => setBusy(false),
            },
        );
    };

    const nameOf = (id: number) => employees.find((e) => e.id === id)?.name ?? `#${id}`;

    return (
        <Modal show={show} onClose={onClose} maxWidth={preview ? '5xl' : '2xl'}>
            <DialogLayout
                title={
                    <span className="flex flex-wrap items-center justify-between gap-2">
                        Auto-generate schedule
                        <Badge>Step {preview ? 2 : 1} of 2</Badge>
                    </span>
                }
                description={
                    preview
                        ? 'Review and adjust the proposal. Change any day’s start time or set it to Off, then save.'
                        : 'Start times are shared out evenly and days off are spread so the store is never short on the same day.'
                }
                footer={
                    <>
                        {preview && (
                            <div className="me-auto flex flex-wrap gap-2">
                                <SecondaryButton onClick={() => setPreview(null)}>
                                    <Icon name="chevronLeft" />
                                    Settings
                                </SecondaryButton>
                                <SecondaryButton onClick={() => generate()} disabled={busy}>
                                    <Icon name="refresh" />
                                    Shuffle again
                                </SecondaryButton>
                            </div>
                        )}
                        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                        {preview ? (
                            <PrimaryButton type="button" onClick={save} disabled={busy || entries.length === 0}>
                                Save {entries.length} shift{entries.length === 1 ? '' : 's'}
                            </PrimaryButton>
                        ) : (
                            <PrimaryButton
                                type="button"
                                onClick={() => generate()}
                                disabled={busy || employeeIds.length === 0 || settings.start_times.length === 0 || settings.open_days.length === 0}
                            >
                                {busy ? 'Generating…' : 'Generate preview'}
                            </PrimaryButton>
                        )}
                    </>
                }
            >
                {errors.length > 0 && (
                    <Alert tone="red" className="mb-4">
                        <ul className="space-y-1">
                            {errors.map((e) => (
                                <li key={e}>{e}</li>
                            ))}
                        </ul>
                    </Alert>
                )}

                {!preview ? (
                    <div className="space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Week (starts Monday)" hint={`${formatDay(week)} – ${formatDay(addDays(week, 6))}`}>
                                <input
                                    type="date"
                                    className={inputClass}
                                    value={week}
                                    onChange={(e) => e.target.value && setWeek(mondayOf(e.target.value))}
                                />
                            </Field>
                            <Field label="Save as">
                                <select
                                    className={inputClass}
                                    value={settings.status}
                                    onChange={(e) => set('status', e.target.value as GeneratorSettings['status'])}
                                >
                                    <option value="draft">Drafts (review, then publish)</option>
                                    <option value="published">Published right away</option>
                                </select>
                            </Field>
                        </div>

                        <div>
                            <p className="label">Start times</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                {settings.start_times.map((t) => (
                                    <span
                                        key={t}
                                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 pl-2.5 pr-1 text-sm font-medium text-gray-950"
                                    >
                                        {time12(t)}
                                        <span className="font-normal text-gray-500">– {time12(endTime(t, shiftMinutes))}</span>
                                        <button
                                            type="button"
                                            aria-label={`Remove ${time12(t)}`}
                                            onClick={() =>
                                                set(
                                                    'start_times',
                                                    settings.start_times.filter((x) => x !== t),
                                                )
                                            }
                                            className="ms-0.5 flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                                        >
                                            <Icon name="x" className="h-3.5 w-3.5" />
                                        </button>
                                    </span>
                                ))}
                                <span className="inline-flex items-center gap-1.5">
                                    <input
                                        type="time"
                                        value={newTime}
                                        onChange={(e) => setNewTime(e.target.value)}
                                        aria-label="New start time"
                                        className="input h-8 w-auto py-1"
                                    />
                                    <button
                                        type="button"
                                        onClick={() =>
                                            newTime &&
                                            !settings.start_times.includes(newTime) &&
                                            set('start_times', [...settings.start_times, newTime].sort())
                                        }
                                        className="btn btn-secondary btn-sm"
                                    >
                                        <Icon name="plus" />
                                        Add
                                    </button>
                                </span>
                            </div>
                            <p className="help">Each employee keeps one start time for the week; employees are spread across these times.</p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field label="Work hours per shift" hint="Paid time, not counting the break.">
                                <input
                                    type="number"
                                    min={1}
                                    max={16}
                                    step={0.5}
                                    className={inputClass}
                                    value={settings.work_hours}
                                    onChange={(e) => set('work_hours', Number(e.target.value))}
                                />
                            </Field>
                            <Field label="Break (minutes)" hint={`Shift length: ${hours(shiftMinutes)}`}>
                                <input
                                    type="number"
                                    min={0}
                                    max={240}
                                    step={5}
                                    className={inputClass}
                                    value={settings.break_minutes}
                                    onChange={(e) => set('break_minutes', Number(e.target.value))}
                                />
                            </Field>
                            <Field
                                label="Days off per employee"
                                hint={`${Math.max(settings.open_days.length - settings.days_off, 0)} working day(s) each`}
                            >
                                <input
                                    type="number"
                                    min={0}
                                    max={6}
                                    className={inputClass}
                                    value={settings.days_off}
                                    onChange={(e) => set('days_off', Number(e.target.value))}
                                />
                            </Field>
                        </div>

                        <div>
                            <p className="label">Store open on</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                                    const on = settings.open_days.includes(d);
                                    return (
                                        <button
                                            key={d}
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() =>
                                                set('open_days', on ? settings.open_days.filter((x) => x !== d) : [...settings.open_days, d])
                                            }
                                            className={`h-9 w-12 rounded-lg border text-xs font-semibold transition-colors ${
                                                on
                                                    ? 'border-brand-600 bg-brand-600 text-white'
                                                    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            {WEEKDAYS[d]}
                                        </button>
                                    );
                                })}
                            </div>
                            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={settings.consecutive_days_off}
                                    onChange={(e) => set('consecutive_days_off', e.target.checked)}
                                    className="checkbox"
                                />
                                Keep each employee’s days off together (e.g. Tue–Wed)
                            </label>
                        </div>

                        <div>
                            <div className="flex items-center justify-between gap-3">
                                <p className="label">
                                    Employees ({employeeIds.length} of {employees.length})
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setEmployeeIds(employeeIds.length === employees.length ? [] : employees.map((e) => e.id))}
                                    className="btn btn-ghost btn-sm text-brand-700"
                                >
                                    {employeeIds.length === employees.length ? 'Clear' : 'Select all'}
                                </button>
                            </div>
                            <div className="mt-2 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                                {employees.map((e) => {
                                    const on = employeeIds.includes(e.id);
                                    return (
                                        <button
                                            key={e.id}
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() => setEmployeeIds(on ? employeeIds.filter((x) => x !== e.id) : [...employeeIds, e.id])}
                                            className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                                                on
                                                    ? 'border-brand-200 bg-brand-50 text-brand-800'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            {on && <Icon name="check" className="h-3.5 w-3.5" />}
                                            {e.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <label className="flex items-start gap-2 text-sm text-gray-700">
                            <input
                                type="checkbox"
                                checked={replaceDrafts}
                                onChange={(e) => setReplaceDrafts(e.target.checked)}
                                className="checkbox mt-0.5"
                            />
                            <span>Replace draft shifts already in this week. Published shifts are always kept and those days are skipped.</span>
                        </label>
                    </div>
                ) : (
                    <PreviewGrid preview={preview} settings={settings} shiftMinutes={shiftMinutes} nameOf={nameOf} onChange={setCell} />
                )}
            </DialogLayout>
        </Modal>
    );
}

function PreviewGrid({
    preview,
    settings,
    shiftMinutes,
    nameOf,
    onChange,
}: {
    preview: Preview;
    settings: GeneratorSettings;
    shiftMinutes: number;
    nameOf: (id: number) => string;
    onChange: (employeeId: number, date: string, value: string | null) => void;
}) {
    const isNew = (employeeId: number, date: string) => !preview.existing[employeeId]?.[date];
    const working = (date: string) => preview.plan.filter((r) => r.cells[date] && isNew(r.employee_id, date)).length;

    return (
        <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] text-sm">
                    <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left">Employee</th>
                            {preview.dates.map((d) => (
                                <th key={d} className="px-1.5 py-2 text-center">
                                    {formatDay(d, { weekday: 'short' })}
                                    <span className="block font-normal normal-case text-gray-400">
                                        {formatDay(d, { month: 'short', day: 'numeric' })}
                                    </span>
                                </th>
                            ))}
                            <th className="px-3 py-2 text-right">Hours</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {preview.plan.map((row) => {
                            const days = preview.dates.filter((d) => row.cells[d] && isNew(row.employee_id, d)).length;

                            return (
                                <tr key={row.employee_id}>
                                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-medium text-gray-950">
                                        {nameOf(row.employee_id)}
                                    </td>
                                    {preview.dates.map((d) => {
                                        const existing = preview.existing[row.employee_id]?.[d];
                                        const value = row.cells[d];
                                        const options = Array.from(new Set([...settings.start_times, ...(value ? [value] : [])])).sort();

                                        return (
                                            <td key={d} className="px-1 py-1.5">
                                                {existing ? (
                                                    <span
                                                        title="Already scheduled; kept as is"
                                                        className="block rounded-md bg-gray-100 px-1.5 py-1.5 text-center text-[12px] leading-tight text-gray-500"
                                                    >
                                                        {existing}
                                                    </span>
                                                ) : (
                                                    <select
                                                        aria-label={`${nameOf(row.employee_id)} on ${d}`}
                                                        value={value ?? ''}
                                                        onChange={(e) => onChange(row.employee_id, d, e.target.value || null)}
                                                        className={`input py-1.5 pl-2 pr-6 text-xs font-medium ${
                                                            value ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-gray-200 text-gray-400'
                                                        }`}
                                                    >
                                                        <option value="">Off</option>
                                                        {options.map((t) => (
                                                            <option key={t} value={t}>
                                                                {time12(t)}–{time12(endTime(t, shiftMinutes))}
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                                        {hours(days * Math.round(settings.work_hours * 60))}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="border-t border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
                        <tr>
                            <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2">Working</td>
                            {preview.dates.map((d) => (
                                <td key={d} className="px-1.5 py-2 text-center tabular-nums">
                                    {working(d)}
                                </td>
                            ))}
                            <td />
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
