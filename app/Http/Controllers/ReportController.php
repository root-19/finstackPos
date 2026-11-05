<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Services\Reports\ReportService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Reports across the store's records. Each report needs the permission of
 * the page its data comes from, so the page never shows anything the user
 * couldn't already open (payroll stays with the owner).
 */
class ReportController extends Controller
{
    /** Longest range one report covers. */
    private const MAX_DAYS = 366;

    public function index(Request $request): Response
    {
        // Payroll and schedule reports come from the Management modules (Pro).
        $pro = $request->user()->merchant->isSubscribed();
        $available = array_keys(array_filter([
            'sales' => Gate::allows('sales.view'),
            'inventory' => Gate::allows('inventory.manage'),
            'payroll' => $pro && Gate::allows('payroll.manage'),
            'workforce' => $pro && (Gate::allows('schedules.manage') || Gate::allows('attendance.manage')),
        ]));
        abort_if($available === [], 403);

        $tz = $request->user()->merchant->timezone;
        $data = $request->validate([
            'type' => ['nullable', Rule::in($available)],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
            'drafts' => ['nullable', 'boolean'],
            'branch' => ['nullable', 'integer'],
        ]);
        // Staff tied to a branch only ever get theirs; otherwise empty is every branch.
        $branchId = Branch::viewFor($request->user(), $data['branch'] ?? null);
        $type = $data['type'] ?? $available[0];
        $from = $data['from'] ?? now($tz)->startOfMonth()->toDateString();
        $to = $data['to'] ?? now($tz)->toDateString();

        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }
        if (Carbon::parse($from)->diffInDays(Carbon::parse($to)) >= self::MAX_DAYS) {
            throw ValidationException::withMessages(['from' => 'A report can cover up to one year. Choose a shorter range.']);
        }

        $reports = new ReportService($tz, $from, $to, $branchId);
        $drafts = (bool) ($data['drafts'] ?? false);

        return Inertia::render('Reports/Index', [
            'available' => $available,
            'type' => $type,
            'filters' => ['from' => $from, 'to' => $to, 'drafts' => $drafts, 'branch' => $branchId],
            'branches' => $request->user()->branch_id === null && Branch::query()->count() > 1
                ? Branch::query()->orderBy('id')->get(['id', 'name'])
                : [],
            'today' => now($tz)->toDateString(),
            'report' => match ($type) {
                'sales' => $reports->sales(),
                'inventory' => $reports->inventory(withSales: Gate::allows('sales.view')),
                'payroll' => $reports->payroll($drafts, withSales: Gate::allows('sales.view')),
                'workforce' => $reports->workforce(withAttendance: Gate::allows('attendance.manage')),
            },
            'generatedAt' => now($tz)->format('Y-m-d H:i'),
        ]);
    }
}
