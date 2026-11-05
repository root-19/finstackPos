<?php

use App\Enums\UserRole;
use App\Models\InventoryItem;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\RecipeLine;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Str;

function inventoryOwner(): User
{
    $user = User::factory()->make();
    $user->merchant()->associate(Merchant::factory()->create());
    $user->role = UserRole::Owner;
    $user->save();

    return $user;
}

function stockItem(User $owner, array $attributes = []): InventoryItem
{
    test()->actingAs($owner)->post('/inventory', array_merge([
        'name' => 'Espresso beans', 'unit' => 'g', 'unit_cost' => '1.20', 'opening_quantity' => '1000',
        'reorder_level' => '200', 'is_active' => true,
    ], $attributes))->assertSessionHasNoErrors();

    return InventoryItem::query()->latest('id')->firstOrFail();
}

function sellOnPos(User $user, Product $product, int $quantity, ?string $size = null): void
{
    $price = $size ? $product->sizes->firstWhere('name', $size)->price_cents : $product->price_cents;

    test()->actingAs($user)->postJson('/pos/sync/sales', ['sales' => [[
        'client_uuid' => (string) Str::uuid(),
        'sold_at' => now()->toIso8601String(),
        'payment_method' => 'cash',
        'amount_paid_cents' => 10000000,
        'items' => [[
            'product_id' => $product->id, 'quantity' => $quantity, 'unit_price_cents' => $price,
            'options' => $size ? [['group' => 'Size', 'value' => $size, 'price_cents' => $price]] : [],
        ]],
    ]]])->assertJsonCount(0, 'rejected');
}

test('inventory needs its own permission', function () {
    $this->actingAs(staffWith(['pos.sell', 'products.manage']))->get('/inventory')->assertForbidden();
    $this->actingAs(staffWith(['inventory.manage']))->get('/inventory')->assertOk();
});

test('a new item starts with its opening stock recorded as a count', function () {
    $item = stockItem(inventoryOwner());

    expect($item->quantity)->toBe(1000.0)
        ->and($item->unit_cost_cents)->toBe(120.0)
        ->and($item->valueCents())->toBe(120000)
        ->and($item->movements()->first()->type)->toBe(StockMovement::ADJUSTMENT);
});

test('receiving stock updates the quantity and the average cost', function () {
    $owner = inventoryOwner();
    $item = stockItem($owner);
    $supplier = Supplier::create(['name' => 'Bean Co.']);

    // 1,000 g at ₱1.20 + 500 g at ₱1.50 → ₱1.30 average.
    $this->post("/inventory/items/{$item->id}/movements", [
        'type' => 'purchase', 'quantity' => '500', 'unit_cost' => '1.50', 'supplier_id' => $supplier->id, 'reference' => 'DR-1001',
    ])->assertSessionHasNoErrors();

    $item->refresh();
    expect($item->quantity)->toBe(1500.0)
        ->and($item->unit_cost_cents)->toBe(130.0)
        ->and($item->movements()->latest('id')->first()->total_cost_cents)->toBe(75000);
});

test('waste needs a reason and cannot remove more than is on hand', function () {
    $owner = inventoryOwner();
    $item = stockItem($owner);

    $this->post("/inventory/items/{$item->id}/movements", ['type' => 'waste', 'quantity' => '50'])->assertSessionHasErrors('note');
    $this->post("/inventory/items/{$item->id}/movements", ['type' => 'waste', 'quantity' => '5000', 'note' => 'Spilled'])->assertSessionHasErrors('quantity');
    $this->post("/inventory/items/{$item->id}/movements", ['type' => 'waste', 'quantity' => '50', 'note' => 'Spilled'])->assertSessionHasNoErrors();

    expect($item->fresh()->quantity)->toBe(950.0);
});

test('a count sets the quantity and records the difference', function () {
    $owner = inventoryOwner();
    $item = stockItem($owner);

    $this->post("/inventory/items/{$item->id}/movements", ['type' => 'adjustment', 'quantity' => '940.5', 'note' => 'Weekly count'])->assertSessionHasNoErrors();

    $movement = $item->movements()->latest('id')->first();
    expect($item->fresh()->quantity)->toBe(940.5)
        ->and($movement->quantity_change)->toBe(-59.5);
});

