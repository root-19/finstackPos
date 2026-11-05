<?php

use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\BranchProduct;
use App\Models\Employee;
use App\Models\InventoryItem;
use App\Models\InventoryStock;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\RecipeLine;
use App\Models\User;
use Illuminate\Support\Str;

/** A Pro store with a main branch and a "Mall" branch. */
function twoBranchStore(): array
{
    $merchant = Merchant::factory()->create();
    $merchant->forceFill(['subscribed_until' => now()->addMonth()])->save();
    $owner = User::factory()->make();
    $owner->merchant()->associate($merchant);
    $owner->role = UserRole::Owner;
    $owner->save();

    $mall = new Branch(['name' => 'Mall']);
    $mall->merchant_id = $merchant->id;
    $mall->save();

    return [$owner, $merchant->mainBranch(), $mall];
}

function branchStockItem(User $owner, string $name = 'Milk'): InventoryItem
{
    $item = new InventoryItem(['name' => $name, 'unit' => 'mL', 'is_active' => true]);
    $item->merchant_id = $owner->merchant_id;
    $item->unit_cost_cents = 10;
    $item->save();

    return $item;
}

function held(InventoryItem $item, Branch $branch): float
{
    return (float) (InventoryStock::query()->where('inventory_item_id', $item->id)->where('branch_id', $branch->id)->value('quantity') ?? 0);
}

function sellAt($test, User $cashier, Product $product, Branch $branch, int $quantity = 1): void
{
    $uuid = (string) Str::uuid();
    $test->actingAs($cashier)->postJson('/pos/sync/sales', ['sales' => [[
        'client_uuid' => $uuid,
        'branch_id' => $branch->id,
        'sold_at' => now()->toIso8601String(),
        'payment_method' => 'cash',
        'amount_paid_cents' => $product->price_cents * $quantity,
        'items' => [['product_id' => $product->id, 'quantity' => $quantity, 'unit_price_cents' => $product->price_cents]],
    ]]])->assertOk()->assertJsonPath('synced', [$uuid]);
}

test('each branch holds its own stock and the item total is their sum', function () {
    [$owner, $main, $mall] = twoBranchStore();
    $milk = branchStockItem($owner);

    $this->actingAs($owner)->post("/inventory/items/{$milk->id}/movements", ['type' => 'purchase', 'quantity' => 1000, 'branch_id' => $main->id])->assertSessionHasNoErrors();
    $this->actingAs($owner)->post('/inventory/receive', ['branch_id' => $mall->id, 'lines' => [['item_id' => $milk->id, 'quantity' => 300]]])->assertSessionHasNoErrors();
    $this->actingAs($owner)->post("/inventory/items/{$milk->id}/movements", ['type' => 'adjustment', 'quantity' => 250, 'branch_id' => $mall->id, 'note' => 'Count'])->assertSessionHasNoErrors();

    expect(held($milk, $main))->toBe(1000.0)
        ->and(held($milk, $mall))->toBe(250.0)
        ->and($milk->fresh()->quantity)->toBe(1250.0);

    // The mall can't throw away more than the mall has, whatever the main branch holds.
    $this->actingAs($owner)->post("/inventory/items/{$milk->id}/movements", ['type' => 'waste', 'quantity' => 400, 'branch_id' => $mall->id, 'note' => 'Spilled'])->assertSessionHasErrors('quantity');

    $this->actingAs($owner)->get("/inventory?branch={$mall->id}")->assertInertia(fn ($page) => $page
        ->where('branch', $mall->id)
        ->where('items.0.quantity', 250));
    $this->actingAs($owner)->get('/inventory')->assertInertia(fn ($page) => $page
        ->where('branch', null)
        ->where('items.0.quantity', 1250)
        ->has('items.0.by_branch', 2));
});

test('staff tied to a branch see and move only its stock', function () {
    [$owner, $main, $mall] = twoBranchStore();
    $milk = branchStockItem($owner);
    $keeper = staffWith(['inventory.manage'], $owner->merchant);
    $keeper->branch_id = $mall->id;
    $keeper->save();

    // Asking for the main branch still records at the mall.
    $this->actingAs($keeper)->post("/inventory/items/{$milk->id}/movements", ['type' => 'purchase', 'quantity' => 500, 'branch_id' => $main->id])->assertSessionHasNoErrors();
    expect(held($milk, $mall))->toBe(500.0)->and(held($milk, $main))->toBe(0.0);

    $this->actingAs($keeper)->get("/inventory?branch={$main->id}")->assertInertia(fn ($page) => $page
        ->where('branch', $mall->id)
        ->where('branchLocked', true)
        ->where('items.0.quantity', 500));
    $this->actingAs($keeper)->get('/inventory/history')->assertInertia(fn ($page) => $page->has('movements.data', 1)->where('branches', []));
});

