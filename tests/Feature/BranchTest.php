<?php

use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\DiningTable;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Support\Str;

function branchOwner(bool $pro = true): User
{
    $merchant = Merchant::factory()->create();
    $merchant->forceFill(['subscribed_until' => $pro ? now()->addMonth() : null])->save();

    $user = User::factory()->make();
    $user->merchant()->associate($merchant);
    $user->role = UserRole::Owner;
    $user->save();

    return $user;
}

function addBranch(User $owner, string $name): Branch
{
    $branch = new Branch(['name' => $name]);
    $branch->merchant_id = $owner->merchant_id;
    $branch->save();

    return $branch;
}

function syncSale($test, User $cashier, Product $product, ?int $branchId, int $cents = 10000): string
{
    $uuid = (string) Str::uuid();
    // Registers only ever sell at the catalog price.
    $product->forceFill(['price_cents' => $cents])->save();
    $test->actingAs($cashier)->postJson('/pos/sync/sales', ['sales' => [[
        'client_uuid' => $uuid,
        'branch_id' => $branchId,
        'sold_at' => now()->toIso8601String(),
        'payment_method' => 'cash',
        'amount_paid_cents' => $cents,
        'items' => [['product_id' => $product->id, 'quantity' => 1, 'unit_price_cents' => $cents]],
    ]]])->assertOk()->assertJsonPath('synced', [$uuid]);

    return $uuid;
}

test('every store starts with a main branch the pos can sell at', function () {
    $owner = branchOwner();
    $main = $owner->merchant->mainBranch();

    expect($main->name)->toBe('Main branch')
        ->and(Branch::withoutGlobalScopes()->where('merchant_id', $owner->merchant_id)->count())->toBe(1)
        ->and($owner->merchant->posSettings()['branches'])->toBe([['id' => $main->id, 'name' => 'Main branch']]);
});

test('owners on pro add, rename, and close branches', function () {
    $owner = branchOwner();

    $this->actingAs($owner)->post('/branches', ['name' => 'SM Masinag', 'address' => 'Antipolo'])->assertSessionHasNoErrors();
    $this->actingAs($owner)->post('/branches', ['name' => 'SM Masinag'])->assertSessionHasErrors('name');
    $branch = Branch::withoutGlobalScopes()->firstWhere('name', 'SM Masinag');

    $this->actingAs($owner)->put("/branches/{$branch->id}", ['name' => 'Masinag', 'is_active' => false])->assertSessionHasNoErrors();
    expect($branch->fresh()->name)->toBe('Masinag')->and($branch->fresh()->is_active)->toBeFalse();
    expect(collect($owner->merchant->posSettings()['branches'])->pluck('name')->all())->toBe(['Main branch']);

    // The last open branch stays open.
    $main = $owner->merchant->mainBranch();
    $this->actingAs($owner)->put("/branches/{$main->id}", ['name' => 'Main branch', 'is_active' => false])->assertSessionHasErrors('is_active');

    // Free stores and staff can't manage branches; nobody reaches another store's.
    $this->actingAs(branchOwner(pro: false))->get('/branches')->assertRedirect(route('subscription.index'));
    $this->actingAs(staffWith(['pos.sell', 'sales.view'], $owner->merchant))->get('/branches')->assertForbidden();
    $this->actingAs(branchOwner())->put("/branches/{$branch->id}", ['name' => 'Taken'])->assertNotFound();
});

test('a branch with sales is closed, not deleted', function () {
    $owner = branchOwner();
    $empty = addBranch($owner, 'Pop-up');
    $busy = addBranch($owner, 'Mall');
    $product = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'stock' => null]);
    syncSale($this, $owner, $product, $busy->id);

    $this->actingAs($owner)->delete("/branches/{$busy->id}")->assertSessionHasErrors('branch');
    $this->actingAs($owner)->delete("/branches/{$empty->id}")->assertSessionHasNoErrors();

    expect(Branch::withoutGlobalScopes()->find($empty->id))->toBeNull()
        ->and(Branch::withoutGlobalScopes()->find($busy->id))->not->toBeNull();
});

test('each sale is recorded at the branch the register sells for', function () {
    $owner = branchOwner();
    $main = $owner->merchant->mainBranch();
    $mall = addBranch($owner, 'Mall');
    $product = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'stock' => null]);
    $otherStoreBranch = branchOwner()->merchant->mainBranch();

    $atMall = syncSale($this, $owner, $product, $mall->id);
    $noBranch = syncSale($this, $owner, $product, null);
    $foreign = syncSale($this, $owner, $product, $otherStoreBranch->id);

    // A cashier tied to the mall always sells there, whatever the device says.
    $cashier = staffWith(['pos.sell'], $owner->merchant);
    $cashier->branch_id = $mall->id;
    $cashier->save();
    $tied = syncSale($this, $cashier, $product, $main->id);

    $branchOf = fn (string $uuid) => Sale::withoutGlobalScopes()->firstWhere('client_uuid', $uuid)->branch_id;
    expect($branchOf($atMall))->toBe($mall->id)
        ->and($branchOf($noBranch))->toBe($main->id)
        ->and($branchOf($foreign))->toBe($main->id)
        ->and($branchOf($tied))->toBe($mall->id);
});

