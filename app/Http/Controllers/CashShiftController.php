<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\CashShift;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Back office: every register's cash shifts, who opened and closed them, and
 * whether the drawer came out over or short. Shifts themselves are made on
 * the register (see Pos\SyncController::shifts).
 */
class CashShiftController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
            'branch' => ['nullable', 'integer'],
        ]);
        $tz = $request->user()->merchant->timezone ?? config('app.timezone');
        $from = Carbon::parse($filters['from'] ?? now($tz)->subDays(6)->toDateString(), $tz)->startOfDay();
        $to = Carbon::parse($filters['to'] ?? now($tz)->toDateString(), $tz)->endOfDay();

        $shifts = CashShift::query()
            ->with(['branch:id,name', 'openedBy:id,name', 'closedBy:id,name'])
            ->whereBetween('opened_at', [$from->copy()->utc(), $to->copy()->utc()])
            ->when($filters['branch'] ?? null, fn ($q, $b) => $q->where('branch_id', $b))
            ->latest('opened_at')
            ->paginate(30)
            ->withQueryString();

        return Inertia::render('CashShifts/Index', [
            'filters' => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'branch' => $filters['branch'] ?? null],
            'branches' => Branch::query()->orderBy('name')->get(['id', 'name']),
            'shifts' => $shifts->through(function (CashShift $s) {
                $cash = $s->report()['cash'];

                return [
                    'id' => $s->id,
                    'branch' => $s->branch?->name,
                    'terminal' => $s->terminal,
                    'opened_by' => $s->openedBy?->name,
                    'closed_by' => $s->closedBy?->name,
                    'opened_at' => $s->opened_at->toIso8601String(),
                    'closed_at' => $s->closed_at?->toIso8601String(),
                    'expected_cents' => $cash['expected_cents'],
                    'counted_cents' => $cash['counted_cents'],
                    'difference_cents' => $cash['difference_cents'],
                ];
            }),
        ]);
    }

    public function show(CashShift $shift): Response
    {
        $shift->load(['branch:id,name', 'openedBy:id,name', 'closedBy:id,name']);

        return Inertia::render('CashShifts/Show', [
            'shift' => [
                'id' => $shift->id,
                'branch' => $shift->branch?->name,
                'terminal' => $shift->terminal,
                'opened_by' => $shift->openedBy?->name,
                'closed_by' => $shift->closedBy?->name,
                'opened_at' => $shift->opened_at->toIso8601String(),
                'closed_at' => $shift->closed_at?->toIso8601String(),
            ],
            'report' => $shift->report(),
        ]);
    }
}
