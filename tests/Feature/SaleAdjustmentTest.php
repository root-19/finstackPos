<?php

use App\Enums\UserRole;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\InventoryItem;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\RecipeLine;
use App\Models\Sale;
use App\Models\SaleRefund;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

function adjustOwner(?Merchant $merchant = null): User
{
    $user = User::factory()->make();
    $user->merchant()->associate($merchant ?? Merchant::factory()->create());
    $user->role = UserRole::Owner;
    $user->save();

    return $user;
}

/**
 * Ring up a sale through the register's sync, as a cashier would.
 *
 * @param  list<array{0: Product, 1: int}>  $lines
 */
function ringUp(User $user, array $lines, array $overrides = []): Sale
{
    $uuid = (string) Str::uuid();
    test()->actingAs($user)->postJson('/pos/sync/sales', ['sales' => [array_merge([
        'client_uuid' => $uuid,
        'sold_at' => now()->toIso8601String(),
        'payment_method' => 'cash',
        'amount_paid_cents' => 100000000,
        'items' => array_map(fn ($l) => ['product_id' => $l[0]->id, 'quantity' => $l[1], 'unit_price_cents' => $l[0]->price_cents], $lines),
    ], $overrides)]])->assertJsonCount(0, 'rejected');

    return Sale::withoutGlobalScopes()->where('client_uuid', $uuid)->with('items')->firstOrFail();
}

function refundPayload(Sale $sale, array $quantities, array $overrides = []): array
{
    return array_merge([
        'client_uuid' => (string) Str::uuid(),
        'method' => 'cash',
        'reason' => 'Customer returned it',
        'restock' => false,
        'items' => collect($quantities)->map(fn ($qty, $i) => ['sale_item_id' => $sale->items[$i]->id, 'quantity' => $qty])
            ->filter(fn ($line) => $line['quantity'] > 0)->values()->all(),
    ], $overrides);
}

function withPin(User $user, string $pin = '2468'): User
{
    $user->manager_pin = $pin;
    $user->save();

    return $user;
}

test('the owner voids a sale made today; it leaves totals and is audited', function () {
    $owner = adjustOwner();
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 15000, 'stock' => null]);
    $sale = ringUp($owner, [[$product, 2]]);

    $this->actingAs($owner)->postJson("/sales/{$sale->id}/void", ['reason' => 'Wrong order', 'restock' => false])
        ->assertOk()
        ->assertJsonPath('sale.status', 'voided')
        ->assertJsonPath('sale.voided_by', $owner->name);

    expect(Sale::counted()->count())->toBe(0)
        ->and(AuditLog::where('action', 'sale.voided')->first())
        ->reason->toBe('Wrong order')
        ->old_values->toBe(['status' => 'completed']);

    // Voiding twice is refused.
    $this->actingAs($owner)->postJson("/sales/{$sale->id}/void", ['reason' => 'Again', 'restock' => false])->assertStatus(409);
});

test('only today\'s sales can be voided, and not after a refund', function () {
    $owner = adjustOwner();
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 10000, 'stock' => null]);
    $old = ringUp($owner, [[$product, 1]], ['sold_at' => now()->subDays(2)->toIso8601String()]);
    $today = ringUp($owner, [[$product, 2]]);

    $this->actingAs($owner)->postJson("/sales/{$old->id}/void", ['reason' => 'Late', 'restock' => false])
        ->assertStatus(409)
        ->assertJsonPath('errors.sale.0', 'Only today’s sales can be voided. Refund the items instead.');

    $this->actingAs($owner)->postJson("/sales/{$today->id}/refunds", refundPayload($today, [1]))->assertOk();
    $this->actingAs($owner)->postJson("/sales/{$today->id}/void", ['reason' => 'Oops', 'restock' => false])->assertStatus(409);
});

