<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttendanceRecord extends Model
{
    use BelongsToMerchant;

    public const PENDING = 'pending';

    public const APPROVED = 'approved';

    public const REJECTED = 'rejected';

    /** A normal working day without a shift counts this many minutes as regular time. */
    public const STANDARD_DAY_MINUTES = 480;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'employee_id',
        'shift_id',
        'work_date',
        'type',
        'clock_in_at',
        'clock_out_at',
        'break_minutes',
        'status',
        'source',
        'note',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'work_date' => 'date',
            'clock_in_at' => 'datetime',
            'clock_out_at' => 'datetime',
            'break_minutes' => 'integer',
            'approved_at' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /**
     * Worked, regular, overtime, and late minutes for this record.
     * Regular time is the scheduled shift (or a standard 8-hour day).
     *
     * @return array{worked: int, regular: int, overtime: int, late: int, scheduled: int|null}
     */
    public function minutes(): array
    {
        if ($this->type !== 'worked' || ! $this->clock_in_at || ! $this->clock_out_at) {
            return ['worked' => 0, 'regular' => 0, 'overtime' => 0, 'late' => 0, 'scheduled' => null];
        }

        $worked = max(0, (int) $this->clock_in_at->diffInMinutes($this->clock_out_at) - $this->break_minutes);
        $scheduled = $this->shift?->netMinutes();
        $regularCap = $scheduled ?? self::STANDARD_DAY_MINUTES;
        $late = $this->shift && $this->clock_in_at->gt($this->shift->starts_at)
            ? (int) $this->shift->starts_at->diffInMinutes($this->clock_in_at)
            : 0;

        return [
            'worked' => $worked,
            'regular' => min($worked, $regularCap),
            'overtime' => max(0, $worked - $regularCap),
            'late' => $late,
            'scheduled' => $scheduled,
        ];
    }
}
