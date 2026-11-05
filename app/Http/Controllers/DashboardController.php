<?php

namespace App\Http\Controllers;

use App\Models\AttendanceRecord;
use App\Models\Branch;
use App\Models\InventoryItem;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Shift;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The business overview. Each section only appears for users who may open
 * the page its data comes from; every number comes from stored records.
 */
class DashboardController extends Controller
{
    public function __invoke(Request $request): Response|RedirectResponse
    {
        $user = $request->user();

        // Administrators have the platform dashboard instead.
        if ($user->isAdmin()) {
            return redirect()->route('admin.dashboard');
        }

        if (! $user->merchant_id) {
            return Inertia::render('Dashboard', ['today' => null]);
        }

        $tz = $user->merchant->timezone;
        $today = now($tz)->startOfDay();

        return Inertia::render('Dashboard', [
            'today' => $today->toDateString(),
            'sales' => Gate::allows('sales.view') ? $this->sales($tz) : null,
            'lowStock' => Gate::allows('inventory.manage') ? $this->lowStock() : null,
            // The team card comes from the Management modules (Pro).
            'team' => $user->merchant->isSubscribed() && (Gate::allows('attendance.manage') || Gate::allows('schedules.manage')) ? $this->team($tz) : null,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function sales(string $tz): array
    {
        $todayStart = now($tz)->startOfDay();
        $weekStart = $todayStart->copy()->subDays(6);

        $week = Sale::query()
            ->whereBetween('sold_at', [$weekStart->copy()->utc(), now()])
            ->get(['id', 'branch_id', 'total_cents', 'sold_at']);

        $daily = [];
        for ($d = $weekStart->copy(); $d->lte($todayStart); $d->addDay()) {
            $daily[$d->toDateString()] = ['count' => 0, 'total_cents' => 0];
        }
        foreach ($week as $sale) {
            $day = $sale->sold_at->copy()->setTimezone($tz)->toDateString();
            if (isset($daily[$day])) {
                $daily[$day]['count']++;
                $daily[$day]['total_cents'] += $sale->total_cents;
            }
        }

        $todayKey = $todayStart->toDateString();
        $yesterdayKey = $todayStart->copy()->subDay()->toDateString();
        $todayIds = $week->filter(fn (Sale $s) => $s->sold_at->copy()->setTimezone($tz)->toDateString() === $todayKey)->modelKeys();

        $top = SaleItem::query()
            ->whereIn('sale_id', $todayIds)
            ->selectRaw('name, sum(quantity) as quantity, sum(line_total_cents) as revenue')
            ->groupBy('name')
            ->orderByDesc('revenue')
            ->limit(5)
            ->get()
            ->map(fn ($r) => ['name' => $r->name, 'quantity' => (int) $r->quantity, 'revenue_cents' => (int) $r->revenue]);

        $recent = Sale::query()
            ->with('user:id,name')
            ->withCount('items')
            ->latest('sold_at')
            ->limit(6)
            ->get()
            ->map(fn (Sale $s) => [
                'id' => $s->id,
                'reference' => strtoupper(substr($s->client_uuid, 0, 8)),
                'sold_at' => $s->sold_at->toIso8601String(),
                'cashier' => $s->user?->name,
                'items_count' => $s->items_count,
                'payment_method' => $s->payment_method->value,
                'total_cents' => $s->total_cents,
            ]);

        $todayTotals = $daily[$todayKey];

        // Today at each branch (staff tied to one branch only see theirs, so no list).
        $branches = Branch::query()->orderBy('id')->get(['id', 'name']);
        $byBranch = $week->filter(fn (Sale $s) => in_array($s->id, $todayIds, true))->groupBy('branch_id');
        $branchToday = auth()->user()->branch_id === null && $branches->count() > 1
            ? $branches->map(fn (Branch $b) => [
                'id' => $b->id,
                'name' => $b->name,
                'count' => $byBranch->get($b->id, collect())->count(),
                'total_cents' => (int) $byBranch->get($b->id, collect())->sum('total_cents'),
            ])->sortByDesc('total_cents')->values()
            : null;

        return [
            'today' => [
                ...$todayTotals,
                'average_cents' => $todayTotals['count'] ? intdiv($todayTotals['total_cents'], $todayTotals['count']) : 0,
                'items' => (int) SaleItem::query()->whereIn('sale_id', $todayIds)->sum('quantity'),
            ],
            'yesterday' => $daily[$yesterdayKey],
            'week' => collect($daily)->map(fn ($v, $date) => ['date' => $date, ...$v])->values(),
            'top' => $top,
            'recent' => $recent,
            'branches' => $branchToday,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function lowStock(): array
    {
        // Staff tied to a branch: that branch's own stock; otherwise the store total.
        $branchId = auth()->user()->branch_id;
        $items = InventoryItem::query()
            ->where('is_active', true)
            ->with('stocks')
            ->get(['id', 'name', 'unit', 'quantity', 'reorder_level'])
            ->each(fn (InventoryItem $i) => $i->atBranch($branchId))
            ->filter(fn (InventoryItem $i) => $i->quantity <= 0 || ($i->reorder_level !== null && $i->quantity <= $i->reorder_level))
            ->sortBy('quantity')
            ->values()
            ->map(fn (InventoryItem $i) => $i->only(['id', 'name', 'unit', 'quantity', 'reorder_level']));

        return [
            'count' => $items->count(),
            'out' => $items->where('quantity', '<=', 0)->count(),
            'items' => $items->take(6)->values(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function team(string $tz): array
    {
        $start = now($tz)->startOfDay();
        $shifts = Shift::query()
            ->with('employee:id,name')
            ->where('status', Shift::PUBLISHED)
            ->whereBetween('starts_at', [$start->copy()->utc(), $start->copy()->endOfDay()->utc()])
            ->orderBy('starts_at')
            ->get();

        $canAttendance = Gate::allows('attendance.manage');
        $onShift = $canAttendance
            ? AttendanceRecord::query()->with('employee:id,name')->where('type', 'worked')->whereNotNull('clock_in_at')->whereNull('clock_out_at')->get()
            : collect();

        return [
            'scheduled' => $shifts->count(),
            'shifts' => $shifts->take(6)->map(fn (Shift $s) => [
                'employee' => $s->employee?->name,
                'start' => $s->starts_at->copy()->setTimezone($tz)->format('H:i'),
                'end' => $s->ends_at->copy()->setTimezone($tz)->format('H:i'),
                'on_shift' => $onShift->contains('employee_id', $s->employee_id),
            ])->values(),
            'onShift' => $canAttendance ? $onShift->map(fn ($r) => [
                'employee' => $r->employee?->name,
                'since' => $r->clock_in_at->copy()->setTimezone($tz)->format('H:i'),
            ])->values() : null,
            'pending' => $canAttendance ? AttendanceRecord::query()->where('status', AttendanceRecord::PENDING)->count() : null,
        ];
    }
}