test('a sale uses up its recipe at the branch that sold it', function () {
    [$owner, $main, $mall] = twoBranchStore();
    $this->actingAs($owner);
    $milk = branchStockItem($owner);
    app(\App\Services\Inventory\InventoryService::class)->move($milk, 'purchase', 1000, ['branch_id' => $main->id]);
    app(\App\Services\Inventory\InventoryService::class)->move($milk, 'purchase', 1000, ['branch_id' => $mall->id]);
    $latte = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'stock' => null, 'price_cents' => 12000]);
    $line = new RecipeLine(['product_id' => $latte->id, 'inventory_item_id' => $milk->id, 'quantity' => 200]);
    $line->merchant_id = $owner->merchant_id;
    $line->save();

    sellAt($this, $owner, $latte, $mall, 2);

    expect(held($milk, $mall))->toBe(600.0)
        ->and(held($milk, $main))->toBe(1000.0)
        ->and($milk->fresh()->quantity)->toBe(1600.0);
});

test('a product is sold at chosen branches, each counting its own stock', function () {
    [$owner, $main, $mall] = twoBranchStore();

    $this->actingAs($owner)->post('/products', [
        'name' => 'Mall Special', 'sku' => 'MALL-1', 'price' => '50', 'is_active' => true,
        'all_branches' => false, 'branch_ids' => [$mall->id], 'stock' => 9, 'branch_stock' => [$mall->id => 7],
    ])->assertSessionHasNoErrors();
    $this->actingAs($owner)->post('/products', [
        'name' => 'Bottled Water', 'sku' => 'WATER', 'price' => '20', 'is_active' => true,
        'all_branches' => true, 'stock' => 0, 'branch_stock' => [$main->id => 10, $mall->id => 4],
    ])->assertSessionHasNoErrors();
    $this->actingAs($owner)->post('/products', ['name' => 'Nowhere', 'sku' => 'NONE', 'price' => '5', 'is_active' => true, 'all_branches' => false])
        ->assertSessionHasErrors('branch_ids');

    $special = Product::withoutGlobalScopes()->firstWhere('sku', 'MALL-1');
    $water = Product::withoutGlobalScopes()->firstWhere('sku', 'WATER');
    expect($special->stock)->toBe(7)->and($water->stock)->toBe(14)
        ->and($special->all_branches)->toBeFalse();

    $catalog = $this->actingAs($owner)->getJson('/pos/sync/catalog')->json('products');
    $byName = collect($catalog)->keyBy('name');
    expect($byName['Mall Special']['branch_ids'])->toBe([$mall->id])
        ->and($byName['Bottled Water']['branch_ids'])->toBeNull()
        ->and($byName['Bottled Water']['branch_stock'])->toEqual([$main->id => 10, $mall->id => 4]);

    // Selling at the mall lowers the mall's count and the total only.
    sellAt($this, $owner, $water, $mall, 3);
    expect(BranchProduct::query()->where('product_id', $water->id)->where('branch_id', $mall->id)->value('stock'))->toBe(1)
        ->and(BranchProduct::query()->where('product_id', $water->id)->where('branch_id', $main->id)->value('stock'))->toBe(10)
        ->and($water->fresh()->stock)->toBe(11);

    $this->actingAs($owner)->get("/products?branch={$main->id}")->assertInertia(fn ($page) => $page->has('products.data', 1)->where('products.data.0.name', 'Bottled Water'));
});

test('a table menu only offers what its branch sells', function () {
    [$owner, $main, $mall] = twoBranchStore();
    $owner->merchant->update(['table_ordering_enabled' => true]);
    $special = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'name' => 'Mall Special', 'stock' => null, 'all_branches' => false]);
    BranchProduct::query()->create(['product_id' => $special->id, 'branch_id' => $mall->id, 'stock' => null]);
    Product::factory()->create(['merchant_id' => $owner->merchant_id, 'name' => 'Everywhere', 'stock' => null]);

    $menuAt = function (Branch $branch) use ($owner) {
        $table = new \App\Models\DiningTable(['name' => 'T '.$branch->id, 'branch_id' => $branch->id]);
        $table->merchant_id = $owner->merchant_id;
        $table->save();

        return $this->get(route('menu.show', $table->token));
    };

    $menuAt($main)->assertInertia(fn ($page) => $page->has('products', 1)->where('products.0.name', 'Everywhere'));
    $menuAt($mall)->assertInertia(fn ($page) => $page->has('products', 2));
});

