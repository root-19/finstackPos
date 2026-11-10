<?php

use App\Enums\UserRole;
use App\Models\Category;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Support\Str;

// These tests cover Pro features; every store they create is subscribed.
beforeEach(fn () => Merchant::creating(fn (Merchant $m) => $m->subscribed_until ??= now()->addYear()));

function storeUser(UserRole $role = UserRole::Owner, ?Merchant $merchant = null): User
{
    $user = User::factory()->make();
    $user->merchant()->associate($merchant ?? Merchant::factory()->create());
    $user->role = $role;
    $user->save();

    return $user;
}

function makeSale(Merchant $merchant, array $attributes = []): Sale
{
    $sale = new Sale(array_merge([
        'client_uuid' => (string) Str::uuid(),
        'payment_method' => 'cash',
        'subtotal_cents' => 10000,
        'tax_cents' => 0,
        'total_cents' => 10000,
        'amount_paid_cents' => 10000,
        'change_cents' => 0,
        'sold_at' => now(),
    ], $attributes));
    $sale->merchant()->associate($merchant);
    $sale->save();

    return $sale;
}

// Products

test('products need the manage-products permission', function () {
    $this->actingAs(storeUser())->get('/products')->assertOk();
    $this->actingAs(staffWith(['products.manage']))->get('/products')->assertOk();
    $this->actingAs(staffWith(['pos.sell', 'categories.manage']))->get('/products')->assertForbidden();
});

test('a product can be created with the price converted to cents', function () {
    $user = storeUser();
    $category = Category::factory()->for($user->merchant)->create();

    $this->actingAs($user)->post('/products', [
        'name' => 'Iced Coffee',
        'sku' => 'COF-1',
        'barcode' => null,
        'category_id' => $category->id,
        'price' => '65.50',
        'stock' => 12,
        'is_active' => true,
    ])->assertSessionHasNoErrors()->assertRedirect();

    $product = Product::firstWhere('sku', 'COF-1');
    expect($product->price_cents)->toBe(6550)
        ->and($product->merchant_id)->toBe($user->merchant_id)
        ->and($product->stock)->toBe(12);
});

test('skus are unique per store, not globally', function () {
    $user = storeUser();
    Product::factory()->create(['sku' => 'SHARED']);

    $this->actingAs($user)->post('/products', [
        'name' => 'Mine', 'sku' => 'SHARED', 'price' => '10', 'is_active' => true,
    ])->assertSessionHasNoErrors();

    $this->post('/products', [
        'name' => 'Duplicate', 'sku' => 'SHARED', 'price' => '10', 'is_active' => true,
    ])->assertSessionHasErrors('sku');
});

test('a barcode can hold a QR code\'s text, up to 255 characters', function () {
    $user = storeUser();
    $qr = 'https://example.com/p/'.str_repeat('a', 233);

    $this->actingAs($user)->post('/products', [
        'name' => 'QR item', 'sku' => 'QR-1', 'barcode' => $qr, 'price' => '10', 'is_active' => true,
    ])->assertSessionHasNoErrors();
    expect(Product::firstWhere('sku', 'QR-1')->barcode)->toBe($qr);

    $this->post('/products', [
        'name' => 'Too long', 'sku' => 'QR-2', 'barcode' => $qr.'b', 'price' => '10', 'is_active' => true,
    ])->assertSessionHasErrors('barcode');
});

test('another store\'s category cannot be assigned', function () {
    $user = storeUser();
    $foreign = Category::factory()->create();

    $this->actingAs($user)->post('/products', [
        'name' => 'X', 'sku' => 'X-1', 'price' => '10', 'is_active' => true, 'category_id' => $foreign->id,
    ])->assertSessionHasErrors('category_id');
});

test('another store\'s product cannot be updated or deleted', function () {
    $user = storeUser();
    $foreign = Product::factory()->create();

    $this->actingAs($user)->put("/products/{$foreign->id}", [
        'name' => 'Hijacked', 'sku' => 'H', 'price' => '1', 'is_active' => true,
    ])->assertNotFound();
    $this->delete("/products/{$foreign->id}")->assertNotFound();

    expect($foreign->fresh()->name)->not->toBe('Hijacked')
        ->and($foreign->fresh()->trashed())->toBeFalse();
});

test('deleting a category uncategorizes its products', function () {
    $user = storeUser();
    $category = Category::factory()->for($user->merchant)->create();
    $product = Product::factory()->for($user->merchant)->create(['category_id' => $category->id]);

    $this->actingAs($user)->delete("/categories/{$category->id}")->assertRedirect();

    expect($product->fresh()->category_id)->toBeNull()
        ->and($category->fresh()->trashed())->toBeTrue();
});

