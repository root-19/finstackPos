<?php

use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\DiningTable;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\TableOrder;
use App\Models\User;
use Illuminate\Support\Str;

/** An owner of a Pro store with table ordering on (unless $pro / $enabled say otherwise). */
function tableOwner(bool $pro = true, bool $enabled = true): User
{
    $merchant = Merchant::factory()->create(['table_ordering_enabled' => $enabled]);
    $merchant->forceFill(['subscribed_until' => $pro ? now()->addMonth() : null])->save();

    $user = User::factory()->make();
    $user->merchant()->associate($merchant);
    $user->role = UserRole::Owner;
    $user->save();

    return $user;
}

function tableOf(User $owner, string $name = 'Table 1'): DiningTable
{
    $table = new DiningTable(['name' => $name, 'branch_id' => $owner->merchant->mainBranch()->id]);
    $table->merchant_id = $owner->merchant_id;
    $table->save();

    return $table;
}

/** A store device is on the orders screen, so the menu takes orders. */
function storeDeviceOnline(User $owner): void
{
    $owner->merchant->mainBranch()->forceFill(['orders_seen_at' => now()])->save();
}

function placeOrder($test, DiningTable $table, array $items, ?string $note = null, string $payment = 'cash')
{
    return $test->postJson(route('menu.order', $table->token), ['items' => $items, 'note' => $note, 'payment_method' => $payment]);
}

// Tables

test('the owner adds tables and each gets its own code', function () {
    $owner = tableOwner();

    $this->actingAs($owner)->post('/tables', ['name' => 'Patio 1'])->assertSessionHasNoErrors();
    $this->actingAs($owner)->post('/tables', ['name' => 'patio 1'])->assertSessionHasErrors('name');
    $this->actingAs($owner)->post('/tables/bulk', ['count' => 3])->assertSessionHasNoErrors();

    $tables = DiningTable::where('merchant_id', $owner->merchant_id)->get();
    expect($tables->pluck('name')->sort()->values()->all())->toBe(['Patio 1', 'Table 1', 'Table 2', 'Table 3'])
        ->and($tables->pluck('token')->unique())->toHaveCount(4);

    $table = $tables->first();
    $old = $table->token;
    $this->actingAs($owner)->post("/tables/{$table->id}/new-code")->assertSessionHasNoErrors();
    expect($table->fresh()->token)->not->toBe($old);
    $this->get(route('menu.show', $old))->assertNotFound();

    $this->actingAs($owner)->get('/tables')->assertOk()
        ->assertInertia(fn ($page) => $page->component('Tables/Index')->has('tables', 4)->where('branches.0.state', 'offline'));
});

test('staff without settings access cannot manage tables, and other stores tables are out of reach', function () {
    $owner = tableOwner();
    $table = tableOf($owner);

    $this->actingAs(staffWith(['pos.sell'], $owner->merchant))->get('/tables')->assertForbidden();
    $this->actingAs(tableOwner())->delete("/tables/{$table->id}")->assertNotFound();
});

test('taking orders from the table needs Pro', function () {
    $free = tableOwner(pro: false, enabled: false);

    $this->actingAs($free)->put('/tables/settings', ['table_ordering_enabled' => true])->assertSessionHasErrors('table_ordering_enabled');
    expect($free->merchant->fresh()->table_ordering_enabled)->toBeFalse();

    $pro = tableOwner(enabled: false);
    $this->actingAs($pro)->put('/tables/settings', ['table_ordering_enabled' => true])->assertSessionHasNoErrors();
    expect($pro->merchant->fresh()->tableOrderingActive())->toBeTrue();
});

// The customer's menu

test('the menu shows only the store\'s products on sale, without stock or codes', function () {
    $owner = tableOwner();
    $table = tableOf($owner);
    Product::factory()->create(['merchant_id' => $owner->merchant_id, 'name' => 'Iced Latte', 'price_cents' => 12000]);
    Product::factory()->create(['merchant_id' => $owner->merchant_id, 'name' => 'Hidden', 'is_active' => false]);
    Product::factory()->create(['merchant_id' => $owner->merchant_id, 'name' => 'Ube Pandesal', 'stock' => 0]);
    Product::factory()->create(['name' => 'Other store item']);

    // Even signed in to another store (its catalog scope must not apply here).
    $this->actingAs(tableOwner())->get(route('menu.show', $table->token))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('Menu/Show')
            ->where('table.name', 'Table 1')
            ->has('products', 2)
            ->where('products.0.name', 'Iced Latte')
            ->where('products.1.name', 'Ube Pandesal')
            ->where('products.1.sold_out', true)
            ->missing('products.0.sku')
            ->missing('products.0.stock'));

    $this->get(route('menu.show', 'not-a-real-token'))->assertNotFound();

    $owner->merchant->update(['is_active' => false]);
    $this->get(route('menu.show', $table->token))->assertNotFound();
});

