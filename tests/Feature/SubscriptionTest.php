<?php

use App\Enums\UserRole;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\SubscriptionPayment;
use App\Models\User;
use Illuminate\Support\Facades\Http;

function freeOwner(): User
{
    $user = User::factory()->make();
    $user->merchant()->associate(Merchant::factory()->create());
    $user->role = UserRole::Owner;
    $user->save();

    return $user;
}

/** PayMongo answering for FinstackPOS's own account; later calls change the intent's status. */
function fakeSubscriptionGateway(string $status): void
{
    config(['subscriptions.paymongo_secret_key' => 'sk_test_platform']);
    $GLOBALS['subscriptionIntentStatus'] = $status;
    // Fake once per test; later calls only change the status it reports.
    if (app()->bound('subscription-gateway-faked')) {
        return;
    }
    app()->instance('subscription-gateway-faked', true);
    Http::fake([
        'api.paymongo.com/v1/payment_intents' => Http::response(['data' => [
            'id' => 'pi_sub1', 'attributes' => ['client_key' => 'pi_sub1_client', 'status' => 'awaiting_payment_method'],
        ]]),
        'api.paymongo.com/v1/payment_methods' => Http::response(['data' => ['id' => 'pm_sub1']]),
        'api.paymongo.com/v1/payment_intents/pi_sub1/attach' => Http::response(['data' => [
            'id' => 'pi_sub1', 'attributes' => ['status' => 'awaiting_next_action', 'next_action' => ['code' => ['image_url' => 'iVBORw0KGgo=']]],
        ]]),
        'api.paymongo.com/v1/payment_intents/pi_sub1' => fn () => Http::response(['data' => ['id' => 'pi_sub1', 'attributes' => ['status' => $GLOBALS['subscriptionIntentStatus']]]]),
    ]);
}

test('free stores cannot open or use management', function () {
    $owner = freeOwner();
    $this->actingAs($owner);

    $this->get('/team/employees')->assertRedirect('/subscription');
    $this->get('/team/schedule')->assertRedirect('/subscription');
    $this->get('/team/payroll')->assertRedirect('/subscription');
    $this->post('/team/shifts', [])->assertForbidden();
    $this->post('/staff', [])->assertForbidden();
    $this->get('/reports?type=payroll')->assertSessionHasErrors('type');
    $this->get('/dashboard')->assertInertia(fn ($p) => $p->where('auth.subscription.active', false)->where('team', null));
});

test('free stores can add up to 50 products', function () {
    $owner = freeOwner();
    Product::factory()->count(50)->for($owner->merchant)->create();

    $this->actingAs($owner)->post('/products', ['name' => 'One too many', 'sku' => 'EXTRA-1', 'price' => '10', 'is_active' => true])
        ->assertSessionHasErrors('name');
    $this->get('/products')->assertInertia(fn ($p) => $p->where('productLimit.used', 50)->where('productLimit.limit', 50));

    $owner->merchant->forceFill(['subscribed_until' => now()->addMonth()])->save();
    $this->post('/products', ['name' => 'Pro product', 'sku' => 'EXTRA-2', 'price' => '10', 'is_active' => true])->assertSessionHasNoErrors();
});

test('paying with qr ph adds the months once, after the gateway confirms', function () {
    fakeSubscriptionGateway('awaiting_next_action');
    $owner = freeOwner();
    $this->freezeTime();

    $this->actingAs($owner)->postJson('/subscription/checkout', ['months' => 3])
        ->assertOk()
        ->assertJsonPath('id', 'pi_sub1')
        ->assertJsonPath('amount_cents', 3 * 19900);
    Http::assertSent(fn ($r) => $r->url() === 'https://api.paymongo.com/v1/payment_intents'
        && $r['data']['attributes']['amount'] === 59700
        && $r->hasHeader('Authorization', 'Basic '.base64_encode('sk_test_platform:')));

    // Not paid yet: nothing changes.
    $this->getJson('/subscription/checkout/pi_sub1')->assertJsonPath('status', 'awaiting_next_action');
    expect($owner->merchant->fresh()->isSubscribed())->toBeFalse();

    fakeSubscriptionGateway('succeeded');
    $this->getJson('/subscription/checkout/pi_sub1')->assertJsonPath('status', 'paid');
    $this->getJson('/subscription/checkout/pi_sub1')->assertJsonPath('status', 'paid');

    $until = $owner->merchant->fresh()->subscribed_until;
    expect($until->toDateTimeString())->toBe(now()->addMonthsNoOverflow(3)->toDateTimeString())
        ->and(SubscriptionPayment::count())->toBe(1);

    $this->actingAs($owner->fresh())->get('/team/employees')->assertOk();
});

test('new months are added after the current end date', function () {
    $owner = freeOwner();
    $owner->merchant->forceFill(['subscribed_until' => now()->addDays(10)])->save();
    $end = $owner->merchant->fresh()->subscribed_until;

    $this->artisan('subscription:grant', ['store' => $owner->merchant_id, 'months' => 2, '--note' => 'Bank transfer'])->assertSuccessful();

    expect($owner->merchant->fresh()->subscribed_until->toDateTimeString())->toBe($end->copy()->addMonthsNoOverflow(2)->toDateTimeString());
});

test('only the owner pays, for a sensible number of months', function () {
    fakeSubscriptionGateway('awaiting_next_action');
    $owner = freeOwner();

    $this->actingAs(staffWith(['pos.sell'], $owner->merchant))->postJson('/subscription/checkout', ['months' => 1])->assertForbidden();
    $this->actingAs($owner)->postJson('/subscription/checkout', ['months' => 0])->assertJsonValidationErrors('months');
    $this->postJson('/subscription/checkout', ['months' => 25])->assertJsonValidationErrors('months');
});

test('a payment confirmed while the page was closed is picked up later', function () {
    fakeSubscriptionGateway('awaiting_next_action');
    $owner = freeOwner();
    $this->actingAs($owner)->postJson('/subscription/checkout', ['months' => 1])->assertOk();

    fakeSubscriptionGateway('succeeded');
    $this->get('/subscription')->assertInertia(fn ($p) => $p->where('plan.active', true)->where('payments.0.status', 'paid'));
});

test('another store cannot read or apply someone else\'s payment', function () {
    fakeSubscriptionGateway('succeeded');
    $this->actingAs(freeOwner())->postJson('/subscription/checkout', ['months' => 1])->assertOk();

    $this->actingAs(freeOwner())->getJson('/subscription/checkout/pi_sub1')->assertNotFound();
});
