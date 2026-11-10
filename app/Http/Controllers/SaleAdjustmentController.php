<?php

namespace App\Http\Controllers;

use App\Http\Requests\Sales\RefundSaleRequest;
use App\Http\Requests\Sales\VoidSaleRequest;
use App\Models\Sale;
use App\Models\User;
use App\Services\Sales\ManagerApproval;
use App\Services\Sales\SaleAdjustments;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Voids, refunds, and the register's receipt lookup. Online only: the
 * screens disable these while offline. Sale is merchant- and branch-scoped
 * globally, so another store's (or branch's) sale is a 404.
 */
class SaleAdjustmentController extends Controller
{
    /** How far back the register's receipt lookup searches. */
    private const LOOKUP_DAYS = 30;

    public function __construct(
        private readonly SaleAdjustments $adjustments,
        private readonly ManagerApproval $approval,
    ) {}

    /** The sale, and who can approve a void or refund of it at its branch. */
    public function show(Request $request, Sale $sale): JsonResponse
    {
        $this->authorizeAccess($request);

        return response()->json([
            'sale' => $sale->details(),
            ...$this->permissions($request->user(), $sale),
        ]);
    }

    public function void(VoidSaleRequest $request, Sale $sale): JsonResponse
    {
        $data = $request->validated();
        $approver = $this->approval->resolve($request->user(), $sale, $data);
        $sale = $this->adjustments->void($sale, $request->user(), $approver, $data['reason'], (bool) $data['restock']);

        return response()->json(['sale' => $sale->fresh()->details()]);
    }

    public function refund(RefundSaleRequest $request, Sale $sale): JsonResponse
    {
        $data = $request->validated();
        $approver = $this->approval->resolve($request->user(), $sale, $data);
        $refund = $this->adjustments->refund($sale, $request->user(), $approver, [
            'client_uuid' => $data['client_uuid'],
            'method' => $data['method'],
            'reason' => $data['reason'],
            'restock' => (bool) $data['restock'],
            'items' => $data['items'],
        ]);

        return response()->json(['sale' => $sale->fresh()->details(), 'refund_id' => $refund->id]);
    }

    /**
     * The register's "Find receipt": recent sales at its branch, or those
     * whose receipt number starts with what was typed.
     */
    public function lookup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:36'],
            'branch' => ['nullable', 'integer'],
        ]);
        $term = strtolower(preg_replace('/[^0-9a-fA-F-]/', '', $data['q'] ?? ''));

        $sales = Sale::query()
            ->when($data['branch'] ?? null, fn ($q, $branch) => $q->where('branch_id', $branch))
            ->where('sold_at', '>=', Carbon::now()->subDays(self::LOOKUP_DAYS))
            ->when($term !== '', fn ($q) => $q->where('client_uuid', 'like', $term.'%'))
            ->latest('sold_at')
            ->limit(20)
            ->get(['id', 'client_uuid', 'sold_at', 'total_cents', 'refunded_cents', 'status', 'payment_method']);

        return response()->json([
            'sales' => $sales->map(fn (Sale $s) => [
                'id' => $s->id,
                'reference' => $s->reference(),
                'sold_at' => $s->sold_at->toIso8601String(),
                'total_cents' => $s->total_cents,
                'refunded_cents' => $s->refunded_cents,
                'status' => $s->status,
                'payment_method' => $s->payment_method,
            ])->values(),
        ]);
    }

    /**
     * What the screen may offer: void (today, nothing refunded yet), refund
     * (items left), and whether a manager's PIN is needed, from whom.
     *
     * @return array<string, mixed>
     */
    private function permissions(User $user, Sale $sale): array
    {
        $tz = $user->merchant->timezone;
        $selfApproves = $user->canApproveVoids();

        return [
            'can_void' => $sale->status === Sale::COMPLETED && $sale->sold_at->copy()->setTimezone($tz)->isSameDay(now($tz)),
            'can_refund' => ! $sale->isVoided() && $sale->items()->whereColumn('refunded_quantity', '<', 'quantity')->exists(),
            'needs_approval' => ! $selfApproves,
            'approvers' => $selfApproves ? [] : $this->approval->approvers($user, $sale->branch_id)
                ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name])->values(),
        ];
    }

    private function authorizeAccess(Request $request): void
    {
        abort_unless($request->user()->can('sales.view') || $request->user()->can('pos.sell'), 403);
    }
}
