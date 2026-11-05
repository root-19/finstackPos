<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\InventoryItem;
use App\Models\RecipeLine;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Services\Inventory\InventoryService;
use Illuminate\Http\RedirectResponse;
use App\Support\Csv;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Stock items (supplies, ingredients, materials) and the stock moves made
 * by hand: receiving deliveries, counts, waste, and in-store use. Each
 * branch holds its own stock; without a branch the page shows the overall
 * total. Staff tied to a branch only ever see and move theirs.
 * Permission::InventoryManage.
 */
class InventoryController extends Controller
{
    public function __construct(private readonly InventoryService $inventory) {}

    public function index(Request $request): Response
    {
        $branchId = Branch::viewFor($request->user(), $request->query('branch'));
        $branches = Branch::query()->orderBy('id')->get(['id', 'name', 'is_active']);
        $names = $branches->pluck('name', 'id');
        $items = InventoryItem::query()->with(['supplier:id,name', 'stocks'])->orderBy('name')->get()
            ->each(fn (InventoryItem $i) => $i->atBranch($branchId));
        $usedIn = RecipeLine::query()
            ->selectRaw('inventory_item_id, count(distinct product_id) as products')
            ->groupBy('inventory_item_id')
            ->pluck('products', 'inventory_item_id');

        return Inertia::render('Inventory/Index', [
            'items' => $items->map(fn (InventoryItem $i) => [
                ...$this->present($i),
                'used_in' => (int) ($usedIn[$i->id] ?? 0),
                // Overall view: what each branch holds.
                'by_branch' => $branchId === null && $branches->count() > 1
                    ? $i->stocks->filter(fn ($s) => $names->has($s->branch_id))->map(fn ($s) => ['branch_id' => $s->branch_id, 'name' => $names[$s->branch_id], 'quantity' => $s->quantity])->values()
                    : [],
            ]),
            'branches' => $branches,
            'branch' => $branchId,
            'branchLocked' => $request->user()->branch_id !== null,
            'summary' => [
                'items' => $items->where('is_active', true)->count(),
                'value_cents' => $items->sum(fn (InventoryItem $i) => $i->valueCents()),
                'low' => $items->filter(fn (InventoryItem $i) => $i->is_active && $i->stockStatus() === 'low')->count(),
                'out' => $items->filter(fn (InventoryItem $i) => $i->is_active && $i->stockStatus() === 'out')->count(),
            ],
            'categories' => collect(InventoryItem::CATEGORIES)->merge($items->pluck('category')->filter())->unique()->sort()->values(),
            'units' => InventoryItem::UNITS,
            'suppliers' => Supplier::query()->orderBy('name')->get(['id', 'name']),
            'blocksSales' => (bool) $request->user()->merchant->inventory_blocks_sales,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request, creating: true);

        DB::transaction(function () use ($data, $request) {
            $item = new InventoryItem($data);
            $item->unit_cost_cents = round(($data['unit_cost'] ?? 0) * 100, 4);
            $item->save();

            if (($data['opening_quantity'] ?? 0) > 0) {
                $this->inventory->move($item, StockMovement::ADJUSTMENT, (float) $data['opening_quantity'], [
                    'branch_id' => $this->branchFor($request),
                    'note' => 'Opening stock',
                    'user_id' => $request->user()->id,
                ]);
            }
        });

        return back()->with('success', "{$data['name']} added to inventory.");
    }

    public function update(Request $request, InventoryItem $item): RedirectResponse
    {
        $data = $this->validated($request, item: $item);
        $item->fill($data);
        // The quantity only changes through stock movements; the cost can be corrected here.
        $item->unit_cost_cents = round(($data['unit_cost'] ?? 0) * 100, 4);
        $item->save();

        return back()->with('success', "{$item->name} updated.");
    }

    public function destroy(InventoryItem $item): RedirectResponse
    {
        DB::transaction(function () use ($item) {
            // Products stop using it; its movement history stays.
            RecipeLine::query()->where('inventory_item_id', $item->id)->delete();
            $item->delete();
        });

        return back()->with('success', "{$item->name} removed. Its stock history is kept.");
    }

    /**
     * Record one stock move by hand.
     */
    public function move(Request $request, InventoryItem $item): RedirectResponse
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(StockMovement::MANUAL)],
            'quantity' => ['required', 'numeric', 'min:0', 'max:9999999', 'decimal:0,3'],
            'unit_cost' => ['nullable', 'numeric', 'min:0', 'max:9999999', 'decimal:0,4'],
            'supplier_id' => ['nullable', 'integer', Rule::exists('suppliers', 'id')->where('merchant_id', $request->user()->merchant_id)],
            'reference' => ['nullable', 'string', 'max:100'],
            // Losses and count corrections must say why.
            'note' => ['nullable', 'required_if:type,waste,adjustment,usage,return', 'string', 'max:500'],
        ], [
            'note.required_if' => 'Say why (e.g. expired, spilled, monthly count).',
        ]);

        if ($data['type'] !== StockMovement::ADJUSTMENT && (float) $data['quantity'] <= 0) {
            return back()->withErrors(['quantity' => 'Enter a quantity above zero.']);
        }

        $this->inventory->move($item, $data['type'], (float) $data['quantity'], [
            'branch_id' => $this->branchFor($request),
            'unit_cost_cents' => isset($data['unit_cost']) ? round($data['unit_cost'] * 100, 4) : null,
            'supplier_id' => $data['supplier_id'] ?? null,
            'reference' => $data['reference'] ?? null,
            'note' => $data['note'] ?? null,
            'user_id' => $request->user()->id,
        ]);

        return back()->with('success', match ($data['type']) {
            StockMovement::PURCHASE => "Received {$data['quantity']} {$item->unit} of {$item->name}.",
            StockMovement::ADJUSTMENT => "{$item->name} counted: {$data['quantity']} {$item->unit} on hand.",
            default => "Recorded {$data['quantity']} {$item->unit} of {$item->name} as {$data['type']}.",
        });
    }

    /**
     * Receive a whole delivery (several items) at once.
     */
    public function receive(Request $request): RedirectResponse
    {
        $merchantId = $request->user()->merchant_id;
        $data = $request->validate([
            'supplier_id' => ['nullable', 'integer', Rule::exists('suppliers', 'id')->where('merchant_id', $merchantId)],
            'reference' => ['nullable', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:500'],
            'lines' => ['required', 'array', 'min:1', 'max:100'],
            'lines.*.item_id' => ['required', 'integer', 'distinct', Rule::exists('inventory_items', 'id')->where('merchant_id', $merchantId)->whereNull('deleted_at')],
            'lines.*.quantity' => ['required', 'numeric', 'gt:0', 'max:9999999', 'decimal:0,3'],
            'lines.*.unit_cost' => ['nullable', 'numeric', 'min:0', 'max:9999999', 'decimal:0,4'],
        ], [
            'lines.required' => 'Add at least one item to receive.',
            'lines.*.item_id.distinct' => 'Each item can only be listed once.',
        ]);

        $branchId = $this->branchFor($request);

        DB::transaction(function () use ($data, $request, $branchId) {
            foreach ($data['lines'] as $line) {
                $this->inventory->move(InventoryItem::findOrFail($line['item_id']), StockMovement::PURCHASE, (float) $line['quantity'], [
                    'branch_id' => $branchId,
                    'unit_cost_cents' => isset($line['unit_cost']) ? round($line['unit_cost'] * 100, 4) : null,
                    'supplier_id' => $data['supplier_id'] ?? null,
                    'reference' => $data['reference'] ?? null,
                    'note' => $data['note'] ?? null,
                    'user_id' => $request->user()->id,
                ]);
            }
        });

        return back()->with('success', count($data['lines']).' item(s) received.');
    }

    public function settings(Request $request): RedirectResponse
    {
        $data = $request->validate(['blocks_sales' => ['required', 'boolean']]);
        $merchant = $request->user()->merchant;
        $merchant->inventory_blocks_sales = $data['blocks_sales'];
        $merchant->save();

        return back()->with('success', $data['blocks_sales']
            ? 'The POS now stops selling products whose ingredients have run out.'
            : 'The POS now warns, but still sells, when ingredients run out.');
    }

    /**
     * The stock list as CSV (opens in Excel or Google Sheets).
     */
    public function export(Request $request): StreamedResponse
    {
        $branchId = Branch::viewFor($request->user(), $request->query('branch'));
        $items = InventoryItem::query()->with(['supplier:id,name', 'stocks'])->orderBy('name')->get()
            ->each(fn (InventoryItem $i) => $i->atBranch($branchId));
        $label = $branchId ? Branch::query()->find($branchId)?->name : 'All branches';

        return response()->streamDownload(function () use ($items, $label) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Branch', 'Item', 'SKU', 'Category', 'Unit', 'On hand', 'Reorder level', 'Unit cost', 'Stock value', 'Supplier', 'Location', 'Status']);
            foreach ($items as $i) {
                fputcsv($out, Csv::row([
                    $label, $i->name, $i->sku, $i->category, $i->unit, $i->quantity, $i->reorder_level,
                    number_format($i->unit_cost_cents / 100, 4, '.', ''), number_format($i->valueCents() / 100, 2, '.', ''),
                    $i->supplier?->name, $i->location, $i->is_active ? $i->stockStatus() : 'inactive',
                ]));
            }
            fclose($out);
        }, 'inventory-'.now()->format('Y-m-d').'.csv', ['Content-Type' => 'text/csv']);
    }

    /**
     * Where a stock move happens: the user's own branch when they're tied to
     * one, else the branch chosen in the form, else the main branch.
     */
    private function branchFor(Request $request): int
    {
        $request->validate(['branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')->where('merchant_id', $request->user()->merchant_id)]]);

        return Branch::forUser($request->user(), $request->integer('branch_id') ?: null, activeOnly: false)->id;
    }

    /**
     * @return array<string, mixed>
     */
    public static function present(InventoryItem $item): array
    {
        return [
            'id' => $item->id,
            'name' => $item->name,
            'sku' => $item->sku,
            'category' => $item->category,
            'unit' => $item->unit,
            'quantity' => $item->quantity,
            'unit_cost_cents' => $item->unit_cost_cents,
            'value_cents' => $item->valueCents(),
            'reorder_level' => $item->reorder_level,
            'reorder_quantity' => $item->reorder_quantity,
            'supplier_id' => $item->supplier_id,
            'supplier' => $item->supplier?->name,
            'location' => $item->location,
            'notes' => $item->notes,
            'is_active' => $item->is_active,
            'status' => $item->is_active ? $item->stockStatus() : 'inactive',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $creating = false, ?InventoryItem $item = null): array
    {
        $merchantId = $request->user()->merchant_id;

        return $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('inventory_items')->where('merchant_id', $merchantId)->whereNull('deleted_at')->ignore($item)],
            'sku' => ['nullable', 'string', 'max:64'],
            'category' => ['nullable', 'string', 'max:60'],
            'unit' => ['required', 'string', 'max:20'],
            'unit_cost' => ['nullable', 'numeric', 'min:0', 'max:9999999', 'decimal:0,4'],
            'reorder_level' => ['nullable', 'numeric', 'min:0', 'max:9999999', 'decimal:0,3'],
            'reorder_quantity' => ['nullable', 'numeric', 'min:0', 'max:9999999', 'decimal:0,3'],
            'supplier_id' => ['nullable', 'integer', Rule::exists('suppliers', 'id')->where('merchant_id', $merchantId)->whereNull('deleted_at')],
            'location' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['required', 'boolean'],
            ...($creating ? ['opening_quantity' => ['nullable', 'numeric', 'min:0', 'max:9999999', 'decimal:0,3']] : []),
        ], [
            'name.unique' => 'There is already an item with that name.',
        ]);
    }
}
