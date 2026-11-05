<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\DiningTable;
use Closure;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The store's tables and their QR codes, and the switch for ordering from
 * them. Each table belongs to a branch: its orders go to that branch's POS.
 * Owner only. DiningTable and Branch are merchant-scoped globally.
 */
class DiningTableController extends Controller
{
    public function index(Request $request): Response
    {
        $merchant = $request->user()->merchant;
        $merchant->mainBranch();
        $branches = Branch::query()->orderBy('id')->get();

        return Inertia::render('Tables/Index', [
            'tables' => DiningTable::query()
                ->get()
                ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
                ->map(fn (DiningTable $table) => [
                    'id' => $table->id,
                    'name' => $table->name,
                    'branch_id' => $table->branch_id,
                    'url' => $table->menuUrl(),
                ])
                ->values(),
            'branches' => $branches->map(fn (Branch $branch) => [
                'id' => $branch->id,
                'name' => $branch->name,
                'is_active' => $branch->is_active,
                'state' => $merchant->tableOrderingState($branch),
            ]),
            'ordering' => [
                'enabled' => $merchant->table_ordering_enabled,
                'subscribed' => $merchant->isSubscribed(),
            ],
            'store' => ['name' => $merchant->name],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        DiningTable::create($this->validated($request));

        return back()->with('success', 'Table added. Print its QR code and place it on the table.');
    }

    /** Add "Table 1" to "Table N" to a branch in one go. */
    public function bulk(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'count' => ['required', 'integer', 'min:1', 'max:50'],
            'branch_id' => ['nullable', 'integer', $this->ownBranch($request)],
        ]);
        $branchId = $data['branch_id'] ?? $request->user()->merchant->mainBranch()->id;
        $taken = DiningTable::query()->where('branch_id', $branchId)->pluck('name')->map(fn ($n) => mb_strtolower($n))->all();
        $added = 0;

        for ($number = 1; $added < $data['count'] && $number <= 500; $number++) {
            if (! in_array("table $number", $taken, true)) {
                DiningTable::create(['name' => "Table $number", 'branch_id' => $branchId]);
                $added++;
            }
        }

        return back()->with('success', "$added table(s) added.");
    }

    public function update(Request $request, DiningTable $table): RedirectResponse
    {
        $table->update($this->validated($request, $table));

        return back()->with('success', 'Table saved.');
    }

    /** A new code: the old printed one stops working (e.g. it was copied). */
    public function regenerate(DiningTable $table): RedirectResponse
    {
        $table->forceFill(['token' => DiningTable::newToken()])->save();

        return back()->with('success', "New QR code for {$table->name}. Print it and replace the old one.");
    }

    public function destroy(DiningTable $table): RedirectResponse
    {
        // Its orders keep the table's name.
        $table->delete();

        return back()->with('success', 'Table deleted. Its QR code no longer works.');
    }

    /** Turn ordering from the tables on or off (taking orders is Pro). */
    public function settings(Request $request): RedirectResponse
    {
        $data = $request->validate(['table_ordering_enabled' => ['required', 'boolean']]);
        $merchant = $request->user()->merchant;

        if ($data['table_ordering_enabled'] && ! $merchant->isSubscribed()) {
            return back()->withErrors(['table_ordering_enabled' => 'Ordering from the table is part of FinstackPOS Pro.']);
        }

        $merchant->update(['table_ordering_enabled' => $data['table_ordering_enabled']]);

        return back()->with('success', $data['table_ordering_enabled'] ? 'Customers can now order from their table.' : 'Table QR codes now show the menu only.');
    }

    /**
     * @return array{name: string, branch_id: int}
     */
    private function validated(Request $request, ?DiningTable $table = null): array
    {
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer', $this->ownBranch($request)],
            'name' => ['required', 'string', 'max:40'],
        ]);
        $data['branch_id'] ??= $table->branch_id ?? $request->user()->merchant->mainBranch()->id;

        // "Table 1" twice in one branch would confuse the staff (any database collation).
        $request->validate(['name' => [function (string $attribute, mixed $value, Closure $fail) use ($table, $data) {
            $taken = DiningTable::query()
                ->where('branch_id', $data['branch_id'])
                ->whereRaw('lower(name) = ?', [mb_strtolower(trim((string) $value))])
                ->when($table, fn ($query) => $query->whereKeyNot($table->id))
                ->exists();

            if ($taken) {
                $fail('This branch already has a table with this name.');
            }
        }]]);

        return $data;
    }

    private function ownBranch(Request $request): Exists
    {
        return Rule::exists('branches', 'id')->where('merchant_id', $request->user()->merchant_id);
    }
}
