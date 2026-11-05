<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * A person who works for the store, with or without a staff login.
 */
class Employee extends Model
{
    use BelongsToMerchant, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'branch_id',
        'employee_no',
        'name',
        'position',
        'email',
        'phone',
        'hired_on',
        'status',
        'sss_no',
        'philhealth_no',
        'pagibig_no',
        'tin',
    ];

    /**
     * Government numbers never leave the server unless asked for explicitly.
     *
     * @var list<string>
     */
    protected $hidden = ['sss_no', 'philhealth_no', 'pagibig_no', 'tin'];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'hired_on' => 'date',
            'sss_no' => 'encrypted',
            'philhealth_no' => 'encrypted',
            'pagibig_no' => 'encrypted',
            'tin' => 'encrypted',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function salaryRates(): HasMany
    {
        return $this->hasMany(SalaryRate::class)->orderByDesc('effective_from');
    }

    public function shifts(): HasMany
    {
        return $this->hasMany(Shift::class);
    }

    public function attendance(): HasMany
    {
        return $this->hasMany(AttendanceRecord::class);
    }

    /**
     * The salary in force on a date (the latest one starting on or before it).
     */
    public function salaryOn(Carbon|string $date): ?SalaryRate
    {
        return $this->salaryRates()
            ->whereDate('effective_from', '<=', Carbon::parse($date)->toDateString())
            ->first();
    }

    /**
     * Whether a finalized (approved or paid) payroll already covers this day,
     * in which case its attendance can no longer change.
     */
    public function isPaidThrough(string $date): bool
    {
        return PayrollItem::query()
            ->where('employee_id', $this->id)
            ->whereDate('period_start', '<=', $date)
            ->whereDate('period_end', '>=', $date)
            ->whereHas('run', fn ($q) => $q->whereIn('status', [PayrollRun::APPROVED, PayrollRun::PAID]))
            ->exists();
    }

    /** The branch they work at (null: every branch). */
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
