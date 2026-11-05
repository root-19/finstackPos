<?php

use App\Enums\UserRole;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Support\Str;

function merchantUser(?Merchant $merchant = null): User
{
    $user = User::factory()->make();
    $user->merchant()->associate($merchant ?? Merchant::factory()->create());
    $user->role = UserRole::Owner;
    $user->save();

    return $user;
}

function salePayload(Product $product, array $overrides = []): array
{
    return array_merge([
        'client_uuid' => (string) Str::uuid(),
        'sold_at' => now()->toIso8601String(),
        'payment_method' => 'cash',
        'amount_paid_cents' => 100000,
        'items' => [
            ['product_id' => $product->id, 'quantity' => 2, 'unit_price_cents' => $product->price_cents],
        ],
    ], $overrides);
}

test('users without a merchant cannot open the pos', function () {
    $this->actingAs(User::factory()->create())
        ->get('/pos')
        ->assertForbidden();
});

test('the pos screen renders for merchant users', function () {
    $this->actingAs(merchantUser())
        ->get('/pos')
        ->assertOk();
});

test('catalog only contains the merchant\'s own products', function () {
    $user = merchantUser();
    $own = Product::factory()->for($user->merchant)->create();
    $foreign = Product::factory()->create();

    $response = $this->actingAs($user)->getJson('/pos/sync/catalog')->assertOk();

    expect(collect($response->json('products'))->pluck('id')->all())
        ->toContain($own->id)
        ->not->toContain($foreign->id);
});

test('incremental catalog pulls report deletions', function () {
    $user = merchantUser();
    $product = Product::factory()->for($user->merchant)->create();

    $since = $this->actingAs($user)->getJson('/pos/sync/catalog')->json('server_time');
    $product->delete();

    $this->getJson('/pos/sync/catalog?since='.urlencode($since))
        ->assertOk()
        ->assertJsonPath('deleted.products', [$product->id])
        ->assertJsonCount(0, 'products');
});

test('sales sync stores the sale with server computed totals', function () {
    $user = merchantUser(Merchant::factory()->create(['tax_rate_bps' => 1200, 'prices_include_tax' => false]));
    $product = Product::factory()->for($user->merchant)->create(['price_cents' => 10000, 'stock' => 5]);
    $payload = salePayload($product);

    $this->actingAs($user)
        ->postJson('/pos/sync/sales', ['sales' => [$payload]])
        ->assertOk()
        ->assertJsonPath('synced', [$payload['client_uuid']]);

    $sale = Sale::firstWhere('client_uuid', $payload['client_uuid']);
    expect($sale->subtotal_cents)->toBe(20000)
        ->and($sale->tax_cents)->toBe(2400)
        ->and($sale->total_cents)->toBe(22400)
        ->and($sale->change_cents)->toBe(100000 - 22400)
        ->and($sale->merchant_id)->toBe($user->merchant_id)
        ->and($product->fresh()->stock)->toBe(3);
});

test('re-sending a sale is idempotent', function () {
    $user = merchantUser();
    $product = Product::factory()->for($user->merchant)->create(['stock' => 10]);
    $payload = salePayload($product);

    $this->actingAs($user)->postJson('/pos/sync/sales', ['sales' => [$payload]])->assertOk();
    $this->postJson('/pos/sync/sales', ['sales' => [$payload]])
        ->assertOk()
        ->assertJsonPath('synced', [$payload['client_uuid']]);

    expect(Sale::count())->toBe(1)
        ->and($product->fresh()->stock)->toBe(8);
});

test('sales with another merchant\'s products are rejected without blocking the batch', function () {
    $user = merchantUser();
    $own = Product::factory()->for($user->merchant)->create();
    $foreign = Product::factory()->create();
    $good = salePayload($own);
    $bad = salePayload($foreign);

    $this->actingAs($user)
        ->postJson('/pos/sync/sales', ['sales' => [$bad, $good]])
        ->assertOk()
        ->assertJsonPath('synced', [$good['client_uuid']])
        ->assertJsonPath('rejected.0.client_uuid', $bad['client_uuid']);

    expect(Sale::withoutGlobalScopes()->count())->toBe(1);
});

test('underpaid sales are rejected', function () {
    $user = merchantUser();
    $product = Product::factory()->for($user->merchant)->create(['price_cents' => 10000]);

    $this->actingAs($user)
        ->postJson('/pos/sync/sales', ['sales' => [salePayload($product, ['amount_paid_cents' => 100])]])
        ->assertOk()
        ->assertJsonCount(0, 'synced')
        ->assertJsonCount(1, 'rejected');
});

test('a sale priced differently from the catalog is rejected', function () {
    $user = merchantUser();
    $product = Product::factory()->for($user->merchant)->create(['price_cents' => 10000]);

    $response = $this->actingAs($user)->postJson('/pos/sync/sales', [
        'sales' => [salePayload($product, ['items' => [
            ['product_id' => $product->id, 'quantity' => 1, 'unit_price_cents' => 0],
        ]])],
    ])->assertOk();

    expect($response->json('synced'))->toBe([]);
    expect($response->json('rejected.0.message'))->toContain('does not match the catalog');
    expect(Sale::count())->toBe(0);
});
