<?php

namespace App\Http\Controllers\Workforce;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Employee;
use App\Models\Shift;
use App\Services\Workforce\ScheduleGenerator;
use App\Services\Workforce\ShiftScheduler;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The shift calendar (day, week, month). Permission::SchedulesManage.
 */
class ShiftController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'view' => ['nullable', Rule::in(['day', 'week', 'month'])],
            'date' => ['nullable', 'date_format:Y-m-d'],
        ]);
        $tz = $request->user()->merchant->timezone;
        $view = $filters['view'] ?? 'week';
        $anchor = Carbon::parse($filters['date'] ?? now($tz)->toDateString(), $tz);

        [$from, $to] = match ($view) {
            'day' => [$anchor->copy()->startOfDay(), $anchor->copy()->endOfDay()],
            'week' => [$anchor->copy()->startOfWeek(Carbon::MONDAY), $anchor->copy()->endOfWeek(Carbon::SUNDAY)],
            'month' => [$anchor->copy()->startOfMonth()->startOfWeek(Carbon::MONDAY), $anchor->copy()->endOfMonth()->endOfWeek(Carbon::SUNDAY)],
        };

        $shifts = Shift::query()
            ->with('employee:id,name')
            ->where('starts_at', '<=', $to->copy()->utc())
            ->where('ends_at', '>=', $from->copy()->utc())
            ->orderBy('starts_at')
            ->get();

        return Inertia::render('Workforce/Schedule', [
            'view' => $view,
            'date' => $anchor->toDateString(),
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'today' => now($tz)->toDateString(),
            'shifts' => $shifts->map(fn (Shift $s) => $this->present($s, $tz)),
            'employees' => Employee::query()->where('status', 'active')->orderBy('name')->get(['id', 'name', 'position']),
            'generatorSettings' => ScheduleGenerator::settingsFor($request->user()->merchant),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request, withRepeat: true);
        $created = $this->scheduler($request)->create($data, $request->user()->id);

        return back()->with('success', $created->count() === 1 ? 'Shift added.' : "{$created->count()} shifts added.");
    }

    public function update(Request $request, Shift $shift): RedirectResponse
    {
        abort_if($shift->status === Shift::CANCELLED, 422, 'Cancelled shifts cannot be edited.');
        $this->scheduler($request)->update($shift, $this->validated($request));

        return back()->with('success', 'Shift updated.');
    }

    public function cancel(Request $request, Shift $shift): RedirectResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:255']]);
        $old = $shift->status;
        $shift->update(['status' => Shift::CANCELLED]);
        AuditLog::record($shift, 'cancelled', ['status' => $old], ['status' => Shift::CANCELLED], $data['reason'] ?? null);

        return back()->with('success', 'Shift cancelled.');
    }

    public function destroy(Shift $shift): RedirectResponse
    {
        abort_unless($shift->status === Shift::DRAFT, 422, 'Only draft shifts can be deleted. Cancel published shifts instead.');
        $shift->delete();

        return back()->with('success', 'Draft shift deleted.');
    }

    /**
     * Publish every draft shift in the visible range.
     */
    public function publish(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        $tz = $request->user()->merchant->timezone;

        $count = Shift::query()
            ->where('status', Shift::DRAFT)
            ->where('starts_at', '>=', Carbon::parse($data['from'], $tz)->startOfDay()->utc())
            ->where('starts_at', '<=', Carbon::parse($data['to'], $tz)->endOfDay()->utc())
            ->update(['status' => Shift::PUBLISHED]);

        return back()->with('success', $count ? "{$count} shift(s) published." : 'There were no drafts to publish.');
    }

    /**
     * @return array<string, mixed>
     */
    public static function present(Shift $shift, string $tz): array
    {
        $start = $shift->starts_at->copy()->setTimezone($tz);
        $end = $shift->ends_at->copy()->setTimezone($tz);

        return [
            'id' => $shift->id,
            'employee_id' => $shift->employee_id,
            'employee' => $shift->employee?->name,
            'date' => $start->toDateString(),
            'start_time' => $start->format('H:i'),
            'end_time' => $end->format('H:i'),
            'overnight' => $end->toDateString() !== $start->toDateString(),
            'break_minutes' => $shift->break_minutes,
            'net_minutes' => $shift->netMinutes(),
            'position' => $shift->position,
            'notes' => $shift->notes,
            'status' => $shift->status,
            'series_id' => $shift->series_id,
        ];
    }

    private function scheduler(Request $request): ShiftScheduler
    {
        return new ShiftScheduler($request->user()->merchant->timezone);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $withRepeat = false): array
    {
        $rules = [
            'employee_id' => [
                'required', 'integer',
                Rule::exists('employees', 'id')
                    ->where('merchant_id', $request->user()->merchant_id)
                    ->where('status', 'active')
                    ->whereNull('deleted_at'),
            ],
            'date' => ['required', 'date_format:Y-m-d'],
            'start_time' => ['required', 'date_format:H:i'],
            'end_time' => ['required', 'date_format:H:i', 'different:start_time'],
            'break_minutes' => ['required', 'integer', 'min:0', 'max:480'],
            'position' => ['nullable', 'string', 'max:80'],
            'notes' => ['nullable', 'string', 'max:255'],
            'status' => ['required', Rule::in([Shift::DRAFT, Shift::PUBLISHED])],
        ];

        if ($withRepeat) {
            // A bad date is reported by its own rule above, not by a crash here.
            $latest = rescue(fn () => Carbon::parse($request->input('date'))->addWeeks(26)->toDateString(), now()->addWeeks(26)->toDateString(), false);
            $rules += [
                'repeat_weekdays' => ['nullable', 'array', 'max:7'],
                'repeat_weekdays.*' => ['integer', 'between:0,6', 'distinct'],
                'repeat_until' => ['nullable', 'required_with:repeat_weekdays', 'date_format:Y-m-d', 'after_or_equal:date', "before_or_equal:{$latest}"],
            ];
        }

        return $request->validate($rules, [
            'end_time.different' => 'The end time must be different from the start time.',
            'repeat_until.before_or_equal' => 'Repeats can run for up to 26 weeks.',
        ]);
    }
}
