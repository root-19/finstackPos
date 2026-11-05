<?php

namespace App\Services\Workforce;

use App\Models\Employee;
use App\Models\Merchant;
use App\Models\Shift;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Random\Engine\Mt19937;
use Random\Randomizer;

/**
 * Builds a one-week schedule for many employees from the store's settings:
 * start times are shared out evenly, and days off are spread so the same
 * days are never everyone's day off. The plan is only a proposal; the
 * manager can edit it before it is saved as ordinary shifts.
 */
class ScheduleGenerator
{
    public const DEFAULTS = [
        'start_times' => ['08:00', '09:00', '10:00'],
        'work_hours' => 8,
        'break_minutes' => 60,
        'days_off' => 2,
        'consecutive_days_off' => true,
        // 0 = Sunday … 6 = Saturday: the days the store needs people.
        'open_days' => [0, 1, 2, 3, 4, 5, 6],
        'status' => Shift::DRAFT,
    ];

    public function __construct(private readonly ShiftScheduler $scheduler) {}

    /**
     * @return array<string, mixed>
     */
    public static function settingsFor(Merchant $merchant): array
    {
        return array_merge(self::DEFAULTS, $merchant->schedule_settings ?? []);
    }

    /**
     * The seven dates of the week starting on $weekStart.
     *
     * @return list<string>
     */
    public static function weekDates(string $weekStart): array
    {
        $start = Carbon::parse($weekStart);

        return array_map(fn ($i) => $start->copy()->addDays($i)->toDateString(), range(0, 6));
    }

    /**
     * Proposed start time (or null for a day off) per employee and date.
     *
     * @param  array<string, mixed>  $settings
     * @param  Collection<int, Employee>  $employees
     * @return list<array{employee_id: int, cells: array<string, string|null>}>
     */
    public function plan(array $settings, string $weekStart, Collection $employees, int $seed): array
    {
        $random = new Randomizer(new Mt19937($seed));
        $dates = self::weekDates($weekStart);
        $openIdx = array_values(array_filter(
            array_keys($dates),
            fn ($i) => in_array(Carbon::parse($dates[$i])->dayOfWeek, $settings['open_days'], true),
        ));
        $times = array_values($settings['start_times']);
        $offCount = array_fill_keys($openIdx, 0);
        $order = $random->shuffleArray($employees->values()->all());
        $plan = [];

        foreach ($order as $n => $employee) {
            $off = $this->pickDaysOff($openIdx, $offCount, min((int) $settings['days_off'], count($openIdx)), (bool) $settings['consecutive_days_off'], $random);
            foreach ($off as $i) {
                $offCount[$i]++;
            }

            // Round-robin over the shuffled order shares the start times out evenly.
            $time = $times[$n % count($times)];
            $cells = [];
            foreach ($dates as $i => $date) {
                $cells[$date] = in_array($i, $openIdx, true) && ! in_array($i, $off, true) ? $time : null;
            }

            $plan[] = ['employee_id' => $employee->id, 'cells' => $cells];
        }

        // Back in the order the employees were given.
        $position = $employees->values()->pluck('id')->flip();
        usort($plan, fn ($a, $b) => $position[$a['employee_id']] <=> $position[$b['employee_id']]);

        return $plan;
    }

    /**
     * Days already scheduled (other than drafts that will be replaced), so the
     * preview can show them instead of proposing a clashing shift.
     *
     * @param  list<int>  $employeeIds
     * @return array<int, array<string, string>> employee id => date => "08:00–17:00 (published)"
     */
    public function existing(array $employeeIds, string $weekStart, bool $replaceDrafts, string $tz): array
    {
        $dates = self::weekDates($weekStart);
        $out = [];

        $this->weekShifts($employeeIds, $dates, $tz)
            ->when($replaceDrafts, fn ($q) => $q->where('status', '!=', Shift::DRAFT))
            ->get()
            ->each(function (Shift $s) use (&$out, $tz) {
                $start = $s->starts_at->copy()->setTimezone($tz);
                $end = $s->ends_at->copy()->setTimezone($tz);
                $out[$s->employee_id][$start->toDateString()] = $start->format('H:i').'–'.$end->format('H:i')." ({$s->status})";
            });

        return $out;
    }

