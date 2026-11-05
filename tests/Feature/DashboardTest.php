<?php

use App\Enums\UserRole;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Str;

// These tests cover Pro features; every store they create is subscribed.
beforeEach(fn () => Merchant::creating(fn (Merchant $m) => $m->subscribed_until ??= now()->addYear()));

function dashboardOwner(): User
{
    $user = User::factory()->make();
    $user->merchant()->associate(Merchant::factory()->create());
    $user->role = UserRole::Owner;
    $user->save();

    return $user;
}

test('the dashboard shows today\'s real sales to people who can see sales', function () {
    $owner = dashboardOwner();
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 12000, 'stock' => null, 'name' => 'Latte']);

    $this->actingAs($owner)->postJson('/pos/sync/sales', ['sales' => [[
        'client_uuid' => (string) Str::uuid(),
        'sold_at' => now()->toIso8601String(),
        'payment_method' => 'cash',
        'amount_paid_cents' => 100000,
        'items' => [['product_id' => $product->id, 'quantity' => 2, 'unit_price_cents' => 12000]],
    ]]])->assertJsonCount(0, 'rejected');

    $this->get('/dashboard')->assertInertia(fn ($p) => $p
        ->where('sales.today.count', 1)
        ->where('sales.today.items', 2)
        ->where('sales.top.0.name', 'Latte')
        ->has('sales.week', 7)
        ->has('sales.recent', 1)
        ->has('lowStock')
        ->has('team'));
});

test('the dashboard leaves out sections the role cannot open', function () {
    $this->actingAs(staffWith(['pos.sell']))->get('/dashboard')->assertInertia(fn ($p) => $p
        ->where('sales', null)
        ->where('lowStock', null)
        ->where('team', null));
});

test('the customer display needs POS access and shows only public store details', function () {
    $this->actingAs(staffWith(['products.manage']))->get('/pos/display')->assertForbidden();

    $cashier = staffWith(['pos.sell']);
    $this->actingAs($cashier)->get('/pos/display')->assertInertia(fn ($p) => $p
        ->component('Pos/CustomerDisplay')
        ->where('store.name', $cashier->merchant->name)
        ->missing('store.paymongo_secret_key'));
});

test('my work is for employees, not the store owner', function () {
    $this->actingAs(dashboardOwner())->get('/my-work')->assertForbidden();
});