test('the menu takes orders only while a store device is online and staff have not paused', function () {
    $owner = tableOwner();
    $table = tableOf($owner);
    $product = Product::factory()->create(['merchant_id' => $owner->merchant_id]);
    $state = fn () => $this->getJson(route('menu.state', $table->token))->json('state');

    expect($state())->toBe('offline');
    placeOrder($this, $table, [['product_id' => $product->id, 'quantity' => 1]])->assertUnprocessable()->assertJsonValidationErrors('order');

    // The POS or a staff phone polling the feed is the "device online" signal.
    $this->actingAs(staffWith(['pos.sell'], $owner->merchant))->getJson('/orders/feed')->assertOk();
    auth()->logout();
    expect($state())->toBe('open');

    $this->travel(Branch::ORDER_DEVICE_TIMEOUT + 5)->seconds();
    expect($state())->toBe('offline');

    storeDeviceOnline($owner);
    $this->actingAs($owner)->postJson('/orders/pause', ['paused' => true])->assertOk();
    auth()->logout();
    expect($state())->toBe('paused');

    $free = tableOwner(pro: false);
    storeDeviceOnline($free);
    expect($this->getJson(route('menu.state', tableOf($free)->token))->json('state'))->toBe('menu_only');
});

test('an order is priced from the catalog and checked against the menu', function () {
    $owner = tableOwner();
    storeDeviceOnline($owner);
    $table = tableOf($owner);
    $latte = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'name' => 'Latte', 'price_cents' => 9000, 'stock' => null]);
    $latte->syncSizes([['name' => 'Small', 'price' => 90], ['name' => 'Large', 'price' => 120]]);
    $large = $latte->sizes()->get()->firstWhere('name', 'Large');
    $bread = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'name' => 'Pandesal', 'price_cents' => 1500, 'stock' => 2]);
    $foreign = Product::factory()->create();

    placeOrder($this, $table, [['product_id' => $latte->id, 'quantity' => 1]])->assertJsonValidationErrors('items.0.size_id');
    placeOrder($this, $table, [['product_id' => $foreign->id, 'quantity' => 1]])->assertJsonValidationErrors('items.0.product_id');
    placeOrder($this, $table, [['product_id' => $bread->id, 'quantity' => 3]])->assertJsonValidationErrors('items.0.quantity');

    $response = placeOrder($this, $table, [
        ['product_id' => $latte->id, 'size_id' => $large->id, 'quantity' => 2, 'note' => 'Less ice', 'unit_price_cents' => 1],
        ['product_id' => $bread->id, 'quantity' => 2],
    ], 'Drinks first')->assertCreated();

    $order = TableOrder::withoutGlobalScopes()->with('items')->sole();
    expect($order->merchant_id)->toBe($owner->merchant_id)
        ->and($order->status)->toBe(TableOrder::NEW)
        ->and($order->table_name)->toBe('Table 1')
        ->and($order->note)->toBe('Drinks first')
        ->and($order->subtotal_cents)->toBe(2 * 12000 + 2 * 1500)
        ->and($order->items[0]->options)->toBe([['group' => 'Size', 'value' => 'Large', 'price_cents' => 12000]])
        ->and($order->items[0]->note)->toBe('Less ice')
        ->and($response->json('order.token'))->toBe($order->public_token);

    // The phone follows its own order only.
    $this->getJson(route('menu.state', ['token' => $table->token, 'orders' => [$order->public_token]]))
        ->assertJsonPath('orders.0.status', 'new');
    $this->getJson(route('menu.state', ['token' => tableOf($owner, 'Table 2')->token, 'orders' => [$order->public_token]]))
        ->assertJsonCount(0, 'orders');
});

test('a table cannot flood the store with orders', function () {
    $owner = tableOwner();
    storeDeviceOnline($owner);
    $table = tableOf($owner);
    $product = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'stock' => null]);

    foreach (range(1, 3) as $i) {
        placeOrder($this, $table, [['product_id' => $product->id, 'quantity' => 1]])->assertCreated();
    }
    placeOrder($this, $table, [['product_id' => $product->id, 'quantity' => 1]])->assertJsonValidationErrors('order');
});

// Staff