test('a cashier needs a manager\'s PIN to void, and wrong PINs are limited', function () {
    $owner = adjustOwner();
    $cashier = staffWith(['pos.sell'], $owner->merchant);
    $manager = withPin(staffWith(['pos.sell', 'sales.void'], $owner->merchant));
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 10000, 'stock' => null]);
    $sale = ringUp($cashier, [[$product, 1]]);
    RateLimiter::clear("manager-pin:{$owner->merchant_id}:{$manager->id}");

    // The lookup lists who can approve here.
    $this->actingAs($cashier)->getJson("/sales/{$sale->id}/adjust")
        ->assertOk()
        ->assertJsonPath('needs_approval', true)
        ->assertJsonPath('approvers', [['id' => $manager->id, 'name' => $manager->name]]);

    $this->actingAs($cashier)->postJson("/sales/{$sale->id}/void", ['reason' => 'Wrong item', 'restock' => false])
        ->assertJsonValidationErrors('approver_pin');

    foreach (range(1, 5) as $_) {
        $this->actingAs($cashier)->postJson("/sales/{$sale->id}/void", [
            'reason' => 'Wrong item', 'restock' => false, 'approver_id' => $manager->id, 'approver_pin' => '0000',
        ])->assertJsonValidationErrors(['approver_pin' => 'Wrong PIN.']);
    }
    // Locked now, even with the right PIN.
    $this->actingAs($cashier)->postJson("/sales/{$sale->id}/void", [
        'reason' => 'Wrong item', 'restock' => false, 'approver_id' => $manager->id, 'approver_pin' => '2468',
    ])->assertJsonValidationErrors('approver_pin');

    RateLimiter::clear("manager-pin:{$owner->merchant_id}:{$manager->id}");
    $this->actingAs($cashier)->postJson("/sales/{$sale->id}/void", [
        'reason' => 'Wrong item', 'restock' => false, 'approver_id' => $manager->id, 'approver_pin' => '2468',
    ])->assertOk()->assertJsonPath('sale.void_approved_by', $manager->name);

    expect($sale->fresh()->voided_by)->toBe($cashier->id);
});

test('managers without the permission, without a PIN, or from another branch can\'t approve', function () {
    $owner = adjustOwner();
    $other = new Branch(['name' => 'Cubao']);
    $other->merchant_id = $owner->merchant_id;
    $other->save();
    $cashier = staffWith(['pos.sell'], $owner->merchant);
    $noPermission = withPin(staffWith(['pos.sell'], $owner->merchant));
    $noPin = staffWith(['sales.void'], $owner->merchant);
    $elsewhere = withPin(staffWith(['sales.void'], $owner->merchant));
    $elsewhere->branch()->associate($other)->save();
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 10000, 'stock' => null]);
    $sale = ringUp($cashier, [[$product, 1]]);

    foreach ([$noPermission, $noPin, $elsewhere] as $who) {
        $this->actingAs($cashier)->postJson("/sales/{$sale->id}/void", [
            'reason' => 'x x x', 'restock' => false, 'approver_id' => $who->id, 'approver_pin' => '2468',
        ])->assertJsonValidationErrors(['approver_pin' => 'This manager can’t approve here.']);
    }
    expect($sale->fresh()->status)->toBe('completed');
});

test('a partial refund of a senior sale takes its exact share of the VAT exemption and discount', function () {
    $owner = adjustOwner();
    $coffee = Product::factory()->for($owner->merchant)->create(['price_cents' => 11200, 'stock' => null]);
    // 2 × ₱112 (VAT included) with a senior discount: VAT exempt ₱24, discount ₱40, total ₱160.
    $sale = ringUp($owner, [[$coffee, 2]], ['discount_type' => 'senior', 'discount_id_number' => 'SC-1', 'discount_customer_name' => 'Lola']);
    expect([$sale->vat_exempt_cents, $sale->discount_cents, $sale->total_cents])->toBe([2400, 4000, 16000]);

    $this->actingAs($owner)->postJson("/sales/{$sale->id}/refunds", refundPayload($sale, [1]))
        ->assertOk()
        ->assertJsonPath('sale.status', 'partially_refunded')
        ->assertJsonPath('sale.refunded_cents', 8000)
        ->assertJsonPath('sale.items.0.refundable_quantity', 1);

    $refund = SaleRefund::firstOrFail();
    expect([$refund->subtotal_cents, $refund->vat_exempt_cents, $refund->discount_cents, $refund->tax_cents, $refund->amount_cents])
        ->toBe([11200, 1200, 2000, 0, 8000]);

    $this->actingAs($owner)->postJson("/sales/{$sale->id}/refunds", refundPayload($sale, [1]))
        ->assertOk()
        ->assertJsonPath('sale.status', 'refunded');

    // Nothing left: a third refund is refused.
    $this->actingAs($owner)->postJson("/sales/{$sale->id}/refunds", refundPayload($sale, [1]))->assertStatus(409);
});

test('refunds of odd amounts always add up exactly to the sale', function () {
    $owner = adjustOwner();
    $owner->merchant->forceFill(['service_charge_bps' => 1000])->save();
    $a = Product::factory()->for($owner->merchant)->create(['price_cents' => 3333, 'stock' => null]);
    $b = Product::factory()->for($owner->merchant)->create(['price_cents' => 1999, 'stock' => null]);
    $sale = ringUp($owner, [[$a, 3], [$b, 7]], ['discount_type' => 'pwd', 'discount_id_number' => 'PWD-9', 'discount_customer_name' => 'Juan']);

    foreach ([[1, 0], [0, 3], [1, 2], [1, 2]] as $quantities) {
        $this->actingAs($owner)->postJson("/sales/{$sale->id}/refunds", refundPayload($sale, $quantities))->assertOk();
    }

    $sum = fn (string $column) => (int) SaleRefund::where('sale_id', $sale->id)->sum($column);
    expect($sum('subtotal_cents'))->toBe($sale->subtotal_cents)
        ->and($sum('vat_exempt_cents'))->toBe($sale->vat_exempt_cents)
        ->and($sum('discount_cents'))->toBe($sale->discount_cents)
        ->and($sum('service_charge_cents'))->toBe($sale->service_charge_cents)
        ->and($sum('tax_cents'))->toBe($sale->tax_cents)
        ->and($sum('amount_cents'))->toBe($sale->total_cents)
        ->and($sale->fresh()->status)->toBe('refunded');
});