    /**
     * Save the (possibly edited) plan as shifts, all-or-nothing.
     *
     * @param  array<string, mixed>  $settings
     * @param  list<array{employee_id: int, date: string, start_time: string}>  $entries
     * @return int shifts created
     *
     * @throws ValidationException
     */
    public function save(array $settings, string $weekStart, array $entries, array $employeeIds, bool $replaceDrafts, string $tz, ?int $userId): int
    {
        $dates = self::weekDates($weekStart);
        $length = (int) round($settings['work_hours'] * 60) + (int) $settings['break_minutes'];
        $positions = Employee::query()->whereKey($employeeIds)->pluck('position', 'id');

        return DB::transaction(function () use ($settings, $dates, $entries, $employeeIds, $replaceDrafts, $tz, $userId, $length, $positions) {
            if ($replaceDrafts) {
                $this->weekShifts($employeeIds, $dates, $tz)->where('status', Shift::DRAFT)->delete();
            }

            $seriesId = (string) Str::uuid();
            $problems = [];
            $created = 0;

            foreach ($entries as $entry) {
                $end = Carbon::createFromFormat('H:i', $entry['start_time'])->addMinutes($length)->format('H:i');
                [$start, $finish] = $this->scheduler->window($entry['date'], $entry['start_time'], $end);

                // Also catches clashes between two entries of this same plan.
                $clash = $this->scheduler->conflicts($entry['employee_id'], $start, $finish)->first();
                if ($clash) {
                    $problems[] = Employee::find($entry['employee_id'])?->name." on {$entry['date']}";

                    continue;
                }

                $shift = new Shift([
                    'employee_id' => $entry['employee_id'],
                    'starts_at' => $start,
                    'ends_at' => $finish,
                    'break_minutes' => (int) $settings['break_minutes'],
                    'position' => $positions[$entry['employee_id']] ?? null,
                    'notes' => null,
                    'status' => $settings['status'],
                    'series_id' => $seriesId,
                ]);
                $shift->created_by = $userId;
                $shift->save();
                $created++;
            }

            if ($problems) {
                // Rolls back everything, including replaced drafts.
                throw ValidationException::withMessages([
                    'plan' => 'These would overlap shifts already on the schedule: '.implode(', ', array_unique($problems)).'. Set those days to Off or move the existing shifts.',
                ]);
            }

            return $created;
        });
    }

    /**
     * Non-cancelled shifts of these employees that start in the week.
     *
     * @param  list<int>  $employeeIds
     * @param  list<string>  $dates
     */
    private function weekShifts(array $employeeIds, array $dates, string $tz): Builder
    {
        return Shift::query()
            ->whereIn('employee_id', $employeeIds)
            ->where('status', '!=', Shift::CANCELLED)
            ->where('starts_at', '>=', Carbon::parse($dates[0], $tz)->startOfDay()->utc())
            ->where('starts_at', '<=', Carbon::parse($dates[6], $tz)->endOfDay()->utc());
    }

    /**
     * Choose the days off where the fewest people are off already, breaking
     * ties at random so each run shuffles who gets which day.
     *
     * @param  list<int>  $openIdx  week-day indexes the store is open
     * @param  array<int, int>  $offCount  people already off per day index
     * @return list<int>
     */
    private function pickDaysOff(array $openIdx, array $offCount, int $count, bool $consecutive, Randomizer $random): array
    {
        if ($count <= 0) {
            return [];
        }

        if ($consecutive) {
            // Every run of $count open days, wrapping round the week.
            $options = [];
            $n = count($openIdx);
            for ($s = 0; $s < $n; $s++) {
                $days = array_map(fn ($k) => $openIdx[($s + $k) % $n], range(0, $count - 1));
                $options[] = ['days' => $days, 'score' => [max(array_map(fn ($d) => $offCount[$d], $days)), array_sum(array_map(fn ($d) => $offCount[$d], $days))]];
            }
            $best = min(array_column($options, 'score'));
            $ties = array_values(array_filter($options, fn ($o) => $o['score'] === $best));

            return $ties[$random->getInt(0, count($ties) - 1)]['days'];
        }

        $days = $random->shuffleArray($openIdx);
        usort($days, fn ($a, $b) => $offCount[$a] <=> $offCount[$b]); // stable: keeps the shuffle among ties

        return array_slice($days, 0, $count);
    }
}
