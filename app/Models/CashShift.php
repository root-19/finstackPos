<?php

namespace App\Models;

use App\Enums\PaymentMethod;
use App\Models\Concerns\BelongsToMerchant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One cashier's shift on one register: opened with a starting float, cash
 * moved in or out with a reason, closed with a blind count. Made on the
 * register (offline too) and uploaded by client_uuid, like sales.
 */
class CashShift extends Model
{
    use BelongsToMerchant;

    protected $fillable = ['client_uuid', 'terminal', 'opened_at', 'closed_at', 'opening_cash_cents', 'cash_moves', 'counted_cash_cents'];

    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime',
            'closed_at' => 'datetime',
            'opening_cash_cents' => 'integer',
            'counted_cash_cents' => 'integer',
            'cash_moves' => 'array',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function openedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by');
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    public function isOpen(): bool
    {
        return $this->closed_at === null;
    }

    /**
     * The shift's X-reading (while open) or shift report (once closed):
     * sales by payment method, VAT breakdown, voids, refunds paid in cash at
     * this branch during the shift, cash moved in and out, and the cash that
     * should be in the drawer against what was counted.
     *
     * @return array<string, mixed>
     */
    public function report(): array
    {
        $sales = Sale::withoutGlobalScopes()->where('cash_shift_id', $this->id)->get();
        $counted = $sales->where('status', '!=', Sale::VOIDED);
        $voided = $sales->where('status', Sale::VOIDED);

        $byMethod = collect(PaymentMethod::cases())->mapWithKeys(fn (PaymentMethod $m) => [$m->value => [
            'count' => $counted->where('payment_method', $m)->count(),
            'total_cents' => (int) $counted->where('payment_method', $m)->sum('total_cents'),
        ]])->filter(fn ($row) => $row['count'] > 0);

        $end = $this->closed_at ?? now();
        $cashRefunds = (int) SaleRefund::withoutGlobalScopes()
            ->where('merchant_id', $this->merchant_id)
            ->when($this->branch_id, fn ($q) => $q->where('branch_id', $this->branch_id))
            ->where('method', PaymentMethod::Cash->value)
            ->whereBetween('refunded_at', [$this->opened_at, $end])
            ->sum('amount_cents');

        $moves = collect($this->cash_moves ?? []);
        $cashIn = (int) $moves->where('type', 'in')->sum('amount_cents');
        $cashOut = (int) $moves->where('type', 'out')->sum('amount_cents');
        $cashSales = (int) $counted->where('payment_method', PaymentMethod::Cash)->sum('total_cents');
        $expected = $this->opening_cash_cents + $cashSales + $cashIn - $cashOut - $cashRefunds;

        $vatExemptSales = $counted->filter(fn (Sale $s) => $s->vat_exempt_cents > 0 || $s->discount_type !== null);

        return [
            'sales_count' => $counted->count(),
            'gross_cents' => (int) $counted->sum('subtotal_cents'),
            'net_cents' => (int) $counted->sum('total_cents'),
            'by_method' => $byMethod,
            'vat' => [
                'vatable_cents' => (int) $counted->reject(fn (Sale $s) => $vatExemptSales->contains($s))->sum(fn (Sale $s) => $s->total_cents - $s->service_charge_cents - $s->tax_cents),
                'vat_cents' => (int) $counted->sum('tax_cents'),
                'vat_exempt_cents' => (int) $vatExemptSales->sum(fn (Sale $s) => $s->subtotal_cents - $s->vat_exempt_cents),
                'vat_removed_cents' => (int) $counted->sum('vat_exempt_cents'),
            ],
            'discounts' => [
                'senior_count' => $counted->where('discount_type', 'senior')->count(),
                'senior_cents' => (int) $counted->where('discount_type', 'senior')->sum('discount_cents'),
                'pwd_count' => $counted->where('discount_type', 'pwd')->count(),
                'pwd_cents' => (int) $counted->where('discount_type', 'pwd')->sum('discount_cents'),
            ],
            'service_charge_cents' => (int) $counted->sum('service_charge_cents'),
            'voids' => ['count' => $voided->count(), 'total_cents' => (int) $voided->sum('total_cents')],
            'cash' => [
                'opening_cents' => $this->opening_cash_cents,
                'sales_cents' => $cashSales,
                'in_cents' => $cashIn,
                'out_cents' => $cashOut,
                'refunds_cents' => $cashRefunds,
                'expected_cents' => $expected,
                'counted_cents' => $this->counted_cash_cents,
                'difference_cents' => $this->counted_cash_cents === null ? null : $this->counted_cash_cents - $expected,
            ],
            'moves' => $moves->values(),
        ];
    }
}