test('staff tied to a branch only see its sales; the owner sees and filters all', function () {
    $owner = branchOwner();
    $main = $owner->merchant->mainBranch();
    $mall = addBranch($owner, 'Mall');
    $product = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'stock' => null]);
    syncSale($this, $owner, $product, $main->id, 10000);
    syncSale($this, $owner, $product, $mall->id, 25000);
    $mainSale = Sale::withoutGlobalScopes()->where('branch_id', $main->id)->sole();

    $manager = staffWith(['sales.view'], $owner->merchant);
    $manager->branch_id = $mall->id;
    $manager->save();

    $this->actingAs($manager)->get('/sales')->assertInertia(fn ($page) => $page
        ->has('sales.data', 1)
        ->where('sales.data.0.branch', 'Mall')
        ->where('summary.filtered_total_cents', 25000)
        ->where('branches', []));
    $this->actingAs($manager)->get("/sales/{$mainSale->id}")->assertNotFound();

    $this->actingAs($owner)->get('/sales')->assertInertia(fn ($page) => $page->has('sales.data', 2)->has('branches', 2));
    $this->actingAs($owner)->get("/sales?branch={$main->id}")->assertInertia(fn ($page) => $page
        ->has('sales.data', 1)
        ->where('summary.filtered_total_cents', 10000));
    $this->actingAs($owner)->get('/dashboard')->assertInertia(fn ($page) => $page
        ->where('sales.branches.0.name', 'Mall')
        ->where('sales.branches.0.total_cents', 25000));
});

test('the command center compares what each branch earned', function () {
    $owner = branchOwner();
    $main = $owner->merchant->mainBranch();
    $mall = addBranch($owner, 'Mall');
    $product = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'name' => 'Iced Latte', 'stock' => null]);
    syncSale($this, $owner, $product, $mall->id, 30000);
    syncSale($this, $owner, $product, $mall->id, 10000);
    syncSale($this, $owner, $product, $main->id, 5000);
    $this->travel(-8)->days();
    syncSale($this, $owner, $product, $mall->id, 20000);
    $this->travelBack();

    $this->actingAs($owner)->get('/branches')->assertOk()->assertInertia(fn ($page) => $page
        ->component('Branches/Index')
        ->has('branches', 2)
        ->where('branches.1.name', 'Mall')
        ->where('branches.1.total_cents', 40000)
        ->where('branches.1.count', 2)
        ->where('branches.1.average_cents', 20000)
        ->where('branches.1.top.name', 'Iced Latte')
        ->where('branches.0.total_cents', 5000)
        ->has('dates', 7));

    // The 7 days before hold the mall's older sale.
    $this->actingAs($owner)->get('/branches?from='.now()->subDays(13)->toDateString().'&to='.now()->subDays(7)->toDateString())
        ->assertInertia(fn ($page) => $page->where('branches.1.total_cents', 20000)->where('branches.0.total_cents', 0));
});

test('owners tie staff to a branch', function () {
    $owner = branchOwner();
    $mall = addBranch($owner, 'Mall');
    $cashier = staffWith(['pos.sell'], $owner->merchant);

    $this->actingAs($owner)->patch("/branches/staff/{$cashier->id}", ['branch_id' => $mall->id])->assertSessionHasNoErrors();
    expect($cashier->fresh()->branch_id)->toBe($mall->id);

    $this->actingAs($owner)->patch("/branches/staff/{$cashier->id}", ['branch_id' => null])->assertSessionHasNoErrors();
    expect($cashier->fresh()->branch_id)->toBeNull();

    $this->actingAs($owner)->patch("/branches/staff/{$owner->id}", ['branch_id' => $mall->id])->assertForbidden();
    $this->actingAs($owner)->patch("/branches/staff/{$cashier->id}", ['branch_id' => branchOwner()->merchant->mainBranch()->id])->assertSessionHasErrors('branch_id');
    $this->actingAs(branchOwner())->patch("/branches/staff/{$cashier->id}", ['branch_id' => null])->assertNotFound();
});