test('a delivery receives several items at once', function () {
    $owner = inventoryOwner();
    $beans = stockItem($owner);
    $cups = stockItem($owner, ['name' => '16 oz cup', 'unit' => 'pcs', 'unit_cost' => '3', 'opening_quantity' => '0']);

    $this->post('/inventory/receive', ['reference' => 'INV-77', 'lines' => [
        ['item_id' => $beans->id, 'quantity' => '1000', 'unit_cost' => '1.20'],
        ['item_id' => $cups->id, 'quantity' => '500', 'unit_cost' => '3'],
    ]])->assertSessionHasNoErrors();

    expect($beans->fresh()->quantity)->toBe(2000.0)
        ->and($cups->fresh()->quantity)->toBe(500.0)
        ->and(StockMovement::where('reference', 'INV-77')->count())->toBe(2);
});

test('selling a product uses up its recipe, per size', function () {
    $owner = inventoryOwner();
    $beans = stockItem($owner);
    $lid = stockItem($owner, ['name' => 'Lid', 'unit' => 'pcs', 'unit_cost' => '1', 'opening_quantity' => '100']);
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 10000, 'stock' => null]);
    $product->syncSizes([['name' => 'Small', 'price' => 100], ['name' => 'Large', 'price' => 150]]);
    $product->load('sizes');
    [$small, $large] = $product->sizes->all();

    $this->actingAs($owner)->put("/inventory/recipes/{$product->id}", ['lines' => [
        ['item_id' => $lid->id, 'size_id' => null, 'quantity' => '1'],
        ['item_id' => $beans->id, 'size_id' => $small->id, 'quantity' => '14'],
        ['item_id' => $beans->id, 'size_id' => $large->id, 'quantity' => '20.5'],
    ]])->assertSessionHasNoErrors();

    sellOnPos($owner, $product, 2, 'Large');
    sellOnPos($owner, $product, 1, 'Small');

    expect($beans->fresh()->quantity)->toBe(1000 - 41 - 14.0)
        ->and($lid->fresh()->quantity)->toBe(97.0)
        ->and(StockMovement::where('type', 'sale')->whereNotNull('sale_id')->count())->toBe(4);
});

test('sales still sync when stock runs out, leaving it below zero', function () {
    $owner = inventoryOwner();
    $cups = stockItem($owner, ['name' => 'Cup', 'unit' => 'pcs', 'opening_quantity' => '1']);
    $product = Product::factory()->for($owner->merchant)->create(['stock' => null]);
    RecipeLine::create(['product_id' => $product->id, 'inventory_item_id' => $cups->id, 'quantity' => 1]);

    sellOnPos($owner, $product, 3);

    expect($cups->fresh()->quantity)->toBe(-2.0);
});

test('the POS catalog carries stock levels, recipes, and the stop-selling setting', function () {
    $owner = inventoryOwner();
    $cups = stockItem($owner, ['name' => 'Cup', 'unit' => 'pcs', 'opening_quantity' => '12']);
    $product = Product::factory()->for($owner->merchant)->create();
    RecipeLine::create(['product_id' => $product->id, 'inventory_item_id' => $cups->id, 'quantity' => 2]);

    $this->put('/inventory/settings', ['blocks_sales' => true])->assertSessionHasNoErrors();

    $this->getJson('/pos/sync/catalog')
        ->assertJsonPath("inventory.items.{$cups->id}.quantity", 12)
        ->assertJsonPath("inventory.recipes.{$product->id}.0.quantity", 2)
        ->assertJsonPath('merchant.inventory_blocks_sales', true);
});

test('recipes only use this store\'s items and the product\'s own sizes', function () {
    $owner = inventoryOwner();
    $product = Product::factory()->for($owner->merchant)->create();
    $foreign = stockItem(inventoryOwner());

    $this->actingAs($owner)->put("/inventory/recipes/{$product->id}", ['lines' => [
        ['item_id' => $foreign->id, 'size_id' => null, 'quantity' => '1'],
    ]])->assertSessionHasErrors('lines.0.item_id');

    $mine = stockItem($owner);
    $this->put("/inventory/recipes/{$product->id}", ['lines' => [
        ['item_id' => $mine->id, 'size_id' => 999999, 'quantity' => '1'],
    ]])->assertSessionHasErrors('lines');
});
