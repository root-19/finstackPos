import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { Badge, CardHeader, DialogLayout } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { Head, useForm, usePage } from '@inertiajs/react';
import { FormEventHandler, useEffect, useState } from 'react';
import type { AttendanceRow } from './Attendance';
import { Payslip, PayslipItem, usePayslipPrinter } from './Partials/Payslip';
import { Card, EmptyState, FieldErrors, formatDay, hours, peso, StatusBadge, time12 } from './Partials/shared';
import type { ShiftRow } from './Schedule';

type Props = {
    employee: { name: string; position: string | null };
    openRecord: AttendanceRow | null;
    shifts: ShiftRow[];
    attendance: AttendanceRow[];
    payslips: (PayslipItem & { status: string })[];
    /** The store's timezone, e.g. Asia/Manila. */
    timezone: string;
    serverTime: string;
};

export default function MyWork({ employee, openRecord, shifts, attendance, payslips, timezone, serverTime }: PageProps<Props>) {
    // Server time minus device time, so a device with a wrong clock still shows the right time.
    const [offset] = useState(() => new Date(serverTime).getTime() - Date.now());
    const [now, setNow] = useState(() => new Date(Date.now() + offset));
    const [viewing, setViewing] = useState<PayslipItem | null>(null);
    const { printPayslip, printer } = usePayslipPrinter(false);
    const errors = usePage().props.errors as FieldErrors;
    const clockIn = useForm({});
    const clockOut = useForm({ break_minutes: 0 });

    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date(Date.now() + offset)), 1000);
        return () => window.clearInterval(id);
    }, [offset]);

    // Today in the store's timezone (en-CA formats as YYYY-MM-DD).
    const today = now.toLocaleDateString('en-CA', { timeZone: timezone });
    const upcoming = shifts.filter((s) => s.date >= today);
    const todayShift = upcoming.find((s) => s.date === today);

    const doClockIn = () => clockIn.post(route('my-work.clock-in'), { preserveScroll: true });
    const doClockOut: FormEventHandler = (e) => {
        e.preventDefault();
        clockOut.post(route('my-work.clock-out'), { preserveScroll: true, onSuccess: () => clockOut.reset() });
    };

    const clockError = errors.clock ?? errors.break_minutes;

    return (
        <AuthenticatedLayout header={<PageHeader title="My Work" subtitle="Your time clock, schedule, and payslips" />}>
            <Head title="My Work" />

            <div className="app-page">
                <Card>
                    <div className="grid gap-5 p-4 sm:p-6 md:grid-cols-[1fr_20rem] md:items-center md:gap-8">
                        <div className="min-w-0">
                            <p className="truncate text-sm text-gray-500">
                                {employee.name}
                                {employee.position && ` · ${employee.position}`}
                            </p>
                            <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-gray-950 sm:text-5xl">
                                {now.toLocaleTimeString('en-PH', { timeZone: timezone, hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                            </p>
                            <p className="text-sm text-gray-500">
                                {now.toLocaleDateString('en-PH', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' })}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                                {openRecord ? (
                                    <>
                                        <Badge tone="green">Clocked in</Badge>
                                        <span className="text-gray-700">Since {time12(openRecord.clock_in)}</span>
                                    </>
                                ) : (
                                    <>
                                        <Badge tone="gray">Not clocked in</Badge>
                                        {todayShift ? (
                                            <span className="text-gray-700">
                                                Today’s shift: {time12(todayShift.start_time)}–{time12(todayShift.end_time)}
                                            </span>
                                        ) : (
                                            <span className="text-gray-500">No shift scheduled today.</span>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-5 md:border-l md:border-t-0 md:pl-8 md:pt-0">
                            {openRecord ? (
                                <form onSubmit={doClockOut} className="space-y-3">
                                    <div>
                                        <label htmlFor="break-minutes" className="label">
                                            Unpaid break taken (minutes)
                                        </label>
                                        <input
                                            id="break-minutes"
                                            type="number"
                                            inputMode="numeric"
                                            min={0}
                                            max={480}
                                            value={clockOut.data.break_minutes}
                                            onChange={(e) => clockOut.setData('break_minutes', Number(e.target.value))}
                                            className="input mt-1"
                                        />
                                    </div>
                                    <button disabled={clockOut.processing} className="btn btn-dark btn-lg w-full">
                                        Clock out
                                    </button>
                                </form>
                            ) : (
                                <button type="button" onClick={doClockIn} disabled={clockIn.processing} className="btn btn-primary btn-lg w-full">
                                    Clock in
                                </button>
                            )}
                            {clockError && (
                                <p className="field-error" role="alert">
                                    {clockError}
                                </p>
                            )}
                            <p className="help">Your manager approves your time before it counts for payroll.</p>
                        </div>
                    </div>
                </Card>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <Card>
                        <CardHeader title="Upcoming shifts" />
                        {upcoming.length === 0 ? (
                            <EmptyState title="No published shifts in the next 3 weeks" icon={<Icon name="schedule" className="h-5 w-5" />} />
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {upcoming.map((s) => (
                                    <li key={s.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                                        <div className="min-w-0">
                                            <p className="font-medium text-gray-950">
                                                {formatDay(s.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                                                {s.date === today && (
                                                    <Badge tone="brand" className="ms-2 align-middle">
                                                        Today
                                                    </Badge>
                                                )}
                                            </p>
                                            {s.position && <p className="text-xs text-gray-500">{s.position}</p>}
                                            {s.notes && <p className="text-xs text-gray-500">{s.notes}</p>}
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="whitespace-nowrap tabular-nums text-gray-950">
                                                {time12(s.start_time)}–{time12(s.end_time)}
                                            </p>
                                            <p className="mt-0.5 flex items-center justify-end gap-1.5 text-xs text-gray-500">
                                                {s.overnight && <Badge tone="blue">Overnight</Badge>}
                                                {hours(s.net_minutes)} paid
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    <Card>
                        <CardHeader title="Payslips" />
                        {payslips.length === 0 ? (
                            <EmptyState title="No payslips yet" icon={<Icon name="payroll" className="h-5 w-5" />}>
                                They appear here once a payroll is approved.
                            </EmptyState>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {payslips.map((p) => (
                                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                                        <div className="min-w-0">
                                            <p className="font-medium text-gray-950">
                                                {formatDay(p.period_start, { month: 'short', day: 'numeric' })} – {formatDay(p.period_end)}
                                            </p>
                                            <div className="mt-1">
                                                <StatusBadge status={p.status} />
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <span className="text-right">
                                                <span className="block text-xs text-gray-500">Net pay</span>
                                                <span className="font-semibold tabular-nums text-gray-950">{peso(p.net_cents)}</span>
                                            </span>
                                            <button type="button" onClick={() => setViewing(p)} className="btn btn-secondary btn-sm">
                                                View
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                </div>

                <Card className="overflow-hidden">
                    <CardHeader title="My attendance" subtitle="Last 30 days" />
                    {attendance.length === 0 ? (
                        <EmptyState title="No attendance yet" icon={<Icon name="attendance" className="h-5 w-5" />} />
                    ) : (
                        <>
                            {/* Phones: stacked rows instead of a scrolling table. */}
                            <ul className="divide-y divide-gray-100 sm:hidden">
                                {attendance.map((r) => (
                                    <li key={r.id} className="px-4 py-3 text-sm">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="font-medium text-gray-950">
                                                {formatDay(r.work_date, { weekday: 'short', month: 'short', day: 'numeric' })}
                                            </p>
                                            <StatusBadge status={r.status} />
                                        </div>
                                        <p className="mt-0.5 text-gray-700">
                                            {r.type === 'absent'
                                                ? 'Absent'
                                                : `${time12(r.clock_in)} – ${r.clock_out ? time12(r.clock_out) : 'on shift'}`}
                                        </p>
                                        <p className="mt-0.5 text-xs tabular-nums text-gray-500">
                                            Worked {r.worked_minutes ? hours(r.worked_minutes) : '—'} · Late{' '}
                                            {r.late_minutes ? `${r.late_minutes}m` : '—'}
                                        </p>
                                    </li>
                                ))}
                            </ul>

                            <div className="hidden overflow-x-auto sm:block">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>In – Out</th>
                                            <th className="num">Worked</th>
                                            <th className="num">Late</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {attendance.map((r) => (
                                            <tr key={r.id}>
                                                <td className="whitespace-nowrap">
                                                    {formatDay(r.work_date, { weekday: 'short', month: 'short', day: 'numeric' })}
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    {r.type === 'absent'
                                                        ? 'Absent'
                                                        : `${time12(r.clock_in)} – ${r.clock_out ? time12(r.clock_out) : 'on shift'}`}
                                                </td>
                                                <td className="num">{r.worked_minutes ? hours(r.worked_minutes) : '—'}</td>
                                                <td className="num">{r.late_minutes ? `${r.late_minutes}m` : '—'}</td>
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

            <Modal show={viewing !== null} onClose={() => setViewing(null)}>
                {viewing && (
                    <DialogLayout
                        title="Payslip"
                        footer={
                            <>
                                <SecondaryButton onClick={() => setViewing(null)}>Close</SecondaryButton>
                                <PrimaryButton type="button" onClick={() => printPayslip(viewing)}>
                                    <Icon name="printer" />
                                    Print
                                </PrimaryButton>
                            </>
                        }
                    >
                        <Payslip item={viewing} showWarnings={false} />
                    </DialogLayout>
                )}
            </Modal>

            {printer}
        </AuthenticatedLayout>
    );
}