test('table orders go to their own branch', function () {
    $owner = branchOwner();
    $owner->merchant->update(['table_ordering_enabled' => true]);
    $main = $owner->merchant->mainBranch();
    $mall = addBranch($owner, 'Mall');
    $product = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'stock' => null]);
    $table = new DiningTable(['name' => 'Table 1', 'branch_id' => $mall->id]);
    $table->merchant_id = $owner->merchant_id;
    $table->save();

    // Only a device following the mall opens the mall's menus.
    $this->actingAs($owner)->getJson("/orders/feed?branch={$main->id}")->assertJsonPath('branch.name', 'Main branch');
    auth()->logout();
    expect($this->getJson(route('menu.state', $table->token))->json('state'))->toBe('offline');

    $this->actingAs($owner)->getJson("/orders/feed?branch={$mall->id}")->assertJsonPath('branch.name', 'Mall');
    auth()->logout();
    expect($this->getJson(route('menu.state', $table->token))->json('state'))->toBe('open');

    $this->postJson(route('menu.order', $table->token), ['items' => [['product_id' => $product->id, 'quantity' => 1]], 'payment_method' => 'cash'])->assertCreated();

    $this->actingAs($owner)->getJson("/orders/feed?branch={$main->id}")->assertJsonCount(0, 'orders');
    $this->actingAs($owner)->getJson("/orders/feed?branch={$mall->id}")->assertJsonCount(1, 'orders');

    // A cashier tied to the main branch never gets the mall's orders.
    $cashier = staffWith(['pos.sell'], $owner->merchant);
    $cashier->branch_id = $main->id;
    $cashier->save();
    $this->actingAs($cashier)->getJson("/orders/feed?branch={$mall->id}")->assertJsonPath('branch.name', 'Main branch')->assertJsonCount(0, 'orders');
});

test('administrators see each store\'s sales per branch', function () {
    $owner = branchOwner();
    $mall = addBranch($owner, 'Mall');
    $product = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'stock' => null]);
    syncSale($this, $owner, $product, $mall->id, 15000);

    $admin = User::factory()->create();
    $admin->forceFill(['is_admin' => true, 'merchant_id' => null])->save();

    $this->actingAs($admin)->get("/admin/stores/{$owner->merchant_id}")->assertOk()->assertInertia(fn ($page) => $page
        ->has('branches', 2)
        ->where('branches.1.name', 'Mall')
        ->where('branches.1.sales', 1)
        ->where('branches.1.sales_cents', 15000)
        ->where('branches.0.sales_cents', 0));
    $this->actingAs($admin)->get('/admin/stores')->assertInertia(fn ($page) => $page->where('stores.data.0.branches', 2));
});

test('a store on its free trial takes table orders without any setting', function () {
    $owner = branchOwner(pro: false);
    $this->actingAs($owner)->post('/subscription/trial')->assertSessionHasNoErrors();
    $merchant = $owner->merchant->fresh();
    $table = new DiningTable(['name' => 'Table 1', 'branch_id' => $merchant->mainBranch()->id]);
    $table->merchant_id = $merchant->id;
    $table->save();

    expect($merchant->onTrial())->toBeTrue()->and($merchant->tableOrderingActive())->toBeTrue();

    // The owner only has the dashboard open: it polls every branch.
    $this->actingAs($owner)->getJson('/orders/feed?branch=all')->assertOk();
    auth()->logout();
    expect($this->getJson(route('menu.state', $table->token))->json('state'))->toBe('open');
});

test('a back-office page follows the orders of every branch', function () {
    $owner = branchOwner();
    $main = $owner->merchant->mainBranch();
    $mall = addBranch($owner, 'Mall');
    $product = Product::factory()->create(['merchant_id' => $owner->merchant_id, 'stock' => null]);
    $tables = collect([$main, $mall])->map(function (Branch $branch) use ($owner) {
        $table = new DiningTable(['name' => 'Table 1', 'branch_id' => $branch->id]);
        $table->merchant_id = $owner->merchant_id;
        $table->save();

        return $table;
    });

    $this->actingAs($owner)->getJson('/orders/feed?branch=all')->assertJsonPath('branch', null);
    auth()->logout();
    foreach ($tables as $table) {
        $this->postJson(route('menu.order', $table->token), ['items' => [['product_id' => $product->id, 'quantity' => 1]], 'payment_method' => 'cash'])->assertCreated();
    }

    $this->actingAs($owner)->getJson('/orders/feed?branch=all')
        ->assertJsonCount(2, 'orders')
        ->assertJsonPath('orders.1.table_name', 'Table 1 · Mall');

    // Someone tied to the main branch still only gets theirs.
    $cashier = staffWith(['pos.sell'], $owner->merchant);
    $cashier->branch_id = $main->id;
    $cashier->save();
    $this->actingAs($cashier)->getJson('/orders/feed?branch=all')->assertJsonCount(1, 'orders')->assertJsonPath('branch.name', 'Main branch');
});
