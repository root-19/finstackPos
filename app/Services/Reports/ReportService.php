<?php

namespace App\Services\Reports;

use App\Models\AttendanceRecord;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Employee;
use App\Models\InventoryItem;
use App\Models\PayrollItem;
use App\Models\PayrollItemLine;
use App\Models\PayrollRun;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Shift;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Builds the Reports page from the store's own records: sales, inventory,
 * payroll, and the schedule. Every query is merchant-scoped (models use
 * BelongsToMerchant, or are reached through a scoped parent). Amounts are
 * integer centavos; days are the store's local days.
 *
 * With a branch, sales and stock are that branch's only; without one they
 * are the overall total, with a breakdown per branch.
 */
class ReportService
{
    private Carbon $from;

    private Carbon $to;

    public function __construct(private readonly string $tz, string $from, string $to, private readonly ?int $branchId = null)
    {
        $this->from = Carbon::parse($from, $tz)->startOfDay();
        $this->to = Carbon::parse($to, $tz)->endOfDay();
    }

    /** Every local date in the range, oldest first. */
    private function dates(): array
    {
        $dates = [];
        for ($d = $this->from->copy(); $d->lte($this->to); $d->addDay()) {
            $dates[] = $d->toDateString();
        }

        return $dates;
    }

    /** Sales in the range, at the chosen branch (or every branch). */
    private function salesInRange()
    {
        return Sale::query()
            ->whereBetween('sold_at', [$this->utcFrom(), $this->utcTo()])
            ->when($this->branchId, fn ($q, $b) => $q->where('branch_id', $b));
    }

    /**
     * Overall view of a store with several branches: one row per branch.
     *
     * @return \Illuminate\Support\Collection<int, Branch>|null
     */
    private function branchesToCompare()
    {
        if ($this->branchId !== null) {
            return null;
        }
        $branches = Branch::query()->orderBy('id')->get(['id', 'name']);

        return $branches->count() > 1 ? $branches : null;
    }

    private function utcFrom(): Carbon
    {
        return $this->from->copy()->utc();
    }

    private function utcTo(): Carbon
    {
        return $this->to->copy()->utc();
    }