test('employees are placed at a branch, and their login follows', function () {
    [$owner, $main, $mall] = twoBranchStore();
    $role = $owner->merchant->roles()->first();

    $this->actingAs($owner)->post('/team/employees', [
        'name' => 'Ana Cruz', 'status' => 'active', 'branch_id' => $mall->id,
        'email' => 'ana@example.test', 'password' => 'secret-pass-123', 'password_confirmation' => 'secret-pass-123',
        'role_mode' => 'existing', 'role_id' => $role->id,
    ])->assertSessionHasNoErrors();

    $ana = Employee::withoutGlobalScopes()->firstWhere('name', 'Ana Cruz');
    expect($ana->branch_id)->toBe($mall->id)->and($ana->user->branch_id)->toBe($mall->id);

    $this->actingAs($owner)->put("/team/employees/{$ana->id}", ['name' => 'Ana Cruz', 'status' => 'active', 'branch_id' => null, 'email' => 'ana@example.test', 'role_mode' => 'existing', 'role_id' => $role->id])
        ->assertSessionHasNoErrors();
    expect($ana->fresh()->branch_id)->toBeNull()->and($ana->user->fresh()->branch_id)->toBeNull();

    // Choosing on the Branches page updates the employee too.
    $this->actingAs($owner)->patch("/branches/staff/{$ana->user_id}", ['branch_id' => $main->id])->assertSessionHasNoErrors();
    expect($ana->fresh()->branch_id)->toBe($main->id);

    $this->actingAs($owner)->post('/team/employees', ['name' => 'Elsewhere', 'status' => 'active', 'branch_id' => twoBranchStore()[2]->id, 'email' => 'x@example.test',
        'password' => 'secret-pass-123', 'password_confirmation' => 'secret-pass-123', 'role_mode' => 'existing', 'role_id' => $role->id])
        ->assertSessionHasErrors('branch_id');
});

test('reports show one branch, or the overall total with each branch', function () {
    [$owner, $main, $mall] = twoBranchStore();
    $product = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'stock' => null, 'price_cents' => 10000]);
    sellAt($this, $owner, $product, $main, 1);
    sellAt($this, $owner, $product, $mall, 3);
    $milk = branchStockItem($owner);
    app(\App\Services\Inventory\InventoryService::class)->move($milk, 'purchase', 100, ['branch_id' => $mall->id, 'unit_cost_cents' => 10]);

    $this->actingAs($owner)->get('/reports?type=sales')->assertInertia(fn ($page) => $page
        ->where('report.summary.net_cents', 40000)
        ->has('report.branches', 2)
        ->where('report.branches.1.branch', 'Mall')
        ->where('report.branches.1.net_cents', 30000)
        ->where('report.branches.1.share_pct', 75)
        ->has('branches', 2));
    $this->actingAs($owner)->get("/reports?type=sales&branch={$mall->id}")->assertInertia(fn ($page) => $page
        ->where('report.summary.net_cents', 30000)
        ->where('report.branches', null)
        ->where('filters.branch', $mall->id));
    $this->actingAs($owner)->get("/reports?type=inventory&branch={$main->id}")->assertInertia(fn ($page) => $page
        ->where('report.items.0.on_hand', 0)
        ->where('report.summary.purchases_cents', 0));
    $this->actingAs($owner)->get('/reports?type=inventory')->assertInertia(fn ($page) => $page
        ->where('report.items.0.on_hand', 100)
        ->where('report.branches.1.value_cents', 1000));

    // A manager tied to the main branch only ever gets it.
    $manager = staffWith(['sales.view'], $owner->merchant);
    $manager->branch_id = $main->id;
    $manager->save();
    $this->actingAs($manager)->get("/reports?type=sales&branch={$mall->id}")->assertInertia(fn ($page) => $page
        ->where('report.summary.net_cents', 10000)
        ->where('branches', []));
});