// Sales

test('sales lists only the store\'s own sales', function () {
    $user = staffWith(['sales.view']);
    makeSale($user->merchant, ['total_cents' => 12300]);
    makeSale(Merchant::factory()->create(), ['total_cents' => 99900]);

    $this->actingAs($user)->get('/sales')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('Sales/Index')
            ->has('sales.data', 1)
            ->where('summary.filtered_total_cents', 12300));
});

test('staff without the view-sales permission cannot view sales', function () {
    $this->actingAs(staffWith(['pos.sell']))->get('/sales')->assertForbidden();
});

test('another store\'s sale cannot be viewed', function () {
    $foreign = makeSale(Merchant::factory()->create());

    $this->actingAs(storeUser())->get("/sales/{$foreign->id}")->assertNotFound();
});

test('today\'s total uses the store\'s timezone', function () {
    $merchant = Merchant::factory()->create(['timezone' => 'Asia/Manila']);
    $user = storeUser(UserRole::Owner, $merchant);
    $this->travelTo(now()->setTimezone('Asia/Manila')->setTime(9, 0));

    // 7:30am Manila today is still "yesterday" in UTC.
    makeSale($merchant, ['total_cents' => 5000, 'sold_at' => now('Asia/Manila')->setTime(7, 30)->utc()]);
    makeSale($merchant, ['total_cents' => 7000, 'sold_at' => now('Asia/Manila')->subDay()->setTime(20, 0)->utc()]);

    $this->actingAs($user)->get('/sales')
        ->assertInertia(fn ($page) => $page
            ->where('summary.today_total_cents', 5000)
            ->where('summary.today_count', 1));
});

// Staff & roles

test('only owners can manage staff and roles', function () {
    $this->actingAs(storeUser())->get('/team/employees')->assertOk();
    $this->get('/staff')->assertRedirect('/team/employees');

    // Even a role with every assignable permission can't manage the team.
    $allAccess = staffWith(['pos.sell', 'products.manage', 'categories.manage', 'sales.view', 'schedules.manage', 'attendance.manage']);
    $this->actingAs($allAccess)->get('/team/employees')->assertForbidden();
    $this->post('/staff', [])->assertForbidden();
    $this->post('/roles', ['name' => 'Boss', 'permissions' => []])->assertForbidden();
});

test('every new store starts with editable manager and cashier roles', function () {
    $merchant = Merchant::factory()->create();

    expect($merchant->roles()->pluck('name')->sort()->values()->all())->toBe(['Cashier', 'Manager']);
});

test('owners can create a role with chosen access', function () {
    $owner = storeUser();

    $this->actingAs($owner)->post('/roles', [
        'name' => 'Barista',
        'permissions' => ['pos.sell', 'products.manage'],
    ])->assertSessionHasNoErrors();

    $role = $owner->merchant->roles()->firstWhere('name', 'Barista');
    expect($role->permissions)->toBe(['pos.sell', 'products.manage']);
});

test('owner-only access cannot be given to a role', function () {
    $this->actingAs(storeUser())->post('/roles', [
        'name' => 'Assistant',
        'permissions' => ['pos.sell', 'staff.manage'],
    ])->assertSessionHasErrors('permissions.1');

    $this->post('/roles', ['name' => 'Owner', 'permissions' => []])->assertSessionHasErrors('name');
});

test('a role\'s access applies to its staff right away', function () {
    $owner = storeUser();
    $staff = staffWith(['pos.sell'], $owner->merchant);

    $this->actingAs($staff)->get('/products')->assertForbidden();

    $this->actingAs($owner)->put("/roles/{$staff->role_id}", [
        'name' => 'Senior Barista',
        'permissions' => ['pos.sell', 'products.manage'],
    ])->assertSessionHasNoErrors();

    $this->actingAs($staff->fresh())->get('/products')->assertOk();
});

test('a role with staff cannot be deleted', function () {
    $owner = storeUser();
    $staff = staffWith(['pos.sell'], $owner->merchant);
    $roleId = $staff->role_id;

    $this->actingAs($owner)->delete("/roles/{$roleId}")->assertSessionHasErrors('role');
    expect($staff->fresh()->role_id)->toBe($roleId);

    $staff->delete();
    $this->delete("/roles/{$roleId}")->assertSessionHasNoErrors();
});