    /**
     * @return array<string, mixed>
     */
    public function sales(): array
    {
        $sales = $this->salesInRange()
            ->get(['id', 'branch_id', 'user_id', 'payment_method', 'subtotal_cents', 'discount_type', 'discount_id_number', 'discount_customer_name', 'discount_doh_check',
                'discount_cents', 'vat_exempt_cents', 'service_charge_cents', 'tax_cents', 'total_cents', 'sold_at', 'client_uuid']);

        $daily = array_fill_keys($this->dates(), ['count' => 0, 'total_cents' => 0]);
        $hourly = array_fill(0, 24, ['count' => 0, 'total_cents' => 0]);
        $payments = [];
        $cashiers = [];
        $discounts = [];

        foreach ($sales as $sale) {
            $local = $sale->sold_at->copy()->setTimezone($this->tz);
            $day = $local->toDateString();
            $hour = (int) $local->format('G');
            $total = (int) $sale->total_cents;

            if (isset($daily[$day])) {
                $daily[$day]['count']++;
                $daily[$day]['total_cents'] += $total;
            }
            $hourly[$hour]['count']++;
            $hourly[$hour]['total_cents'] += $total;

            // Cast to the PaymentMethod enum; its string value is the key.
            $method = $sale->payment_method->value;
            $payments[$method] ??= ['count' => 0, 'total_cents' => 0];
            $payments[$method]['count']++;
            $payments[$method]['total_cents'] += $total;

            $cashiers[$sale->user_id ?? 0] ??= ['count' => 0, 'total_cents' => 0];
            $cashiers[$sale->user_id ?? 0]['count']++;
            $cashiers[$sale->user_id ?? 0]['total_cents'] += $total;

            if ($sale->discount_type) {
                $discounts[] = [
                    'date' => $local->format('Y-m-d H:i'),
                    'reference' => strtoupper(substr($sale->client_uuid, 0, 8)),
                    'type' => $sale->discount_type,
                    'customer' => $sale->discount_customer_name,
                    'id_number' => $sale->discount_id_number,
                    'doh_check' => $sale->discount_doh_check,
                    'gross_cents' => (int) $sale->subtotal_cents,
                    'vat_exempt_cents' => (int) $sale->vat_exempt_cents,
                    'discount_cents' => (int) $sale->discount_cents,
                    'total_cents' => $total,
                ];
            }
        }

        // Products and categories, from the sale lines (before sale-level discounts).
        $items = SaleItem::query()
            ->whereIn('sale_id', $sales->modelKeys())
            ->get(['product_id', 'name', 'options', 'quantity', 'line_total_cents']);
        $categoryOf = Product::withTrashed()->whereKey($items->pluck('product_id')->filter()->unique())->pluck('category_id', 'id');
        $categoryNames = Category::withTrashed()->pluck('name', 'id');

        $products = [];
        $categories = [];
        foreach ($items as $item) {
            $size = $item->options[0]['value'] ?? null;
            $key = $item->product_id.'|'.$size;
            $products[$key] ??= ['product' => $item->name, 'size' => $size, 'quantity' => 0, 'revenue_cents' => 0];
            $products[$key]['quantity'] += $item->quantity;
            $products[$key]['revenue_cents'] += (int) $item->line_total_cents;

            $category = $categoryNames[$categoryOf[$item->product_id] ?? null] ?? 'Uncategorized';
            $categories[$category] ??= ['category' => $category, 'quantity' => 0, 'revenue_cents' => 0];
            $categories[$category]['quantity'] += $item->quantity;
            $categories[$category]['revenue_cents'] += (int) $item->line_total_cents;
        }

        $names = User::query()->whereKey(array_keys($cashiers))->pluck('name', 'id');
        $count = $sales->count();
        $net = (int) $sales->sum('total_cents');

        $byBranch = $sales->groupBy('branch_id');
        $branches = $this->branchesToCompare()?->map(function (Branch $branch) use ($byBranch, $net) {
            $own = $byBranch->get($branch->id, collect());
            $total = (int) $own->sum('total_cents');

            return [
                'branch' => $branch->name,
                'count' => $own->count(),
                'gross_cents' => (int) $own->sum('subtotal_cents'),
                'discount_cents' => (int) $own->sum('discount_cents'),
                'net_cents' => $total,
                'average_cents' => $own->count() ? intdiv($total, $own->count()) : 0,
                'share_pct' => $net > 0 ? round($total / $net * 100, 1) : 0,
            ];
        })->values();

        return [
            'summary' => [
                'transactions' => $count,
                'gross_cents' => (int) $sales->sum('subtotal_cents'),
                'discount_cents' => (int) $sales->sum('discount_cents'),
                'vat_exempt_cents' => (int) $sales->sum('vat_exempt_cents'),
                'service_charge_cents' => (int) $sales->sum('service_charge_cents'),
                'tax_cents' => (int) $sales->sum('tax_cents'),
                'net_cents' => $net,
                'average_cents' => $count ? intdiv($net, $count) : 0,
                'items_sold' => (int) $items->sum('quantity'),
            ],
            'daily' => collect($daily)->map(fn ($v, $date) => ['date' => $date, ...$v])->values(),
            'hourly' => collect($hourly)->map(fn ($v, $hour) => ['hour' => $hour, ...$v])->values(),
            'payments' => collect($payments)->map(fn ($v, $method) => ['method' => $method, ...$v])->sortByDesc('total_cents')->values(),
            'cashiers' => collect($cashiers)->map(fn ($v, $id) => ['cashier' => $names[$id] ?? 'Removed user', ...$v])->sortByDesc('total_cents')->values(),
            'products' => collect($products)->sortByDesc('revenue_cents')->values(),
            'categories' => collect($categories)->sortByDesc('revenue_cents')->values(),
            'discounts' => $discounts,
            'branches' => $branches,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function inventory(bool $withSales): array
    {
        $items = InventoryItem::query()->with(['supplier:id,name', 'stocks'])->orderBy('name')->get();
        $compare = $this->branchesToCompare();
        // Value per branch, from each branch's own stock (before showing one branch).
        $valueAt = [];
        foreach ($items as $i) {
            foreach ($i->stocks as $s) {
                $valueAt[$s->branch_id] = ($valueAt[$s->branch_id] ?? 0) + (int) round(max($s->quantity, 0) * $i->unit_cost_cents);
            }
        }
        $items->each(fn (InventoryItem $i) => $i->atBranch($this->branchId));
        $moves = StockMovement::query()
            ->whereBetween('created_at', [$this->utcFrom(), $this->utcTo()])
            ->when($this->branchId, fn ($q, $b) => $q->where('branch_id', $b))
            ->selectRaw('branch_id, inventory_item_id, type, sum(quantity_change) as qty, sum(total_cost_cents) as cost, count(*) as moves')
            ->groupBy('branch_id', 'inventory_item_id', 'type')
            ->get();

        $byItem = [];
        $byType = [];
        $costAt = [];
        foreach ($moves as $m) {
            $byItem[$m->inventory_item_id][$m->type] = ($byItem[$m->inventory_item_id][$m->type] ?? 0) + (float) $m->qty;
            $byType[$m->type] ??= ['cost_cents' => 0, 'count' => 0];
            $byType[$m->type]['cost_cents'] += (int) $m->cost;
            $byType[$m->type]['count'] += (int) $m->moves;
            $costAt[$m->branch_id][$m->type] = ($costAt[$m->branch_id][$m->type] ?? 0) + (int) $m->cost;
        }

        $rows = $items->map(fn (InventoryItem $i) => [
            'name' => $i->name,
            'category' => $i->category,
            'unit' => $i->unit,
            'received' => round($byItem[$i->id][StockMovement::PURCHASE] ?? 0, 3),
            'sold' => round(-($byItem[$i->id][StockMovement::SALE] ?? 0), 3),
            'waste' => round(-($byItem[$i->id][StockMovement::WASTE] ?? 0), 3),
            'used' => round(-($byItem[$i->id][StockMovement::USAGE] ?? 0), 3),
            'returned' => round(-($byItem[$i->id][StockMovement::RETURN] ?? 0), 3),
            'adjusted' => round($byItem[$i->id][StockMovement::ADJUSTMENT] ?? 0, 3),
            'on_hand' => $i->quantity,
            'unit_cost_cents' => $i->unit_cost_cents,
            'value_cents' => $i->valueCents(),
            'status' => $i->is_active ? $i->stockStatus() : 'inactive',
            'supplier' => $i->supplier?->name,
        ]);

        $cogs = $byType[StockMovement::SALE]['cost_cents'] ?? 0;
        $profit = null;
        if ($withSales) {
            // Sales without tax and service charge, against the recipe cost of what was sold.
            $sales = $this->salesInRange()
                ->selectRaw('sum(total_cents) as total, sum(tax_cents) as tax, sum(service_charge_cents) as service')
                ->first();
            $revenue = (int) $sales->total - (int) $sales->tax - (int) $sales->service;
            $profit = [
                'revenue_cents' => $revenue,
                'cogs_cents' => $cogs,
                'gross_profit_cents' => $revenue - $cogs,
                'margin_pct' => $revenue > 0 ? round(($revenue - $cogs) / $revenue * 100, 1) : null,
            ];
        }

        return [
            'summary' => [
                'items' => $items->where('is_active', true)->count(),
                'value_cents' => $rows->sum('value_cents'),
                'low' => $rows->where('status', 'low')->count(),
                'out' => $rows->where('status', 'out')->count(),
                'purchases_cents' => $byType[StockMovement::PURCHASE]['cost_cents'] ?? 0,
                'cogs_cents' => $cogs,
                'waste_cents' => $byType[StockMovement::WASTE]['cost_cents'] ?? 0,
                'usage_cents' => $byType[StockMovement::USAGE]['cost_cents'] ?? 0,
            ],
            'profit' => $profit,
            'branches' => $compare?->map(fn (Branch $b) => [
                'branch' => $b->name,
                'value_cents' => $valueAt[$b->id] ?? 0,
                'purchases_cents' => $costAt[$b->id][StockMovement::PURCHASE] ?? 0,
                'cogs_cents' => $costAt[$b->id][StockMovement::SALE] ?? 0,
                'waste_cents' => $costAt[$b->id][StockMovement::WASTE] ?? 0,
                'usage_cents' => $costAt[$b->id][StockMovement::USAGE] ?? 0,
            ])->values(),
            'items' => $rows->values(),
            'reorder' => $rows->filter(fn ($r) => in_array($r['status'], ['low', 'out'], true))->values(),
        ];
    }

    /**
     * Payroll runs whose pay period ends in the range.
     *
     * @return array<string, mixed>
     */
    public function payroll(bool $includeDrafts, bool $withSales): array
    {
        $statuses = $includeDrafts
            ? [PayrollRun::DRAFT, PayrollRun::REVIEW, PayrollRun::APPROVED, PayrollRun::PAID]
            : [PayrollRun::APPROVED, PayrollRun::PAID];

        $runs = PayrollRun::query()
            ->withCount('items')
            ->whereIn('status', $statuses)
            ->whereDate('period_end', '>=', $this->from->toDateString())
            ->whereDate('period_end', '<=', $this->to->toDateString())
            ->orderBy('period_start')
            ->get();

        $items = PayrollItem::query()->with(['employee', 'lines'])->whereIn('payroll_run_id', $runs->modelKeys())->get();

        $employees = [];
        $remit = [];
        foreach ($items as $item) {
            $id = $item->employee_id;
            $employees[$id] ??= [
                'employee' => $item->employee?->name ?? 'Former employee', 'position' => $item->employee?->position,
                'payslips' => 0, 'basic_cents' => 0, 'earnings_cents' => 0, 'gross_cents' => 0, 'sss_cents' => 0,
                'philhealth_cents' => 0, 'pagibig_cents' => 0, 'tax_cents' => 0, 'other_deductions_cents' => 0,
                'deductions_cents' => 0, 'net_cents' => 0, 'employer_cents' => 0,
            ];
            $row = &$employees[$id];
            $row['payslips']++;
            $row['basic_cents'] += $item->basic_cents;
            $row['earnings_cents'] += $item->earnings_cents;
            $row['gross_cents'] += $item->gross_cents;
            $row['deductions_cents'] += $item->deductions_cents;
            $row['net_cents'] += $item->net_cents;
            $row['employer_cents'] += $item->employer_cents;

            $statutory = 0;
            foreach (['sss', 'philhealth', 'pagibig', 'withholding_tax'] as $code) {
                $ee = $item->lineTotal(PayrollItemLine::DEDUCTION, $code);
                $er = $item->lineTotal(PayrollItemLine::EMPLOYER, $code);
                $row[$code === 'withholding_tax' ? 'tax_cents' : "{$code}_cents"] += $ee;
                $statutory += $ee;
                $remit[$code] ??= ['employee_cents' => 0, 'employer_cents' => 0];
                $remit[$code]['employee_cents'] += $ee;
                $remit[$code]['employer_cents'] += $er;
            }
            $row['other_deductions_cents'] += $item->deductions_cents - $statutory;
            unset($row);
        }

        $labels = ['sss' => 'SSS', 'philhealth' => 'PhilHealth', 'pagibig' => 'Pag-IBIG', 'withholding_tax' => 'Withholding tax (BIR)'];
        $gross = (int) $runs->sum('gross_cents');
        $employer = (int) $runs->sum('employer_cents');
        $sales = $withSales ? (int) $this->salesInRange()->sum('total_cents') : null;

        return [
            'summary' => [
                'runs' => $runs->count(),
                'payslips' => $items->count(),
                'gross_cents' => $gross,
                'deductions_cents' => (int) $runs->sum('deductions_cents'),
                'net_cents' => (int) $runs->sum('net_cents'),
                'employer_cents' => $employer,
                'labor_cost_cents' => $gross + $employer,
                'sales_cents' => $sales,
                'labor_pct' => $sales ? round(($gross + $employer) / $sales * 100, 1) : null,
            ],
            'runs' => $runs->map(fn (PayrollRun $r) => [
                'id' => $r->id,
                'period' => $r->period_start->toDateString().' – '.$r->period_end->toDateString(),
                'frequency' => $r->pay_frequency,
                'status' => $r->status,
                'employees' => $r->items_count,
                'gross_cents' => $r->gross_cents,
                'deductions_cents' => $r->deductions_cents,
                'net_cents' => $r->net_cents,
                'employer_cents' => $r->employer_cents,
            ])->values(),
            'employees' => collect($employees)->sortBy('employee')->values(),
            'remittances' => collect($remit)->map(fn ($v, $code) => [
                'agency' => $labels[$code],
                ...$v,
                'total_cents' => $v['employee_cents'] + $v['employer_cents'],
            ])->values(),
        ];
    }

    /**
     * Shifts scheduled and attendance in the range, per employee and per day.
     *
     * @return array<string, mixed>
     */
    public function workforce(bool $withAttendance): array
    {
        $shifts = Shift::query()
            ->where('status', '!=', Shift::CANCELLED)
            ->whereBetween('starts_at', [$this->utcFrom(), $this->utcTo()])
            ->get();
        $records = $withAttendance
            ? AttendanceRecord::query()
                ->whereDate('work_date', '>=', $this->from->toDateString())
                ->whereDate('work_date', '<=', $this->to->toDateString())
                ->with('shift')
                ->get()
            : collect();

        $names = Employee::withTrashed()->whereKey($shifts->pluck('employee_id')->merge($records->pluck('employee_id'))->unique())->get(['id', 'name', 'position']);
        $daily = array_fill_keys($this->dates(), ['shifts' => 0, 'scheduled_minutes' => 0, 'worked_minutes' => 0, 'absences' => 0]);
        $people = [];
        $blank = ['shifts' => 0, 'drafts' => 0, 'scheduled_minutes' => 0, 'days_worked' => 0, 'worked_minutes' => 0,
            'overtime_minutes' => 0, 'late_minutes' => 0, 'absences' => 0, 'pending' => 0, 'attended_shifts' => 0];

        foreach ($shifts as $s) {
            $people[$s->employee_id] ??= $blank;
            $people[$s->employee_id]['shifts']++;
            $people[$s->employee_id]['drafts'] += $s->status === Shift::DRAFT ? 1 : 0;
            $people[$s->employee_id]['scheduled_minutes'] += $s->netMinutes();
            $day = $s->starts_at->copy()->setTimezone($this->tz)->toDateString();
            if (isset($daily[$day])) {
                $daily[$day]['shifts']++;
                $daily[$day]['scheduled_minutes'] += $s->netMinutes();
            }
        }

        $attendedShiftIds = [];
        foreach ($records as $r) {
            $people[$r->employee_id] ??= $blank;
            $row = &$people[$r->employee_id];
            $day = $r->work_date->toDateString();
            if ($r->status === AttendanceRecord::PENDING) {
                $row['pending']++;
            }
            if ($r->status !== AttendanceRecord::APPROVED) {
                unset($row);

                continue;
            }
            if ($r->type === 'absent') {
                $row['absences']++;
                if (isset($daily[$day])) {
                    $daily[$day]['absences']++;
                }
                unset($row);

                continue;
            }
            $m = $r->minutes();
            $row['days_worked']++;
            $row['worked_minutes'] += $m['worked'];
            $row['overtime_minutes'] += $m['overtime'];
            $row['late_minutes'] += $m['late'];
            if ($r->shift_id && ! isset($attendedShiftIds[$r->shift_id])) {
                $attendedShiftIds[$r->shift_id] = true;
                $row['attended_shifts']++;
            }
            if (isset($daily[$day])) {
                $daily[$day]['worked_minutes'] += $m['worked'];
            }
            unset($row);
        }

        $rows = collect($people)->map(function ($v, $id) use ($names, $withAttendance) {
            $e = $names->firstWhere('id', $id);
            // Of the published shifts that already ended, how many were attended.
            $rate = $withAttendance && $v['shifts'] - $v['drafts'] > 0 ? round($v['attended_shifts'] / ($v['shifts'] - $v['drafts']) * 100) : null;

            return ['employee' => $e?->name ?? 'Former employee', 'position' => $e?->position, ...$v, 'attendance_rate' => $rate];
        })->sortBy('employee')->values();

        return [
            'summary' => [
                'shifts' => $shifts->count(),
                'drafts' => $shifts->where('status', Shift::DRAFT)->count(),
                'scheduled_minutes' => $rows->sum('scheduled_minutes'),
                'worked_minutes' => $rows->sum('worked_minutes'),
                'overtime_minutes' => $rows->sum('overtime_minutes'),
                'late_minutes' => $rows->sum('late_minutes'),
                'absences' => $rows->sum('absences'),
                'pending' => $rows->sum('pending'),
                'employees' => $rows->count(),
            ],
            'withAttendance' => $withAttendance,
            'employees' => $rows,
            'daily' => collect($daily)->map(fn ($v, $date) => ['date' => $date, ...$v])->values(),
        ];
    }
}
