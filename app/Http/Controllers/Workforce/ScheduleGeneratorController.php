<?php

namespace App\Http\Controllers\Workforce;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Shift;
use App\Services\Workforce\ScheduleGenerator;
use App\Services\Workforce\ShiftScheduler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Auto-generate a week of shifts for many employees. The preview is a
 * proposal the manager can edit; saving turns it into ordinary shifts.
 * Permission::SchedulesManage.
 */
class ScheduleGeneratorController extends Controller
{
    public function preview(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $tz = $request->user()->merchant->timezone;
        $employees = Employee::query()->whereKey($data['employee_ids'])->where('status', 'active')->orderBy('name')->get();

        $generator = $this->generator($request);
        $seed = $data['seed'] ?? random_int(1, PHP_INT_MAX);

        return response()->json([
            'seed' => $seed,
            'dates' => ScheduleGenerator::weekDates($data['week_start']),
            'plan' => $generator->plan($data['settings'], $data['week_start'], $employees, $seed),
            'existing' => $generator->existing($employees->pluck('id')->all(), $data['week_start'], $data['replace_drafts'], $tz),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request, withPlan: true);
        $dates = ScheduleGenerator::weekDates($data['week_start']);

        foreach ($data['plan'] as $entry) {
            if (! in_array($entry['date'], $dates, true) || ! in_array($entry['employee_id'], $data['employee_ids'], true)) {
                throw ValidationException::withMessages(['plan' => 'The schedule does not match the chosen week and employees.']);
            }
        }

        $created = $this->generator($request)->save(
            $data['settings'],
            $data['week_start'],
            $data['plan'],
            $data['employee_ids'],
            $data['replace_drafts'],
            $request->user()->merchant->timezone,
            $request->user()->id,
        );

        // Remember the settings for next week.
        $merchant = $request->user()->merchant;
        $merchant->schedule_settings = $data['settings'];
        $merchant->save();

        return redirect()
            ->route('shifts.index', ['view' => 'week', 'date' => $data['week_start']])
            ->with('success', "{$created} shift(s) generated".($data['settings']['status'] === Shift::DRAFT ? ' as drafts. Review them, then publish.' : ' and published.'));
    }

    private function generator(Request $request): ScheduleGenerator
    {
        return new ScheduleGenerator(new ShiftScheduler($request->user()->merchant->timezone));
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $withPlan = false): array
    {
        $merchantId = $request->user()->merchant_id;
        $rules = [
            'week_start' => ['required', 'date_format:Y-m-d'],
            'employee_ids' => ['required', 'array', 'min:1', 'max:200'],
            'employee_ids.*' => ['integer', 'distinct', Rule::exists('employees', 'id')->where('merchant_id', $merchantId)->where('status', 'active')->whereNull('deleted_at')],
            'replace_drafts' => ['required', 'boolean'],
            'seed' => ['nullable', 'integer', 'min:1'],
            'settings' => ['required', 'array'],
            'settings.start_times' => ['required', 'array', 'min:1', 'max:12'],
            'settings.start_times.*' => ['required', 'date_format:H:i', 'distinct'],
            'settings.work_hours' => ['required', 'numeric', 'min:1', 'max:16'],
            'settings.break_minutes' => ['required', 'integer', 'min:0', 'max:240'],
            'settings.days_off' => ['required', 'integer', 'min:0', 'max:6'],
            'settings.consecutive_days_off' => ['required', 'boolean'],
            'settings.open_days' => ['required', 'array', 'min:1', 'max:7'],
            'settings.open_days.*' => ['integer', 'between:0,6', 'distinct'],
            'settings.status' => ['required', Rule::in([Shift::DRAFT, Shift::PUBLISHED])],
        ];

        if ($withPlan) {
            $rules += [
                'plan' => ['present', 'array', 'max:1500'],
                'plan.*.employee_id' => ['required', 'integer'],
                'plan.*.date' => ['required', 'date_format:Y-m-d'],
                'plan.*.start_time' => ['required', 'date_format:H:i'],
            ];
        }

        $data = $request->validate($rules, [
            'employee_ids.required' => 'Choose at least one employee.',
            'settings.start_times.required' => 'Add at least one start time.',
            'settings.start_times.*.distinct' => 'Each start time can only be listed once.',
            'settings.open_days.required' => 'Choose at least one day the store is open.',
        ]);

        if (Carbon::parse($data['week_start'])->dayOfWeek !== Carbon::MONDAY) {
            throw ValidationException::withMessages(['week_start' => 'Weeks start on Monday.']);
        }

        $data['employee_ids'] = array_map('intval', $data['employee_ids']);
        $data['settings'] = [
            'start_times' => array_values(collect($data['settings']['start_times'])->sort()->all()),
            'work_hours' => (float) $data['settings']['work_hours'],
            'break_minutes' => (int) $data['settings']['break_minutes'],
            'days_off' => (int) $data['settings']['days_off'],
            'consecutive_days_off' => (bool) $data['settings']['consecutive_days_off'],
            'open_days' => array_map('intval', $data['settings']['open_days']),
            'status' => $data['settings']['status'],
        ];
        if (isset($data['plan'])) {
            $data['plan'] = array_map(fn ($e) => [
                'employee_id' => (int) $e['employee_id'],
                'date' => $e['date'],
                'start_time' => $e['start_time'],
            ], $data['plan']);
        }

        return $data;
    }
}