test('staff accept, prepare, and serve orders, always moving forward', function () {
    $owner = tableOwner();
    storeDeviceOnline($owner);
    $table = tableOf($owner);
    $product = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'stock' => null]);
    placeOrder($this, $table, [['product_id' => $product->id, 'quantity' => 2]])->assertCreated();
    $order = TableOrder::withoutGlobalScopes()->sole();
    $cashier = staffWith(['pos.sell'], $owner->merchant);

    $this->actingAs($cashier)->getJson('/orders/feed')
        ->assertJsonPath('active', true)
        ->assertJsonPath('orders.0.table_name', 'Table 1')
        ->assertJsonPath('orders.0.items.0.quantity', 2);

    $this->actingAs($cashier)->patchJson("/orders/{$order->id}", ['status' => 'served'])->assertStatus(409);
    // Accepting a cash order records its sale and hands back the receipt.
    $this->actingAs($cashier)->patchJson("/orders/{$order->id}", ['status' => 'preparing'])->assertOk()
        ->assertJsonPath('receipt.payment_method', 'cash')
        ->assertJsonPath('receipt.cashier', $cashier->name)
        ->assertJsonPath('receipt.items.0.quantity', 2);
    $this->actingAs($cashier)->patchJson("/orders/{$order->id}", ['status' => 'rejected'])->assertStatus(409);
    $this->actingAs($cashier)->patchJson("/orders/{$order->id}", ['status' => 'ready'])->assertOk();
    $this->actingAs($cashier)->patchJson("/orders/{$order->id}", ['status' => 'preparing'])->assertStatus(409);
    $this->actingAs($cashier)->patchJson("/orders/{$order->id}", ['status' => 'served'])->assertOk();

    $order->refresh();
    expect($order->status)->toBe(TableOrder::SERVED)
        ->and($order->accepted_at)->not->toBeNull()
        ->and($order->ready_at)->not->toBeNull()
        ->and($order->served_at)->not->toBeNull();

    // Another store's staff can't see or touch it; staff without the POS can't either.
    $this->actingAs(tableOwner())->patchJson("/orders/{$order->id}", ['status' => 'rejected'])->assertNotFound();
    $this->actingAs(tableOwner())->getJson('/orders/feed')->assertJsonCount(0, 'orders');
    $this->actingAs(staffWith(['products.manage'], $owner->merchant))->getJson('/orders/feed')->assertForbidden();
});

test('charging a table at the POS settles its orders when the sale syncs', function () {
    $owner = tableOwner();
    storeDeviceOnline($owner);
    $table = tableOf($owner);
    $product = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'price_cents' => 5000, 'stock' => null]);
    placeOrder($this, $table, [['product_id' => $product->id, 'quantity' => 2]])->assertCreated();
    $order = TableOrder::withoutGlobalScopes()->sole();
    $order->forceFill(['status' => TableOrder::READY, 'accepted_at' => now()])->save();

    // An order of another store can't be settled by this one.
    $other = tableOwner();
    storeDeviceOnline($other);
    $otherProduct = Product::factory()->create(['merchant_id' => $other->merchant_id, 'stock' => null]);
    placeOrder($this, tableOf($other), [['product_id' => $otherProduct->id, 'quantity' => 1]])->assertCreated();
    $otherOrder = TableOrder::withoutGlobalScopes()->where('merchant_id', $other->merchant_id)->sole();

    $uuid = (string) Str::uuid();
    $this->actingAs($owner)->postJson('/pos/sync/sales', ['sales' => [[
        'client_uuid' => $uuid,
        'sold_at' => now()->toIso8601String(),
        'payment_method' => 'cash',
        'amount_paid_cents' => 20000,
        'table_order_ids' => [$order->id, $otherOrder->id],
        'items' => [['product_id' => $product->id, 'quantity' => 2, 'unit_price_cents' => 5000]],
    ]]])->assertOk()->assertJsonPath('synced', [$uuid]);

    $order->refresh();
    expect($order->settled_at)->not->toBeNull()
        ->and($order->sale_id)->not->toBeNull()
        ->and($order->status)->toBe(TableOrder::SERVED)
        ->and($otherOrder->fresh()->settled_at)->toBeNull();

    auth()->logout();
    $this->getJson(route('menu.state', ['token' => $table->token, 'orders' => [$order->public_token]]))->assertJsonPath('orders.0.paid', true);
    $this->actingAs($owner)->getJson('/orders/feed')->assertJsonCount(0, 'orders');
});

test('the pos knows whether to check for table orders', function () {
    expect(tableOwner()->merchant->posSettings()['table_ordering'])->toBeTrue()
        ->and(tableOwner(pro: false)->merchant->posSettings()['table_ordering'])->toBeFalse()
        ->and(tableOwner(enabled: false)->merchant->posSettings()['table_ordering'])->toBeFalse();
});