test('sending the same refund twice refunds once', function () {
    $owner = adjustOwner();
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 10000, 'stock' => null]);
    $sale = ringUp($owner, [[$product, 3]]);
    $payload = refundPayload($sale, [1]);

    $this->actingAs($owner)->postJson("/sales/{$sale->id}/refunds", $payload)->assertOk();
    $this->actingAs($owner)->postJson("/sales/{$sale->id}/refunds", $payload)->assertOk();

    expect(SaleRefund::count())->toBe(1)
        ->and($sale->items->first()->fresh()->refunded_quantity)->toBe(1);
});

test('refunding more than was sold, or another sale\'s item, is refused', function () {
    $owner = adjustOwner();
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 10000, 'stock' => null]);
    $sale = ringUp($owner, [[$product, 2]]);
    $other = ringUp($owner, [[$product, 1]]);

    $this->actingAs($owner)->postJson("/sales/{$sale->id}/refunds", refundPayload($sale, [3]))->assertStatus(409);
    $this->actingAs($owner)->postJson("/sales/{$sale->id}/refunds", refundPayload($sale, [1], [
        'items' => [['sale_item_id' => $other->items[0]->id, 'quantity' => 1]],
    ]))->assertJsonValidationErrors('items');
    $this->actingAs($owner)->postJson("/sales/{$sale->id}/refunds", refundPayload($sale, [1], ['reason' => '']))->assertJsonValidationErrors('reason');

    expect(SaleRefund::count())->toBe(0);
});

test('a voided sale cannot be refunded', function () {
    $owner = adjustOwner();
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 10000, 'stock' => null]);
    $sale = ringUp($owner, [[$product, 1]]);
    $this->actingAs($owner)->postJson("/sales/{$sale->id}/void", ['reason' => 'Mistake', 'restock' => false])->assertOk();

    $this->actingAs($owner)->postJson("/sales/{$sale->id}/refunds", refundPayload($sale, [1]))->assertStatus(409);
});

test('returning items to stock puts back product stock and recipe ingredients at the sale\'s branch', function () {
    $owner = adjustOwner();
    $this->actingAs($owner)->post('/inventory', [
        'name' => 'Cup', 'unit' => 'pcs', 'unit_cost' => '2', 'opening_quantity' => '50', 'reorder_level' => '5', 'is_active' => true,
    ])->assertSessionHasNoErrors();
    $cups = InventoryItem::query()->latest('id')->firstOrFail();
    $drink = Product::factory()->for($owner->merchant)->create(['price_cents' => 9000, 'stock' => null]);
    RecipeLine::create(['product_id' => $drink->id, 'inventory_item_id' => $cups->id, 'quantity' => 1]);
    $snack = Product::factory()->for($owner->merchant)->create(['price_cents' => 5000, 'stock' => 10]);

    $sale = ringUp($owner, [[$drink, 3], [$snack, 4]]);
    expect($cups->fresh()->quantity)->toBe(47.0)->and($snack->fresh()->stock)->toBe(6);

    $this->actingAs($owner)->postJson("/sales/{$sale->id}/refunds", refundPayload($sale, [2, 1], ['restock' => true]))->assertOk();

    expect($cups->fresh()->quantity)->toBe(49.0)
        ->and($snack->fresh()->stock)->toBe(7)
        ->and(StockMovement::where('type', StockMovement::CUSTOMER_RETURN)->first())
        ->quantity_change->toBe(2.0)
        ->branch_id->toBe($sale->branch_id)
        ->sale_id->toBe($sale->id);

    // A refund without "return to stock" leaves stock alone.
    $this->actingAs($owner)->postJson("/sales/{$sale->id}/refunds", refundPayload($sale, [1, 0]))->assertOk();
    expect($cups->fresh()->quantity)->toBe(49.0);
});

