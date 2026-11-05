<?php

namespace App\Http\Controllers;

use App\Enums\PaymentMethod;
use App\Models\Branch;
use App\Models\Employee;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Branches and the command center: what each branch earns, side by side,
 * and who works where. Owner only, Pro. Branch and Sale are merchant-scoped
 * globally.
 */
class BranchController extends Controller
{
    /** Longest range the daily chart covers. */
    private const MAX_DAYS = 92;

    public function index(Request $request): Response
    {
        $merchant = $request->user()->merchant;
        $tz = $merchant->timezone;
        $merchant->mainBranch();

        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ]);
        $from = Carbon::parse($data['from'] ?? now($tz)->subDays(6)->toDateString(), $tz)->startOfDay();
        $to = Carbon::parse($data['to'] ?? now($tz)->toDateString(), $tz)->endOfDay();
        if ($from->gt($to)) {
            [$from, $to] = [$to->copy()->startOfDay(), $from->copy()->endOfDay()];
        }
        if ($from->diffInDays($to) >= self::MAX_DAYS) {
            throw ValidationException::withMessages(['from' => 'Choose up to '.self::MAX_DAYS.' days.']);
        }
        // The same number of days just before, to compare against.
        $days = (int) $from->diffInDays($to->copy()->addSecond());
        $previousFrom = $from->copy()->subDays($days);

        $branches = Branch::query()->withCount(['users', 'tables'])->orderBy('id')->get();
        $sales = Sale::query()
            ->whereBetween('sold_at', [$from->copy()->utc(), $to->copy()->utc()])
            ->get(['id', 'branch_id', 'total_cents', 'discount_cents', 'payment_method', 'sold_at']);
        $previous = Sale::query()
            ->whereBetween('sold_at', [$previousFrom->copy()->utc(), $from->copy()->utc()->subSecond()])
            ->selectRaw('branch_id, coalesce(sum(total_cents), 0) as total')
            ->groupBy('branch_id')
            ->pluck('total', 'branch_id');
        $top = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->whereIn('sales.id', $sales->modelKeys())
            ->selectRaw('sales.branch_id, sale_items.name, sum(sale_items.quantity) as quantity, sum(sale_items.line_total_cents) as revenue')
            ->groupBy('sales.branch_id', 'sale_items.name')
            ->orderByDesc('revenue')
            ->get()
            ->groupBy('branch_id');
        $everSold = Sale::query()->selectRaw('branch_id, count(*) as n, max(sold_at) as last_at')->groupBy('branch_id')->get()->keyBy('branch_id');

        $dates = [];
        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
            $dates[] = $d->toDateString();
        }
        $byBranch = $sales->groupBy('branch_id');

        return Inertia::render('Branches/Index', [
            'filters' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'today' => now($tz)->toDateString(),
            'currency' => $merchant->currency,
            'dates' => $dates,
            'branches' => $branches->map(function (Branch $branch) use ($byBranch, $previous, $top, $everSold, $dates, $tz) {
                $own = $byBranch->get($branch->id, collect());
                $total = (int) $own->sum('total_cents');
                $daily = array_fill_keys($dates, 0);
                foreach ($own as $sale) {
                    $day = $sale->sold_at->copy()->setTimezone($tz)->toDateString();
                    if (isset($daily[$day])) {
                        $daily[$day] += $sale->total_cents;
                    }
                }
                $best = $top->get($branch->id)?->first();
                $lastAt = $everSold->get($branch->id)?->last_at;

                return [
                    'id' => $branch->id,
                    'name' => $branch->name,
                    'address' => $branch->address,
                    'is_active' => $branch->is_active,
                    'staff' => $branch->users_count,
                    'tables' => $branch->tables_count,
                    'has_sales' => $everSold->has($branch->id),
                    'last_sale_at' => $lastAt ? Carbon::parse($lastAt, 'UTC')->toIso8601String() : null,
                    'total_cents' => $total,
                    'previous_cents' => (int) ($previous[$branch->id] ?? 0),
                    'count' => $own->count(),
                    'average_cents' => $own->count() ? intdiv($total, $own->count()) : 0,
                    'discount_cents' => (int) $own->sum('discount_cents'),
                    'cash_cents' => (int) $own->filter(fn (Sale $s) => $s->payment_method === PaymentMethod::Cash)->sum('total_cents'),
                    'top' => $best ? ['name' => $best->name, 'quantity' => (int) $best->quantity, 'revenue_cents' => (int) $best->revenue] : null,
                    'daily' => array_values($daily),
                ];
            }),
            // Sales from before a branch was set (none since branches exist).
            'unassigned_cents' => (int) $byBranch->get('', collect())->sum('total_cents'),
            'staff' => User::query()
                ->where('merchant_id', $merchant->id)
                ->where('role', '!=', 'owner')
                ->with('staffRole:id,name')
                ->orderBy('name')
                ->get()
                ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'role' => $u->roleName(), 'branch_id' => $u->branch_id]),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $branch = Branch::create($this->validated($request));

        return back()->with('success', "{$branch->name} added. Choose it on the POS of that location.");
    }

    public function update(Request $request, Branch $branch): RedirectResponse
    {
        $data = [
            ...$this->validated($request, $branch),
            ...$request->validate(['is_active' => ['sometimes', 'boolean']]),
        ];

        if (($data['is_active'] ?? true) === false && $branch->is_active && Branch::query()->where('is_active', true)->count() <= 1) {
            throw ValidationException::withMessages(['is_active' => 'Keep at least one branch open.']);
        }

        $branch->update($data);

        return back()->with('success', "{$branch->name} saved.");
    }

    /** Only a branch that never sold: one with sales is closed instead, to keep its history. */
    public function destroy(Branch $branch): RedirectResponse
    {
        if (Sale::query()->where('branch_id', $branch->id)->exists()) {
            return back()->withErrors(['branch' => "{$branch->name} has sales. Close it instead to keep its history."]);
        }
        if (Branch::query()->count() <= 1) {
            return back()->withErrors(['branch' => 'A store needs at least one branch.']);
        }

        $branch->delete();

        return back()->with('success', "{$branch->name} deleted.");
    }

    /** Tie a staff login to one branch, or let them work at any branch. */
    public function assign(Request $request, User $user): RedirectResponse
    {
        abort_unless($user->merchant_id === $request->user()->merchant_id, 404);
        abort_if($user->isOwner(), 403, 'The owner works at every branch.');

        $data = $request->validate([
            'branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')->where('merchant_id', $request->user()->merchant_id)],
        ]);

        $user->branch_id = $data['branch_id'];
        $user->save();
        // Their employee record says the same.
        Employee::query()->where('user_id', $user->id)->update(['branch_id' => $data['branch_id']]);

        return back()->with('success', $user->branch_id ? "{$user->name} now works at {$user->branch->name} only." : "{$user->name} can work at any branch.");
    }

    /**
     * @return array{name: string, address: string|null}
     */
    private function validated(Request $request, ?Branch $branch = null): array
    {
        return $request->validate([
            'name' => [
                'required', 'string', 'max:60',
                Rule::unique('branches', 'name')->where('merchant_id', $request->user()->merchant_id)->ignore($branch?->id),
            ],
            'address' => ['nullable', 'string', 'max:255'],
        ], ['name.unique' => 'There is already a branch with this name.']);
    }
}
