<?php

use App\Enums\UserRole;
use App\Models\Merchant;
use App\Models\User;
use App\Support\Modules;
use Inertia\Testing\AssertableInertia as Assert;

function moduleOwner(?array $modules = null): User
{
    $merchant = Merchant::factory()->create();
    $merchant->forceFill(['modules' => $modules])->save();

    $owner = User::factory()->make();
    $owner->merchant()->associate($merchant);
    $owner->role = UserRole::Owner;
    $owner->save();

    return $owner;
}

it('gives stores that never customized everything they had', function () {
    $owner = moduleOwner();

    expect($owner->merchant->enabledModules())->toBe(Modules::DEFAULTS);

    $this->actingAs($owner)->get('/pos')->assertOk();
    $this->actingAs($owner)->get('/inventory')->assertOk();
    $this->actingAs($owner)->get('/dashboard')->assertInertia(fn (Assert $page) => $page->where('auth.modules', Modules::DEFAULTS));
});

it('turns on what a module needs', function () {
    expect(Modules::withRequirements(['table_orders']))->toBe(['pos', 'products', 'table_orders'])
        ->and(Modules::withRequirements(['payroll', 'nope']))->toBe(['employees', 'payroll'])
        ->and(Modules::withRequirements([]))->toBe([]);
});

it('lets the owner turn modules off, which closes their pages but keeps sync open', function () {
    $owner = moduleOwner();

    $this->actingAs($owner)->get('/settings/customize')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('Settings/Customize')
        ->has('modules', count(Modules::ALL))
        ->where('enabled', Modules::DEFAULTS)
    );

    $this->actingAs($owner)->put('/settings/customize', ['modules' => ['sales', 'reports']])->assertRedirect();
    expect($owner->merchant->fresh()->enabledModules())->toBe(['sales', 'reports']);

    // Point of Sale is optional too.
    $this->actingAs($owner)->get('/pos')->assertRedirect('/dashboard');
    $this->actingAs($owner)->get('/inventory')->assertRedirect('/dashboard');
    $this->actingAs($owner)->get('/products')->assertRedirect('/dashboard');
    $this->actingAs($owner)->postJson('/products', ['name' => 'X'])->assertNotFound();
    $this->actingAs($owner)->get('/sales')->assertOk();

    // Sales already queued offline must still upload.
    $this->actingAs($owner)->getJson('/pos/sync/catalog')->assertOk();

    // Always on.
    $this->actingAs($owner)->get('/dashboard')->assertOk();
    $this->actingAs($owner)->get('/settings')->assertOk();
    $this->actingAs($owner)->get('/system')->assertOk();
});

it('saves an empty selection and rejects unknown modules', function () {
    $owner = moduleOwner();

    $this->actingAs($owner)->put('/settings/customize', ['modules' => []])->assertRedirect();
    expect($owner->merchant->fresh()->enabledModules())->toBe([]);

    $this->actingAs($owner)->put('/settings/customize', ['modules' => ['pos', 'hacking']])->assertSessionHasErrors('modules.1');
});

it('only lets the owner customize', function () {
    $cashier = staffWith(['pos.sell']);

    $this->actingAs($cashier)->get('/settings/customize')->assertForbidden();
    $this->actingAs($cashier)->put('/settings/customize', ['modules' => []])->assertForbidden();
});

it('greets a new store owner with Fin until they finish or skip', function () {
    $owner = moduleOwner();

    $this->actingAs($owner)->get('/dashboard')->assertInertia(fn (Assert $page) => $page
        ->where('auth.onboarding.store', $owner->merchant->name)
        ->has('auth.onboarding.modules', count(Modules::ALL))
        ->has('auth.onboarding.plan.price_cents')
    );

    // Staff never see it.
    $cashier = staffWith(['pos.sell'], $owner->merchant);
    $this->actingAs($cashier)->get('/dashboard')->assertInertia(fn (Assert $page) => $page->where('auth.onboarding', null));

    // Finishing saves the modules Fin suggested (plus what they need).
    $this->actingAs($owner)->post('/onboarding/finish', ['modules' => ['table_orders', 'reports']])->assertRedirect();
    $merchant = $owner->merchant->fresh();
    expect($merchant->onboarded_at)->not->toBeNull()
        ->and($merchant->enabledModules())->toBe(['pos', 'products', 'table_orders', 'reports']);
    $this->actingAs($owner)->get('/dashboard')->assertInertia(fn (Assert $page) => $page->where('auth.onboarding', null));

    // "Set up with Fin" again, then skip: modules stay as they were.
    $this->actingAs($owner)->post('/onboarding/restart')->assertRedirect('/dashboard');
    expect($owner->merchant->fresh()->onboarded_at)->toBeNull();
    $this->actingAs($owner)->post('/onboarding/finish')->assertRedirect();
    expect($owner->merchant->fresh()->enabledModules())->toBe(['pos', 'products', 'table_orders', 'reports']);

    $this->actingAs($cashier)->post('/onboarding/finish')->assertForbidden();
});
