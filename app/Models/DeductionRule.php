<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

/**
 * An admin-configured payroll deduction: a statutory contribution (SSS,
 * PhilHealth, Pag-IBIG), withholding tax, or a documented custom deduction.
 * Effective-dated; finalized payroll keeps a snapshot, so editing a rule
 * never rewrites history.
 */
class DeductionRule extends Model
{
    use BelongsToMerchant, SoftDeletes;

    public const STATUTORY = ['sss', 'philhealth', 'pagibig'];

    public const CODES = ['sss', 'philhealth', 'pagibig', 'withholding_tax', 'custom'];

    public const METHODS = ['fixed', 'percentage', 'bracket', 'tax_table'];

    public const BASES = ['monthly_basic', 'monthly_gross', 'taxable', 'period_gross'];

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'code',
        'name',
        'enabled',
        'method',
        'basis',
        'employee_rate_bps',
        'employer_rate_bps',
        'fixed_cents',
        'floor_cents',
        'ceiling_cents',
        'brackets',
        'applies_to',
        'employee_ids',
        'total_limit_cents',
        'authorization_ref',
        'effective_from',
        'verified',
        'source_note',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'verified' => 'boolean',
            'employee_rate_bps' => 'integer',
            'employer_rate_bps' => 'integer',
            'fixed_cents' => 'integer',
            'floor_cents' => 'integer',
            'ceiling_cents' => 'integer',
            'total_limit_cents' => 'integer',
            'brackets' => 'array',
            'employee_ids' => 'array',
            'effective_from' => 'date',
        ];
    }

    public function appliesTo(Employee $employee): bool
    {
        return $this->applies_to === 'all' || in_array($employee->id, $this->employee_ids ?? [], true);
    }

    /**
     * Starting templates from published Philippine guidance, inserted
     * DISABLED and UNVERIFIED: the owner must check them against current
     * circulars before turning them on. Values are editable, never fixed.
     */
    public static function insertDefaultsFor(int $merchantId): void
    {
        $now = now();
        $rows = [
            [
                'code' => 'sss',
                'name' => 'SSS contribution',
                'method' => 'percentage',
                'basis' => 'monthly_gross',
                'employee_rate_bps' => 500,
                'employer_rate_bps' => 1000,
                'floor_cents' => 500000,
                'ceiling_cents' => 3500000,
                'effective_from' => '2025-01-01',
                'source_note' => 'SSS 2025 schedule: 15% of monthly salary credit (employee 5%, employer 10%), MSC from ₱5,000 to ₱35,000. Not modeled: rounding to the MSC table and the employer EC share. Verify against the latest SSS circular.',
            ],
            [
                'code' => 'philhealth',
                'name' => 'PhilHealth contribution',
                'method' => 'percentage',
                'basis' => 'monthly_basic',
                'employee_rate_bps' => 250,
                'employer_rate_bps' => 250,
                'floor_cents' => 1000000,
                'ceiling_cents' => 10000000,
                'effective_from' => '2024-01-01',
                'source_note' => 'PhilHealth premium 5% of monthly basic salary, shared equally; income floor ₱10,000 and ceiling ₱100,000. Verify against the latest PhilHealth circular.',
            ],
            [
                'code' => 'pagibig',
                'name' => 'Pag-IBIG (HDMF) contribution',
                'method' => 'percentage',
                'basis' => 'monthly_basic',
                'employee_rate_bps' => 200,
                'employer_rate_bps' => 200,
                'floor_cents' => null,
                'ceiling_cents' => 1000000,
                'effective_from' => '2024-02-01',
                'source_note' => 'HDMF: 2% employee and 2% employer of monthly compensation up to ₱10,000. Not modeled: the 1% employee rate for pay of ₱1,500 and below. Verify against the latest HDMF circular.',
            ],
            [
                'code' => 'withholding_tax',
                'name' => 'Withholding tax',
                'method' => 'tax_table',
                'basis' => 'taxable',
                'brackets' => json_encode([
                    ['min_cents' => 0, 'max_cents' => 2083300, 'base_cents' => 0, 'rate_bps' => 0],
                    ['min_cents' => 2083300, 'max_cents' => 3333300, 'base_cents' => 0, 'rate_bps' => 1500],
                    ['min_cents' => 3333300, 'max_cents' => 6666700, 'base_cents' => 187500, 'rate_bps' => 2000],
                    ['min_cents' => 6666700, 'max_cents' => 16666700, 'base_cents' => 854180, 'rate_bps' => 2500],
                    ['min_cents' => 16666700, 'max_cents' => 66666700, 'base_cents' => 3354180, 'rate_bps' => 3000],
                    ['min_cents' => 66666700, 'max_cents' => null, 'base_cents' => 18354180, 'rate_bps' => 3500],
                ]),
                'effective_from' => '2023-01-01',
                'source_note' => 'BIR monthly withholding table under TRAIN (2023 onward), applied to monthly taxable pay (gross less mandatory employee contributions) and prorated per pay period. Does not model de minimis or other non-taxable benefits. Verify with BIR or your accountant.',
            ],
        ];

        foreach ($rows as $row) {
            DB::table('deduction_rules')->insert([
                'merchant_id' => $merchantId,
                'code' => $row['code'],
                'name' => $row['name'],
                'enabled' => false,
                'method' => $row['method'],
                'basis' => $row['basis'],
                'employee_rate_bps' => $row['employee_rate_bps'] ?? null,
                'employer_rate_bps' => $row['employer_rate_bps'] ?? null,
                'floor_cents' => $row['floor_cents'] ?? null,
                'ceiling_cents' => $row['ceiling_cents'] ?? null,
                'brackets' => $row['brackets'] ?? null,
                'applies_to' => 'all',
                'effective_from' => $row['effective_from'],
                'verified' => false,
                'source_note' => $row['source_note'],
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }
}
