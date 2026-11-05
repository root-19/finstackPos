<?php

namespace App\Http\Controllers\Workforce;

use App\Http\Controllers\Controller;
use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\PayrollItem;
use App\Models\PayrollRun;
use App\Models\Shift;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * An employee's own schedule, time clock, attendance, and payslips. Only
 * ever shows the signed-in person's records; payslips appear once the
 * payroll is approved.
 */
class MyWorkController extends Controller
{
    public function index(Request $request): Response
    {
        $employee = $this->employee($request);
        $tz = $request->user()->merchant->timezone;

        $shifts = Shift::query()
            ->where('employee_id', $employee->id)
            ->where('status', Shift::PUBLISHED)
            ->where('ends_at', '>=', now()->subDays(7))
            ->where('starts_at', '<=', now()->addDays(21))
            ->orderBy('starts_at')
            ->get();

        $attendance = AttendanceRecord::query()
            ->with('shift')
            ->where('employee_id', $employee->id)
            ->whereDate('work_date', '>=', now($tz)->subDays(30)->toDateString())
            ->latest('work_date')
            ->latest('id')
            ->get();

        $payslips = PayrollItem::query()
            ->with(['run', 'lines', 'employee'])
            ->where('employee_id', $employee->id)
            ->whereHas('run', fn ($q) => $q->whereIn('status', [PayrollRun::APPROVED, PayrollRun::PAID]))
            ->latest('period_end')
            ->get();

        return Inertia::render('Workforce/MyWork', [
            'employee' => ['name' => $employee->name, 'position' => $employee->position],
            // The clock shows store time (e.g. Philippine time), not the device's.
            'timezone' => $tz,
            'serverTime' => now()->toIso8601String(),
            'openRecord' => ($open = $this->openRecord($employee)) ? AttendanceController::present($open->load('shift'), $tz) : null,
            'shifts' => $shifts->map(fn (Shift $s) => ShiftController::present($s, $tz)),
            'attendance' => $attendance->map(fn (AttendanceRecord $r) => AttendanceController::present($r, $tz)),
            'payslips' => $payslips->map(fn (PayrollItem $i) => [
                ...PayrollController::presentItem($i),
                'status' => $i->run->status,
            ]),
        ]);
    }

    public function clockIn(Request $request): RedirectResponse
    {
        $employee = $this->employee($request);
        $tz = $request->user()->merchant->timezone;

        if ($this->openRecord($employee)) {
            throw ValidationException::withMessages(['clock' => 'You are already clocked in.']);
        }

        // The published shift closest to now (within 12 hours), if any.
        $shift = Shift::query()
            ->where('employee_id', $employee->id)
            ->where('status', Shift::PUBLISHED)
            ->whereBetween('starts_at', [now()->subHours(12), now()->addHours(12)])
            ->get()
            ->sortBy(fn (Shift $s) => abs($s->starts_at->diffInMinutes(now())))
            ->first();

        $record = new AttendanceRecord([
            'employee_id' => $employee->id,
            'shift_id' => $shift?->id,
            'work_date' => now($tz)->toDateString(),
            'type' => 'worked',
            'clock_in_at' => now(),
            'break_minutes' => 0,
            'status' => AttendanceRecord::PENDING,
            'source' => 'clock',
        ]);
        $record->save();

        return back()->with('success', 'Clocked in at '.now($tz)->format('g:i A').'.');
    }

    public function clockOut(Request $request): RedirectResponse
    {
        $employee = $this->employee($request);
        $tz = $request->user()->merchant->timezone;
        $record = $this->openRecord($employee);

        if (! $record) {
            throw ValidationException::withMessages(['clock' => 'You are not clocked in.']);
        }

        $data = $request->validate(['break_minutes' => ['required', 'integer', 'min:0', 'max:480']]);
        if ($data['break_minutes'] >= $record->clock_in_at->diffInMinutes(now())) {
            throw ValidationException::withMessages(['break_minutes' => 'Your break must be shorter than the time since you clocked in.']);
        }

        // Stays pending until a manager approves it for payroll.
        $record->update(['clock_out_at' => now(), 'break_minutes' => $data['break_minutes']]);

        return back()->with('success', 'Clocked out at '.now($tz)->format('g:i A').'. Your manager will review it.');
    }

    private function employee(Request $request): Employee
    {
        // My Work is the employees' space; the owner manages the team instead.
        abort_if($request->user()->isOwner(), 403, 'My Work is for employees.');
        $employee = $request->user()->employee;
        abort_if($employee === null, 403, 'Your account is not linked to an employee record. Ask the store owner.');

        return $employee;
    }

    private function openRecord(Employee $employee): ?AttendanceRecord
    {
        return AttendanceRecord::query()
            ->where('employee_id', $employee->id)
            ->where('type', 'worked')
            ->whereNotNull('clock_in_at')
            ->whereNull('clock_out_at')
            ->latest('clock_in_at')
            ->first();
    }
}
