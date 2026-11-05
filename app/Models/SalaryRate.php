<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An employee's pay from a date onward. Rows are never edited once a
 * finalized payroll used them; a change is a new row with a later date.
 */
class SalaryRate extends Model
{
    use BelongsToMerchant;

    public const PAY_TYPES = ['monthly', 'daily', 'hourly'];

    public const FREQUENCIES = ['weekly', 'semi_monthly', 'monthly'];

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'employee_id',
        'pay_type',
        'rate_cents',
        'pay_frequency',
        'allowance_cents',
        'overtime_rate_bps',
        'effective_from',
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
            'rate_cents' => 'integer',
            'allowance_cents' => 'integer',
            'overtime_rate_bps' => 'integer',
            'effective_from' => 'date',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
