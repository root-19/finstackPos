<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Models\StockMovement;
use App\Models\Supplier;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Suppliers and what the store has bought from each.
 * Permission::InventoryManage.
 */
class SupplierController extends Controller
{
    public function index(): Response
    {
        $spent = StockMovement::query()
            ->where('type', StockMovement::PURCHASE)
            ->whereNotNull('supplier_id')
            ->selectRaw('supplier_id, sum(total_cost_cents) as spent, max(created_at) as last_at')
            ->groupBy('supplier_id')
            ->get()
            ->keyBy('supplier_id');

        return Inertia::render('Inventory/Suppliers', [
            'suppliers' => Supplier::query()->withCount('items')->orderBy('name')->get()->map(fn (Supplier $s) => [
                ...$s->only(['id', 'name', 'contact_person', 'phone', 'email', 'address', 'notes', 'items_count']),
                'spent_cents' => (int) ($spent[$s->id]->spent ?? 0),
                'last_delivery_at' => isset($spent[$s->id]) ? substr((string) $spent[$s->id]->last_at, 0, 10) : null,
            ]),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $supplier = Supplier::create($this->validated($request));

        return back()->with('success', "{$supplier->name} added.");
    }

    public function update(Request $request, Supplier $supplier): RedirectResponse
    {
        $supplier->update($this->validated($request));

        return back()->with('success', "{$supplier->name} updated.");
    }

    public function destroy(Supplier $supplier): RedirectResponse
    {
        // Items keep their stock; their supplier is simply cleared.
        $supplier->items()->update(['supplier_id' => null]);
        $supplier->delete();

        return back()->with('success', "{$supplier->name} removed.");
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
    }
}
