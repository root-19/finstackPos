<?php

use App\Enums\UserRole;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\SubscriptionPayment;
use App\Models\User;
use App\Services\SubscriptionService;
use App\Support\Platform;

function platformAdmin(): User
{
    $admin = User::factory()->create(['email' => 'admin@finstack.test']);
    $admin->forceFill(['is_admin' => true, 'merchant_id' => null])->save();

    return $admin;
}

function storeWithOwner(array $merchant = []): User
{
    $user = User::factory()->make();
    $user->merchant()->associate(Merchant::factory()->create($merchant));
    $user->role = UserRole::Owner;
    $user->save();

    return $user;
}

test('administrators are made from the command line only', function () {
    $this->artisan('admin:create', ['email' => 'Boss@Finstack.test'])
        ->expectsQuestion('Password (at least 8 characters)', 'secret-pass-123')
        ->expectsQuestion('Confirm password', 'secret-pass-123')
        ->assertSuccessful();

    $admin = User::firstWhere('email', 'boss@finstack.test');
    expect($admin->isAdmin())->toBeTrue()->and($admin->merchant_id)->toBeNull();

    // A store's login is never turned into an administrator.
    $owner = storeWithOwner();
    $this->artisan('admin:create', ['email' => $owner->email])->assertFailed();
    expect($owner->fresh()->isAdmin())->toBeFalse();
});

test('only administrators can open the admin area, and they land there', function () {
    $this->actingAs(storeWithOwner())->get('/admin')->assertForbidden();
    $this->actingAs(storeWithOwner())->get('/admin/pricing')->assertForbidden();

    $this->actingAs(platformAdmin())->get('/dashboard')->assertRedirect('/admin');
    $this->get('/admin')->assertOk();
});

test('the dashboard counts every store by plan, and paid revenue', function () {
    storeWithOwner();
    storeWithOwner(['subscribed_until' => now()->addDays(3)]);
    $pro = storeWithOwner(['subscribed_until' => now()->addMonths(2)]);
    storeWithOwner(['subscribed_until' => now()->subDay()]);
    storeWithOwner(['is_active' => false]);

    $payment = new SubscriptionPayment(['months' => 2, 'amount_cents' => 39800, 'provider' => 'paymongo', 'provider_id' => 'pi_x', 'status' => 'succeeded']);
    $payment->merchant()->associate($pro->merchant);
    $payment->forceFill(['period_start' => now(), 'period_end' => now()->addMonths(2), 'paid_at' => now()])->save();

    $this->actingAs(platformAdmin())->get('/admin')->assertInertia(fn ($p) => $p
        ->where('counts.stores', 5)
        ->where('counts.pro', 2)
        ->where('counts.free', 3)
        ->where('counts.expiring', 1)
        ->where('counts.expired', 1)
        ->where('counts.suspended', 1)
        ->where('revenue.this_month', 39800)
        ->where('expiringSoon.0.days_left', 3));
});

test('store pages see each store\'s own numbers', function () {
    $owner = storeWithOwner(['name' => 'Kape Corner', 'subscribed_until' => now()->addDays(5)]);
    Product::factory()->count(3)->for($owner->merchant)->create();
    storeWithOwner(['name' => 'Other Store']);

    $this->actingAs(platformAdmin());
    $this->get('/admin/stores?plan=expiring')->assertInertia(fn ($p) => $p
        ->has('stores.data', 1)
        ->where('stores.data.0.name', 'Kape Corner')
        ->where('stores.data.0.products', 3)
        ->where('stores.data.0.days_left', 5));
    $this->get('/admin/stores?search=other')->assertInertia(fn ($p) => $p->has('stores.data', 1));
    $this->get("/admin/stores/{$owner->merchant_id}")->assertInertia(fn ($p) => $p->where('stats.products', 3)->has('people', 1));
});

test('administrators add months, set the end date, end pro, and suspend', function () {
    $owner = storeWithOwner();
    $store = $owner->merchant;
    $this->actingAs(platformAdmin());

    $this->post("/admin/stores/{$store->id}/grant", ['months' => 2, 'note' => 'Bank transfer'])->assertSessionHasNoErrors();
    expect($store->fresh()->isSubscribed())->toBeTrue();

    $this->post("/admin/stores/{$store->id}/end-date", ['until' => '2030-01-31'])->assertSessionHasErrors('note');
    $this->post("/admin/stores/{$store->id}/end-date", ['until' => '2030-01-31', 'note' => 'Promo'])->assertSessionHasNoErrors();
    expect($store->fresh()->subscribed_until->setTimezone($store->timezone)->toDateString())->toBe('2030-01-31');

    $this->post("/admin/stores/{$store->id}/end-now", ['note' => 'Refunded'])->assertSessionHasNoErrors();
    expect($store->fresh()->isSubscribed())->toBeFalse()
        ->and(SubscriptionPayment::withoutGlobalScope('merchant')->where('merchant_id', $store->id)->count())->toBe(3);

    $this->post("/admin/stores/{$store->id}/active")->assertSessionHasNoErrors();
    $this->actingAs($owner->fresh())->get('/products')->assertForbidden();
});

test('pricing changes apply to new payments and the free limit', function () {
    $this->actingAs(platformAdmin())->put('/admin/pricing', ['price' => '249.50', 'free_product_limit' => 2, 'max_months' => 6, 'trial_days' => 7])
        ->assertSessionHasNoErrors();
    Platform::flush();

    expect(SubscriptionService::priceFor(2))->toBe(49900);

    $owner = storeWithOwner();
    Product::factory()->count(2)->for($owner->merchant)->create();
    $this->actingAs($owner)->post('/products', ['name' => 'Third', 'sku' => 'T-3', 'price' => '10', 'is_active' => true])->assertSessionHasErrors('name');
    $this->get('/subscription')->assertInertia(fn ($p) => $p->where('pricing.price_cents', 24950)->where('pricing.max_months', 6));
});
