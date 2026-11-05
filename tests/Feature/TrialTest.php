<?php

use App\Enums\UserRole;
use App\Models\Merchant;
use App\Models\SubscriptionPayment;
use App\Models\User;
use App\Services\SubscriptionService;
use App\Support\Platform;

function signUp(string $email = 'nena@example.com'): User
{
    test()->post('/register', [
        'business_name' => 'Aling Nena Store',
        'name' => 'Nena',
        'email' => $email,
        'password' => 'password',
        'password_confirmation' => 'password',
    ])->assertRedirect('/dashboard');

    return User::firstWhere('email', $email);
}

function trialAdmin(): User
{
    $admin = User::factory()->create();
    $admin->forceFill(['is_admin' => true, 'merchant_id' => null])->save();

    return $admin;
}

test('a new store gets a 14-day pro trial, once', function () {
    $this->freezeTime();
    $owner = signUp();
    $store = $owner->merchant;

    expect($store->onTrial())->toBeTrue()
        ->and($store->isSubscribed())->toBeTrue()
        ->and($store->trial_ends_at->toDateTimeString())->toBe(now()->addDays(14)->toDateTimeString())
        ->and(SubscriptionPayment::withoutGlobalScope('merchant')->where('merchant_id', $store->id)->value('provider'))->toBe('trial');

    // Management works during the trial.
    $this->get('/team/employees')->assertOk();
    $this->get('/dashboard')->assertInertia(fn ($p) => $p->where('auth.subscription.trial', true));

    // Never restarted.
    app(SubscriptionService::class)->startTrial($store->fresh(), 14);
    expect(SubscriptionPayment::withoutGlobalScope('merchant')->where('merchant_id', $store->id)->count())->toBe(1);
});

test('when the trial ends, management locks', function () {
    $owner = signUp();
    $this->travel(15)->days();

    expect($owner->merchant->fresh()->isSubscribed())->toBeFalse();
    $this->actingAs($owner->fresh())->get('/team/employees')->assertRedirect('/subscription');
});

test('months paid during the trial start when the trial ends', function () {
    $owner = signUp();
    $trialEnd = $owner->merchant->trial_ends_at;

    app(SubscriptionService::class)->grant($owner->merchant->fresh(), 1, 'Paid early');
    $store = $owner->merchant->fresh();

    expect($store->subscribed_until->toDateTimeString())->toBe($trialEnd->copy()->addMonthNoOverflow()->toDateTimeString())
        ->and($store->onTrial())->toBeFalse();
});

test('trial length comes from the admin pricing page, and 0 turns trials off', function () {
    $this->actingAs(trialAdmin())->put('/admin/pricing', ['price' => '199', 'free_product_limit' => 50, 'max_months' => 24, 'trial_days' => 0])
        ->assertSessionHasNoErrors();
    Platform::flush();
    auth()->logout();

    $owner = signUp('no-trial@example.com');
    expect($owner->merchant->trial_ends_at)->toBeNull()->and($owner->merchant->isSubscribed())->toBeFalse();
});

test('administrators see trials apart from paying stores', function () {
    signUp('trial1@example.com');
    auth()->logout();
    $paying = User::factory()->make();
    $paying->merchant()->associate(Merchant::factory()->create(['subscribed_until' => now()->addMonths(3)]));
    $paying->role = UserRole::Owner;
    $paying->save();

    $this->actingAs(trialAdmin());
    $this->get('/admin')->assertInertia(fn ($p) => $p
        ->where('counts.trial', 1)
        ->where('counts.pro', 1)
        ->where('trialsEnding.0.days_left', 14));
    $this->get('/admin/stores?plan=trial')->assertInertia(fn ($p) => $p->has('stores.data', 1)->where('stores.data.0.trial', true));
    $this->get('/admin/stores?plan=pro')->assertInertia(fn ($p) => $p->has('stores.data', 1)->where('stores.data.0.trial', false));
});

function existingOwner(array $store = []): User
{
    $owner = User::factory()->make();
    $owner->merchant()->associate(Merchant::factory()->create($store));
    $owner->role = UserRole::Owner;
    $owner->save();

    return $owner;
}

test('a store without a trial can start one from the subscription page, once', function () {
    $this->freezeTime();
    $owner = existingOwner();

    $this->actingAs($owner)->get('/subscription')->assertInertia(fn ($p) => $p->where('trial.available', true)->where('trial.days', 14));
    $this->post('/subscription/trial')->assertRedirect()->assertSessionHas('success');

    $store = $owner->merchant->fresh();
    expect($store->onTrial())->toBeTrue()
        ->and($store->subscribed_until->toDateTimeString())->toBe(now()->addDays(14)->toDateTimeString());
    $this->get('/team/employees')->assertOk();

    // Not a second time.
    $this->post('/subscription/trial')->assertSessionHasErrors('trial');
    $this->get('/subscription')->assertInertia(fn ($p) => $p->where('trial.available', false));
    expect(SubscriptionPayment::withoutGlobalScope('merchant')->where('merchant_id', $store->id)->count())->toBe(1);
});

test('after a page-started trial ends, the store is back on free', function () {
    $owner = existingOwner();
    $this->actingAs($owner)->post('/subscription/trial');
    $this->travel(15)->days();

    $this->actingAs($owner->fresh())->get('/team/employees')->assertRedirect('/subscription');
    $this->get('/subscription')->assertInertia(fn ($p) => $p
        ->where('plan.active', false)
        ->where('plan.trial_ended', true)
        ->where('trial.available', false));
});

test('only the owner of a free store can start the trial', function () {
    $owner = existingOwner();
    $staff = User::factory()->make();
    $staff->merchant()->associate($owner->merchant);
    $staff->role = UserRole::Staff;
    $staff->save();
    $this->actingAs($staff)->post('/subscription/trial')->assertForbidden();

    $paid = existingOwner(['subscribed_until' => now()->addMonth()]);
    $this->actingAs($paid)->post('/subscription/trial')->assertSessionHasErrors('trial');
    expect($paid->merchant->fresh()->trial_ends_at)->toBeNull();
});