test('voiding with restock puts everything back', function () {
    $owner = adjustOwner();
    $snack = Product::factory()->for($owner->merchant)->create(['price_cents' => 5000, 'stock' => 10]);
    $sale = ringUp($owner, [[$snack, 4]]);

    $this->actingAs($owner)->postJson("/sales/{$sale->id}/void", ['reason' => 'Rang twice', 'restock' => true])->assertOk();

    expect($snack->fresh()->stock)->toBe(10);
});

test('another store\'s sale can never be seen, voided or refunded', function () {
    $owner = adjustOwner();
    $intruder = adjustOwner();
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 10000, 'stock' => null]);
    $sale = ringUp($owner, [[$product, 2]]);

    $this->actingAs($intruder)->getJson("/sales/{$sale->id}/adjust")->assertNotFound();
    $this->actingAs($intruder)->postJson("/sales/{$sale->id}/void", ['reason' => 'Mine now', 'restock' => true])->assertNotFound();
    $this->actingAs($intruder)->postJson("/sales/{$sale->id}/refunds", refundPayload($sale, [1]))->assertNotFound();
    $this->actingAs($intruder)->getJson('/pos/receipts?q='.substr($sale->client_uuid, 0, 8))->assertOk()->assertJsonCount(0, 'sales');

    expect($sale->fresh()->status)->toBe('completed')->and(SaleRefund::withoutGlobalScopes()->count())->toBe(0);
});

test('a manager of another store can never approve', function () {
    $owner = adjustOwner();
    $cashier = staffWith(['pos.sell'], $owner->merchant);
    $foreignManager = withPin(adjustOwner());
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 10000, 'stock' => null]);
    $sale = ringUp($cashier, [[$product, 1]]);

    $this->actingAs($cashier)->postJson("/sales/{$sale->id}/void", [
        'reason' => 'x x x', 'restock' => false, 'approver_id' => $foreignManager->id, 'approver_pin' => '2468',
    ])->assertJsonValidationErrors(['approver_pin' => 'This manager can’t approve here.']);
});

test('users who can neither sell nor see sales cannot reach voids', function () {
    $owner = adjustOwner();
    $stockKeeper = staffWith(['inventory.manage'], $owner->merchant);
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 10000, 'stock' => null]);
    $sale = ringUp($owner, [[$product, 1]]);

    $this->actingAs($stockKeeper)->getJson("/sales/{$sale->id}/adjust")->assertForbidden();
    $this->actingAs($stockKeeper)->postJson("/sales/{$sale->id}/void", ['reason' => 'x x x', 'restock' => false])->assertForbidden();
});

test('the register finds receipts by number', function () {
    $owner = adjustOwner();
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 10000, 'stock' => null]);
    $sale = ringUp($owner, [[$product, 1]]);
    ringUp($owner, [[$product, 2]]);

    $this->actingAs($owner)->getJson('/pos/receipts')->assertOk()->assertJsonCount(2, 'sales');
    $this->actingAs($owner)->getJson('/pos/receipts?q='.strtoupper(substr($sale->client_uuid, 0, 8)))
        ->assertOk()
        ->assertJsonPath('sales.0.id', $sale->id)
        ->assertJsonCount(1, 'sales');
});

test('managers set their own PIN with their password; others cannot have one', function () {
    $owner = adjustOwner();
    $cashier = staffWith(['pos.sell'], $owner->merchant);

    $this->actingAs($owner)->put('/profile/manager-pin', ['current_password' => 'wrong', 'pin' => '1357', 'pin_confirmation' => '1357'])
        ->assertSessionHasErrors('current_password');
    $this->actingAs($owner)->put('/profile/manager-pin', ['current_password' => 'password', 'pin' => '12ab', 'pin_confirmation' => '12ab'])
        ->assertSessionHasErrors('pin');
    $this->actingAs($owner)->put('/profile/manager-pin', ['current_password' => 'password', 'pin' => '1357', 'pin_confirmation' => '1357'])
        ->assertSessionHasNoErrors();

    expect($owner->fresh()->manager_pin)->not->toBe('1357')
        ->and(password_verify('1357', $owner->fresh()->manager_pin))->toBeTrue()
        ->and(AuditLog::where('action', 'manager_pin.set')->exists())->toBeTrue();

    $this->actingAs($cashier)->put('/profile/manager-pin', ['current_password' => 'password', 'pin' => '1357', 'pin_confirmation' => '1357'])
        ->assertForbidden();
});

test('void and refund is a permission custom roles can be given', function () {
    $owner = adjustOwner();
    $manager = staffWith(['sales.void'], $owner->merchant);

    expect(App\Enums\Permission::assignable())->toContain(App\Enums\Permission::SalesVoid)
        ->and($manager->can('sales.void'))->toBeTrue()
        ->and(staffWith(['sales.view'], $owner->merchant)->can('sales.void'))->toBeFalse()
        ->and($owner->can('sales.void'))->toBeTrue();
});
