<?php

namespace App\Http\Controllers\Workforce;

use App\Http\Controllers\Controller;
use App\Models\AttendanceRecord;
use App\Models\AuditLog;
use App\Models\Employee;
use App\Models\Shift;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Timesheets: review clock-ins, record manual attendance, and approve it
 * for payroll. Every manual entry or correction needs a reason and is
 * audited. Permission::AttendanceManage.
 */
class AttendanceController extends Controller
{
    public function index(Request $request): Response
    {
        $tz = $request->user()->merchant->timezone;
        $filters = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
            'employee' => ['nullable', 'integer'],
            'status' => ['nullable', Rule::in(['pending', 'approved', 'rejected'])],
        ]);
        $from = $filters['from'] ?? now($tz)->startOfWeek(Carbon::MONDAY)->toDateString();
        $to = $filters['to'] ?? now($tz)->endOfWeek(Carbon::SUNDAY)->toDateString();

        $records = AttendanceRecord::query()
            ->with(['employee:id,name', 'shift', 'approver:id,name'])
            ->whereDate('work_date', '>=', $from)
            ->whereDate('work_date', '<=', $to)
            ->when($filters['employee'] ?? null, fn ($q, $id) => $q->where('employee_id', $id))
            ->when($filters['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->orderBy('work_date')
            ->orderBy('clock_in_at')
            ->get();

        // Published shifts that already ended with no attendance at all: likely absences.
        $recordedShiftIds = AttendanceRecord::query()->whereNotNull('shift_id')->pluck('shift_id');
        $missing = Shift::query()
            ->with('employee:id,name')
            ->where('status', Shift::PUBLISHED)
            ->where('ends_at', '<', now())
            ->where('starts_at', '>=', Carbon::parse($from, $tz)->startOfDay()->utc())
            ->where('starts_at', '<=', Carbon::parse($to, $tz)->endOfDay()->utc())
            ->whereNotIn('id', $recordedShiftIds)
            ->when($filters['employee'] ?? null, fn ($q, $id) => $q->where('employee_id', $id))
            ->orderBy('starts_at')
            ->get();

        return Inertia::render('Workforce/Attendance', [
            'filters' => ['from' => $from, 'to' => $to, 'employee' => $filters['employee'] ?? null, 'status' => $filters['status'] ?? null],
            'records' => $records->map(fn (AttendanceRecord $r) => $this->present($r, $tz)),
            'missing' => $missing->map(fn (Shift $s) => ShiftController::present($s, $tz)),
            'employees' => Employee::query()->orderBy('name')->get(['id', 'name', 'status']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $employee = Employee::findOrFail($data['employee_id']);
        $this->ensureOpen($employee, $data['work_date']);

        $record = new AttendanceRecord($this->values($request, $data));
        $record->source = 'manual';
        // Entered by someone allowed to approve attendance, so it counts right away.
        $record->status = AttendanceRecord::APPROVED;
        $record->approved_by = $request->user()->id;
        $record->approved_at = now();
        $record->save();

        AuditLog::record($record, 'created', null, $this->auditValues($record), $data['reason']);

        return back()->with('success', "Attendance recorded for {$employee->name}.");
    }

    public function update(Request $request, AttendanceRecord $record): RedirectResponse
    {
        $data = $this->validated($request);
        $this->ensureOpen($record->employee, $record->work_date->toDateString());
        $this->ensureOpen(Employee::findOrFail($data['employee_id']), $data['work_date']);

        $old = $this->auditValues($record);
        $record->fill($this->values($request, $data));
        $record->status = AttendanceRecord::APPROVED;
        $record->approved_by = $request->user()->id;
        $record->approved_at = now();
        $record->save();

        AuditLog::record($record, 'corrected', $old, $this->auditValues($record->fresh()), $data['reason']);

        return back()->with('success', 'Attendance corrected.');
    }

    /**
     * Approve or reject several records at once.
     */
    public function review(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:500'],
            'ids.*' => ['integer'],
            'decision' => ['required', Rule::in([AttendanceRecord::APPROVED, AttendanceRecord::REJECTED])],
            'reason' => ['nullable', 'required_if:decision,rejected', 'string', 'max:500'],
        ]);

        $records = AttendanceRecord::query()->with('employee')->whereKey($data['ids'])->get();
        foreach ($records as $record) {
            $this->ensureOpen($record->employee, $record->work_date->toDateString());
        }

        foreach ($records as $record) {
            $old = $record->status;
            $record->status = $data['decision'];
            $record->approved_by = $request->user()->id;
            $record->approved_at = now();
            $record->save();
            AuditLog::record($record, $data['decision'], ['status' => $old], ['status' => $data['decision']], $data['reason'] ?? null);
        }

        return back()->with('success', "{$records->count()} record(s) {$data['decision']}.");
    }

    public function history(AttendanceRecord $record): JsonResponse
    {
        return response()->json(['history' => AuditLog::trailFor($record)]);
    }

    /**
     * @return array<string, mixed>
     */
    public static function present(AttendanceRecord $record, string $tz): array
    {
        $m = $record->minutes();
        $local = fn (?Carbon $t) => $t?->copy()->setTimezone($tz);

        return [
            'id' => $record->id,
            'employee_id' => $record->employee_id,
            'employee' => $record->employee?->name,
            'work_date' => $record->work_date->toDateString(),
            'type' => $record->type,
            'clock_in' => $local($record->clock_in_at)?->format('H:i'),
            'clock_out' => $local($record->clock_out_at)?->format('H:i'),
            'clock_out_date' => $local($record->clock_out_at)?->toDateString(),
            'break_minutes' => $record->break_minutes,
            'shift' => $record->shift ? ShiftController::present($record->shift, $tz) : null,
            'worked_minutes' => $m['worked'],
            'overtime_minutes' => $m['overtime'],
            'late_minutes' => $m['late'],
            'status' => $record->status,
            'source' => $record->source,
            'note' => $record->note,
            'approved_by' => $record->approver?->name,
            'locked' => $record->employee?->isPaidThrough($record->work_date->toDateString()) ?? false,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'employee_id' => ['required', 'integer', Rule::exists('employees', 'id')->where('merchant_id', $request->user()->merchant_id)->whereNull('deleted_at')],
            'work_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.now($request->user()->merchant->timezone)->toDateString()],
            'type' => ['required', Rule::in(['worked', 'absent'])],
            'clock_in' => ['nullable', 'required_if:type,worked', 'date_format:H:i'],
            'clock_out' => ['nullable', 'required_if:type,worked', 'date_format:H:i', 'different:clock_in'],
            'break_minutes' => ['nullable', 'integer', 'min:0', 'max:480'],
            // Manual entries and corrections must say why.
            'reason' => ['required', 'string', 'min:3', 'max:500'],
        ], [
            'reason.required' => 'Give a reason for this manual entry or correction.',
            'work_date.before_or_equal' => 'Attendance cannot be recorded for a future date.',
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function values(Request $request, array $data): array
    {
        $tz = $request->user()->merchant->timezone;
        $in = $out = null;
        $break = 0;

        if ($data['type'] === 'worked') {
            $in = Carbon::createFromFormat('Y-m-d H:i', "{$data['work_date']} {$data['clock_in']}", $tz);
            $out = Carbon::createFromFormat('Y-m-d H:i', "{$data['work_date']} {$data['clock_out']}", $tz);
            if ($out->lte($in)) {
                $out->addDay(); // overnight
            }
            $break = (int) ($data['break_minutes'] ?? 0);
            if ($break >= $in->diffInMinutes($out)) {
                throw ValidationException::withMessages(['break_minutes' => 'The break must be shorter than the time worked.']);
            }
        }

        $shift = Shift::query()
            ->where('employee_id', $data['employee_id'])
            ->where('status', Shift::PUBLISHED)
            ->where('starts_at', '>=', Carbon::parse($data['work_date'], $tz)->startOfDay()->utc())
            ->where('starts_at', '<=', Carbon::parse($data['work_date'], $tz)->endOfDay()->utc())
            ->orderBy('starts_at')
            ->first();

        return [
            'employee_id' => $data['employee_id'],
            'shift_id' => $shift?->id,
            'work_date' => $data['work_date'],
            'type' => $data['type'],
            'clock_in_at' => $in?->utc(),
            'clock_out_at' => $out?->utc(),
            'break_minutes' => $break,
            'note' => $data['reason'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function auditValues(AttendanceRecord $record): array
    {
        return [
            'employee_id' => $record->employee_id,
            'work_date' => $record->work_date?->toDateString(),
            'type' => $record->type,
            'clock_in_at' => $record->clock_in_at?->toIso8601String(),
            'clock_out_at' => $record->clock_out_at?->toIso8601String(),
            'break_minutes' => $record->break_minutes,
            'status' => $record->status,
        ];
    }

    /**
     * Attendance already paid by a finalized payroll is locked.
     *
     * @throws ValidationException
     */
    private function ensureOpen(Employee $employee, string $date): void
    {
        if ($employee->isPaidThrough($date)) {
            throw ValidationException::withMessages([
                'work_date' => "{$employee->name}'s attendance on {$date} is part of a finalized payroll and can no longer change.",
            ]);
        }
    }
}
