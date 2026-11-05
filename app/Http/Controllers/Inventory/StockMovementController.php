<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\InventoryItem;
use App\Models\StockMovement;
use App\Support\Csv;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The stock ledger: every delivery, sale, count, and loss.
 * Permission::InventoryManage.
 */
class StockMovementController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $this->filters($request);
        $movements = $this->query($request, $filters)->paginate(50)->withQueryString();

        // Cost of each kind of movement in the period (purchases, waste…).
        $totals = $this->query($request, $filters)
            ->setEagerLoads([])
            ->reorder()
            ->selectRaw('type, sum(total_cost_cents) as cost, count(*) as moves')
            ->groupBy('type')
            ->get()
            ->mapWithKeys(fn ($r) => [$r->type => ['cost_cents' => (int) $r->cost, 'count' => (int) $r->moves]]);

        return Inertia::render('Inventory/Movements', [
            'movements' => $movements->through(fn (StockMovement $m) => $this->present($m, $request)),
            'totals' => $totals,
            'filters' => $filters,
            'items' => InventoryItem::withTrashed()->orderBy('name')->get(['id', 'name', 'unit']),
            'branches' => $request->user()->branch_id === null ? Branch::query()->orderBy('id')->get(['id', 'name']) : [],
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $filters = $this->filters($request);
        $rows = $this->query($request, $filters)->get();

        return response()->streamDownload(function () use ($rows, $request) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Date', 'Branch', 'Item', 'Type', 'Change', 'Unit', 'On hand after', 'Unit cost', 'Total cost', 'Supplier', 'Reference', 'Note', 'By']);
            foreach ($rows as $m) {
                $p = $this->present($m, $request);
                fputcsv($out, Csv::row([
                    $p['at'], $p['branch'], $p['item'], $p['type'], $p['quantity_change'], $p['unit'], $p['quantity_after'],
                    $p['unit_cost_cents'] !== null ? number_format($p['unit_cost_cents'] / 100, 4, '.', '') : '',
                    $p['total_cost_cents'] !== null ? number_format($p['total_cost_cents'] / 100, 2, '.', '') : '',
                    $p['supplier'], $p['reference'], $p['note'], $p['user'],
                ]));
            }
            fclose($out);
        }, "stock-history-{$filters['from']}-to-{$filters['to']}.csv", ['Content-Type' => 'text/csv']);
    }

    /**
     * @return array{from: string, to: string, type: string|null, item: int|null, branch: int|null}
     */
    private function filters(Request $request): array
    {
        $tz = $request->user()->merchant->timezone;
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
            'type' => ['nullable', Rule::in([...StockMovement::MANUAL, StockMovement::SALE])],
            'item' => ['nullable', 'integer'],
            'branch' => ['nullable', 'integer'],
        ]);

        return [
            'from' => $data['from'] ?? now($tz)->subDays(29)->toDateString(),
            'to' => $data['to'] ?? now($tz)->toDateString(),
            'type' => $data['type'] ?? null,
            'item' => isset($data['item']) ? (int) $data['item'] : null,
            'branch' => Branch::viewFor($request->user(), $data['branch'] ?? null),
        ];
    }

    private function query(Request $request, array $filters)
    {
        $tz = $request->user()->merchant->timezone;

        return StockMovement::query()
            ->with(['item:id,name,unit', 'supplier:id,name', 'user:id,name', 'branch:id,name'])
            ->where('created_at', '>=', Carbon::parse($filters['from'], $tz)->startOfDay()->utc())
            ->where('created_at', '<=', Carbon::parse($filters['to'], $tz)->endOfDay()->utc())
            ->when($filters['type'], fn ($q, $t) => $q->where('type', $t))
            ->when($filters['item'], fn ($q, $i) => $q->where('inventory_item_id', $i))
            ->when($filters['branch'], fn ($q, $b) => $q->where('branch_id', $b))
            ->latest('created_at')
            ->latest('id');
    }

    /**
     * @return array<string, mixed>
     */
    private function present(StockMovement $m, Request $request): array
    {
        return [
            'id' => $m->id,
            'at' => $m->created_at?->copy()->setTimezone($request->user()->merchant->timezone)->format('Y-m-d H:i'),
            'branch' => $m->branch?->name,
            'item_id' => $m->inventory_item_id,
            'item' => $m->item?->name,
            'unit' => $m->item?->unit,
            'type' => $m->type,
            'quantity_change' => $m->quantity_change,
            'quantity_after' => $m->quantity_after,
            'unit_cost_cents' => $m->unit_cost_cents,
            'total_cost_cents' => $m->total_cost_cents,
            'supplier' => $m->supplier?->name,
            'reference' => $m->reference,
            'sale_id' => $m->sale_id,
            'note' => $m->note,
            'user' => $m->user?->name,
        ];
    }
}