test('another store\'s role cannot be edited or assigned', function () {
    $owner = storeUser();
    $foreignRoleId = staffWith(['pos.sell'])->role_id;

    $this->actingAs($owner)->put("/roles/{$foreignRoleId}", ['name' => 'X', 'permissions' => []])->assertNotFound();

    $this->post('/staff', [
        'name' => 'Juan', 'email' => 'juan@example.com', 'role_id' => $foreignRoleId,
        'password' => 'password', 'password_confirmation' => 'password',
    ])->assertSessionHasErrors('role_id');
});

test('owners can add staff with one of their roles', function () {
    $owner = storeUser();
    $role = $owner->merchant->roles()->firstWhere('name', 'Cashier');

    $this->actingAs($owner)->post('/staff', [
        'name' => 'Juan',
        'email' => 'juan@example.com',
        'role_id' => $role->id,
        'password' => 'password',
        'password_confirmation' => 'password',
    ])->assertSessionHasNoErrors();

    $staff = User::firstWhere('email', 'juan@example.com');
    expect($staff->merchant_id)->toBe($owner->merchant_id)
        ->and($staff->role)->toBe(UserRole::Staff)
        ->and($staff->role_id)->toBe($role->id)
        // New staff also land on the Employee List.
        ->and($staff->employee?->name)->toBe('Juan');
});

test('owners cannot change or remove themselves', function () {
    $owner = storeUser();
    $role = $owner->merchant->roles()->first();

    $this->actingAs($owner)->patch("/staff/{$owner->id}", ['role_id' => $role->id])->assertForbidden();
    $this->delete("/staff/{$owner->id}")->assertForbidden();

    expect($owner->fresh()->role)->toBe(UserRole::Owner);
});

test('owners cannot touch another store\'s staff', function () {
    $foreign = staffWith(['pos.sell']);
    $owner = storeUser();
    $ownRoleId = $owner->merchant->roles()->first()->id;

    $this->actingAs($owner)->patch("/staff/{$foreign->id}", ['role_id' => $ownRoleId])->assertNotFound();
    $this->delete("/staff/{$foreign->id}")->assertNotFound();

    expect($foreign->fresh())->not->toBeNull();
});

test('owners can move staff to another role and remove them', function () {
    $owner = storeUser();
    $staff = staffWith(['pos.sell'], $owner->merchant);
    $manager = $owner->merchant->roles()->firstWhere('name', 'Manager');

    $this->actingAs($owner)->patch("/staff/{$staff->id}", ['role_id' => $manager->id])->assertRedirect();
    expect($staff->fresh()->role_id)->toBe($manager->id);

    $this->delete("/staff/{$staff->id}")->assertRedirect();
    expect($staff->fresh())->toBeNull();
});

// Access on the POS

test('staff without the pos permission cannot open the register', function () {
    $this->actingAs(staffWith(['sales.view']))->get('/pos')->assertForbidden();
    $this->actingAs(staffWith(['pos.sell']))->get('/pos')->assertOk();
});

test('point of sale access includes giving senior and pwd discounts', function () {
    $staff = staffWith(['pos.sell']);
    $product = Product::factory()->for($staff->merchant)->create();
    $uuid = (string) Str::uuid();

    $this->actingAs($staff)->postJson('/pos/sync/sales', ['sales' => [[
        'client_uuid' => $uuid,
        'sold_at' => now()->toIso8601String(),
        'payment_method' => 'cash',
        'amount_paid_cents' => 1000000,
        'discount_type' => 'senior',
        'discount_id_number' => '1',
        'discount_customer_name' => 'Lola',
        'items' => [['product_id' => $product->id, 'quantity' => 1, 'unit_price_cents' => $product->price_cents]],
    ]]])->assertJsonPath('synced', [$uuid]);
});

test('the permission list is the sidebar pages, plus voids and refunds', function () {
    $this->actingAs(storeUser())->get('/team/employees')
        ->assertInertia(fn ($page) => $page
            ->where('permissions.0.label', 'Point of Sale')
            ->where('permissions.1.label', 'Products')
            ->where('permissions.2.label', 'Categories')
            ->where('permissions.3.label', 'Sales')
            // Not a page: what a Sales role may also do (and approve at the register).
            ->where('permissions.4.label', 'Void & refund sales')
            ->where('permissions.5.label', 'Inventory')
            ->where('permissions.6.label', 'Employee Scheduling')
            ->where('permissions.7.label', 'Attendance & Timesheets')
            ->has('permissions', 8));
});
