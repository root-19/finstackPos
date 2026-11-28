<?php

use App\Models\FeatureSuggestion;
use App\Models\Merchant;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

function suggestionAdmin(): User
{
    $admin = User::factory()->create();
    $admin->forceFill(['is_admin' => true, 'merchant_id' => null])->save();

    return $admin;
}

it('lets anyone in a store suggest a feature, stamped with the store plan', function () {
    $free = Merchant::factory()->create();
    $cashier = staffWith(['pos.sell'], $free);

    $this->actingAs($cashier)->get('/suggestions')->assertOk()->assertInertia(fn (Assert $page) => $page->component('Suggestions/Index'));
    $this->actingAs($cashier)->post('/suggestions', ['category' => 'pos', 'title' => 'Table number on receipts', 'details' => 'Helps the runners'])
        ->assertRedirect()->assertSessionHasNoErrors();

    $trial = Merchant::factory()->create();
    $trial->forceFill(['trial_ends_at' => now()->addDays(30), 'subscribed_until' => now()->addDays(30)])->save();
    $this->actingAs(staffWith([], $trial))->post('/suggestions', ['category' => 'team', 'title' => 'Overtime rules']);

    $pro = Merchant::factory()->create();
    $pro->forceFill(['trial_ends_at' => null, 'subscribed_until' => now()->addMonths(3)])->save();
    $this->actingAs(staffWith([], $pro))->post('/suggestions', ['category' => 'reports', 'title' => 'Weekly email']);

    $rows = FeatureSuggestion::withoutGlobalScope('merchant')->orderBy('id')->get();
    expect($rows->pluck('plan')->all())->toBe(['free', 'trial', 'pro'])
        ->and($rows[0]->user_id)->toBe($cashier->id)
        ->and($rows[0]->merchant_id)->toBe($free->id);

    // A store only sees its own suggestions.
    $this->actingAs($cashier)->get('/suggestions')->assertInertia(fn (Assert $page) => $page
        ->has('suggestions', 1)
        ->where('suggestions.0.title', 'Table number on receipts'));
});

it('validates suggestions', function () {
    $this->actingAs(staffWith([]))->post('/suggestions', ['category' => 'nope', 'title' => ''])
        ->assertSessionHasErrors(['category', 'title']);
});

it('shows admins every suggestion with its store, sender and plan, and lets them answer', function () {
    $store = Merchant::factory()->create(['name' => 'Kapehan']);
    $owner = staffWith([], $store);
    $this->actingAs($owner)->post('/suggestions', ['category' => 'desktop', 'title' => 'Label printer support']);
    $other = staffWith([]);
    $this->actingAs($other)->post('/suggestions', ['category' => 'pos', 'title' => 'Split bill']);

    $admin = suggestionAdmin();
    $this->actingAs($admin)->get('/admin/suggestions')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('Admin/Suggestions')
        ->where('counts.total', 2)
        ->where('counts.new', 2)
        ->where('counts.by_plan.free', 2)
        ->has('suggestions.data', 2)
        ->where('suggestions.data.1.store', 'Kapehan')
        ->where('suggestions.data.1.user', $owner->name)
        ->where('suggestions.data.1.email', $owner->email)
        ->where('suggestions.data.1.plan', 'free'));

    $this->actingAs($admin)->get('/admin/suggestions?plan=pro')->assertInertia(fn (Assert $page) => $page->has('suggestions.data', 0));

    $id = FeatureSuggestion::withoutGlobalScope('merchant')->where('title', 'Label printer support')->value('id');
    $this->actingAs($admin)->patch("/admin/suggestions/{$id}", ['status' => 'planned', 'admin_note' => 'Next month'])->assertRedirect();

    // The store sees the answer.
    $this->actingAs($owner)->get('/suggestions')->assertInertia(fn (Assert $page) => $page
        ->where('suggestions.0.status', 'planned')
        ->where('suggestions.0.admin_note', 'Next month'));

    // Store users can't open the admin list.
    $this->actingAs($owner)->get('/admin/suggestions')->assertForbidden();
});

it('gives every throttled route its own counter, so polling never blocks a form', function () {
    $user = staffWith([]);

    // Use up far more than the suggestions limit (10/min) on another throttled route.
    for ($i = 0; $i < 15; $i++) {
        $this->actingAs($user)->getJson('/subscription/checkout/nope');
    }
    $this->actingAs($user)->post('/suggestions', ['category' => 'pos', 'title' => 'Still works'])->assertRedirect();

    // The route's own limit still applies.
    for ($i = 0; $i < 9; $i++) {
        $this->actingAs($user)->post('/suggestions', ['category' => 'pos', 'title' => "Idea {$i}"]);
    }
    $this->actingAs($user)->post('/suggestions', ['category' => 'pos', 'title' => 'One too many'])->assertStatus(429);
});
