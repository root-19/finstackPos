<?php

namespace App\Services\Workforce;

use App\Models\Shift;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Turns store-local dates and times into UTC shifts, handles overnight
 * shifts and weekly repeats, and refuses overlapping shifts for the same
 * employee.
 */
class ShiftScheduler
{
    /** Longest shift we accept, in minutes. */
    public const MAX_MINUTES = 24 * 60;

    /** Upper bound on shifts created by one repeat. */
    public const MAX_REPEATS = 200;

    public function __construct(private readonly string $timezone) {}

    /**
     * A shift window in UTC. An end time at or before the start means the
     * shift ends the next day.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    public function window(string $date, string $start, string $end): array
    {
        $startsAt = Carbon::createFromFormat('Y-m-d H:i', "{$date} {$start}", $this->timezone);
        $endsAt = Carbon::createFromFormat('Y-m-d H:i', "{$date} {$end}", $this->timezone);

        if ($endsAt->lte($startsAt)) {
            $endsAt->addDay();
        }

        return [$startsAt->utc(), $endsAt->utc()];
    }

    /**
     * Active shifts of the employee that overlap the window.
     *
     * @return Collection<int, Shift>
     */
    public function conflicts(int $employeeId, Carbon $start, Carbon $end, ?int $ignoreId = null): Collection
    {
        return Shift::query()
            ->where('employee_id', $employeeId)
            ->where('status', '!=', Shift::CANCELLED)
            ->where('starts_at', '<', $end)
            ->where('ends_at', '>', $start)
            ->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))
            ->get();
    }

    /**
     * Create one shift, or a weekly series, all-or-nothing.
     *
     * @param  array<string, mixed>  $data  validated input
     * @return Collection<int, Shift>
     *
     * @throws ValidationException
     */
    public function create(array $data, ?int $userId): Collection
    {
        $dates = $this->dates($data['date'], $data['repeat_weekdays'] ?? [], $data['repeat_until'] ?? null);
        $windows = [];
        $problems = [];

        foreach ($dates as $date) {
            [$start, $end] = $this->window($date, $data['start_time'], $data['end_time']);
            $this->validateLength($start, $end, (int) $data['break_minutes']);

            foreach ($this->conflicts((int) $data['employee_id'], $start, $end) as $clash) {
                $problems[] = $this->describe($date, $clash);
            }
            $windows[] = [$start, $end];
        }

        if ($problems) {
            throw ValidationException::withMessages([
                'start_time' => 'Overlaps an existing shift: '.implode('; ', array_unique($problems)).'.',
            ]);
        }

        $seriesId = count($windows) > 1 ? (string) Str::uuid() : null;

        return collect($windows)->map(function ($window) use ($data, $seriesId, $userId) {
            $shift = new Shift([
                'employee_id' => $data['employee_id'],
                'starts_at' => $window[0],
                'ends_at' => $window[1],
                'break_minutes' => $data['break_minutes'],
                'position' => $data['position'] ?? null,
                'notes' => $data['notes'] ?? null,
                'status' => $data['status'],
                'series_id' => $seriesId,
            ]);
            $shift->created_by = $userId;
            $shift->save();

            return $shift;
        });
    }

    /**
     * @param  array<string, mixed>  $data  validated input
     *
     * @throws ValidationException
     */
    public function update(Shift $shift, array $data): void
    {
        [$start, $end] = $this->window($data['date'], $data['start_time'], $data['end_time']);
        $this->validateLength($start, $end, (int) $data['break_minutes']);

        $clashes = $this->conflicts((int) $data['employee_id'], $start, $end, $shift->id);
        if ($clashes->isNotEmpty()) {
            throw ValidationException::withMessages([
                'start_time' => 'Overlaps an existing shift: '.$clashes->map(fn ($c) => $this->describe($data['date'], $c))->implode('; ').'.',
            ]);
        }

        $shift->update([
            'employee_id' => $data['employee_id'],
            'starts_at' => $start,
            'ends_at' => $end,
            'break_minutes' => $data['break_minutes'],
            'position' => $data['position'] ?? null,
            'notes' => $data['notes'] ?? null,
            'status' => $data['status'],
        ]);
    }

    /**
     * @param  list<int>  $weekdays  0 = Sunday … 6 = Saturday
     * @return list<string>
     *
     * @throws ValidationException
     */
    private function dates(string $date, array $weekdays, ?string $until): array
    {
        if (! $weekdays || ! $until) {
            return [$date];
        }

        $dates = [];
        for ($day = Carbon::parse($date); $day->lte(Carbon::parse($until)); $day->addDay()) {
            if (in_array($day->dayOfWeek, $weekdays, true)) {
                $dates[] = $day->toDateString();
            }
        }

        if (! $dates) {
            throw ValidationException::withMessages(['repeat_weekdays' => 'None of the chosen days fall between the start and end dates.']);
        }
        if (count($dates) > self::MAX_REPEATS) {
            throw ValidationException::withMessages(['repeat_until' => 'That repeat creates more than '.self::MAX_REPEATS.' shifts. Choose an earlier end date.']);
        }

        return $dates;
    }

    /**
     * @throws ValidationException
     */
    private function validateLength(Carbon $start, Carbon $end, int $breakMinutes): void
    {
        $minutes = (int) $start->diffInMinutes($end);

        if ($minutes > self::MAX_MINUTES) {
            throw ValidationException::withMessages(['end_time' => 'A shift cannot be longer than 24 hours.']);
        }
        if ($breakMinutes >= $minutes) {
            throw ValidationException::withMessages(['break_minutes' => 'The break must be shorter than the shift.']);
        }
    }

    private function describe(string $date, Shift $clash): string
    {
        $local = fn (Carbon $t) => $t->copy()->setTimezone($this->timezone)->format('M j g:i A');

        return "{$date} clashes with {$local($clash->starts_at)} – {$local($clash->ends_at)}";
    }
}
