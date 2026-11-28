<?php

use App\Enums\UserRole;
use App\Models\CashShift;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

function cashShiftOwner(?Merchant $merchant = null): User
{
    $user = User::factory()->make();
    $user->merchant()->associate($merchant ?? Merchant::factory()->create(['tax_rate_bps' => 0]));
    $user->role = UserRole::Owner;
    $user->save();

    return $user;
}

function cashShiftPayload(array $overrides = []): array
{
    return array_merge([
        'client_uuid' => (string) Str::uuid(),
        'terminal' => 'reg-a1',
        'opened_at' => now()->subHour()->toIso8601String(),
        'opening_cash_cents' => 100000,
        'cash_moves' => [],
    ], $overrides);
}

function cashShiftSale(Product $product, string $shiftUuid, string $method = 'cash', array $overrides = []): array
{
    return array_merge([
        'client_uuid' => (string) Str::uuid(),
        'shift_uuid' => $shiftUuid,
        'sold_at' => now()->subMinutes(30)->toIso8601String(),
        'payment_method' => $method,
        'payment_reference' => $method === 'cash' ? null : 'REF123',
        'amount_paid_cents' => $product->price_cents * 2,
        'items' => [['product_id' => $product->id, 'quantity' => 2, 'unit_price_cents' => $product->price_cents]],
    ], $overrides);
}

it('syncs a shift from the register, links its sales, and works out over/short on close', function () {
    $owner = cashShiftOwner();
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 15000, 'stock' => null]);
    $shift = cashShiftPayload();

    // Opened (offline earlier), then sales made during it.
    $this->actingAs($owner)->postJson('/pos/sync/shifts', ['shifts' => [$shift]])->assertOk()->assertJson(['synced' => [$shift['client_uuid']]]);
    $this->actingAs($owner)->postJson('/pos/sync/sales', ['sales' => [
        cashShiftSale($product, $shift['client_uuid']),                 // cash 300.00
        cashShiftSale($product, $shift['client_uuid'], 'ewallet'),      // e-wallet 300.00
    ]])->assertOk()->assertJsonCount(2, 'synced');

    // Cash moved and the drawer counted: 1000 + 300 + 50 - 120 = 1230 expected, 1220 counted.
    $closed = [...$shift,
        'cash_moves' => [
            ['id' => 'm1', 'type' => 'in', 'amount_cents' => 5000, 'reason' => 'Coins', 'at' => now()->subMinutes(20)->toIso8601String(), 'user_id' => $owner->id],
            ['id' => 'm2', 'type' => 'out', 'amount_cents' => 12000, 'reason' => 'Ice delivery', 'at' => now()->subMinutes(10)->toIso8601String(), 'user_id' => $owner->id],
        ],
        'closed_at' => now()->toIso8601String(),
        'counted_cash_cents' => 122000,
        'closed_by' => $owner->id,
    ];
    $this->actingAs($owner)->postJson('/pos/sync/shifts', ['shifts' => [$closed]])->assertOk();

    $model = CashShift::withoutGlobalScopes()->where('client_uuid', $shift['client_uuid'])->firstOrFail();
    expect(Sale::withoutGlobalScopes()->where('cash_shift_id', $model->id)->count())->toBe(2);

    $report = $model->report();
    expect($report['sales_count'])->toBe(2)
        ->and($report['by_method']['cash']['total_cents'])->toBe(30000)
        ->and($report['by_method']['ewallet']['total_cents'])->toBe(30000)
        ->and($report['cash']['expected_cents'])->toBe(123000)
        ->and($report['cash']['counted_cents'])->toBe(122000)
        ->and($report['cash']['difference_cents'])->toBe(-1000);

    // The register can read the server's report (it also knows voids and refunds).
    $this->actingAs($owner)->getJson("/pos/shifts/{$shift['client_uuid']}/report")->assertOk()->assertJsonPath('report.cash.difference_cents', -1000);
});

it('never reopens a closed shift and accepts the same upload twice', function () {
    $owner = cashShiftOwner();
    $closed = cashShiftPayload(['closed_at' => now()->toIso8601String(), 'counted_cash_cents' => 100000]);

    $this->actingAs($owner)->postJson('/pos/sync/shifts', ['shifts' => [$closed]])->assertOk();
    $this->actingAs($owner)->postJson('/pos/sync/shifts', ['shifts' => [$closed]])->assertOk();
    // A stale "open" copy arriving later doesn't undo the close.
    $this->actingAs($owner)->postJson('/pos/sync/shifts', ['shifts' => [[...$closed, 'closed_at' => null, 'counted_cash_cents' => null]]])->assertOk();

    expect(CashShift::withoutGlobalScopes()->count())->toBe(1)
        ->and(CashShift::withoutGlobalScopes()->first()->closed_at)->not->toBeNull();
});

it('rejects a malformed shift without blocking the others', function () {
    $owner = cashShiftOwner();
    $good = cashShiftPayload();

    $this->actingAs($owner)->postJson('/pos/sync/shifts', ['shifts' => [$good, ['client_uuid' => (string) Str::uuid(), 'terminal' => 'x']]])
        ->assertOk()->assertJsonCount(1, 'synced')->assertJsonCount(1, 'rejected');
});

it('shows the owner every register shift, and only their own store', function () {
    $owner = cashShiftOwner();
    $shift = cashShiftPayload(['closed_at' => now()->toIso8601String(), 'counted_cash_cents' => 99000]);
    $this->actingAs($owner)->postJson('/pos/sync/shifts', ['shifts' => [$shift]]);
    $id = CashShift::withoutGlobalScopes()->value('id');

    $this->actingAs($owner)->get('/cash-shifts')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('CashShifts/Index')
        ->has('shifts.data', 1)
        ->where('shifts.data.0.difference_cents', -1000));
    $this->actingAs($owner)->get("/cash-shifts/{$id}")->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('CashShifts/Show')
        ->where('report.cash.expected_cents', 100000));

    $stranger = cashShiftOwner();
    $this->actingAs($stranger)->get("/cash-shifts/{$id}")->assertNotFound();

    // Turned off in Customize: the page closes.
    $owner->merchant->forceFill(['modules' => ['pos', 'products', 'sales']])->save();
    $this->actingAs($owner)->get('/cash-shifts')->assertRedirect('/dashboard');
});
