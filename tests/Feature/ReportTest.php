<?php

use App\Enums\UserRole;
use App\Models\Merchant;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Str;

// These tests cover Pro features; every store they create is subscribed.
beforeEach(fn () => Merchant::creating(fn (Merchant $m) => $m->subscribed_until ??= now()->addYear()));

function reportOwner(): User
{
    $user = User::factory()->make();
    $user->merchant()->associate(Merchant::factory()->create());
    $user->role = UserRole::Owner;
    $user->save();

    return $user;
}

test('each report needs the permission of the page its data comes from', function () {
    $this->actingAs(staffWith(['pos.sell']))->get('/reports')->assertForbidden();

    $cashierLead = staffWith(['sales.view']);
    $this->actingAs($cashierLead)->get('/reports')->assertInertia(fn ($p) => $p->where('available', ['sales'])->where('type', 'sales'));
    // Salary data stays with the owner, even when asked for directly.
    $this->get('/reports?type=payroll')->assertSessionHasErrors('type');

    $this->actingAs(reportOwner())->get('/reports')
        ->assertInertia(fn ($p) => $p->where('available', ['sales', 'inventory', 'payroll', 'workforce']));
});

test('the sales report totals sales by day, product, and payment method', function () {
    $owner = reportOwner();
    $product = Product::factory()->for($owner->merchant)->create(['price_cents' => 15000, 'stock' => null]);

    foreach ([2, 1] as $quantity) {
        $this->actingAs($owner)->postJson('/pos/sync/sales', ['sales' => [[
            'client_uuid' => (string) Str::uuid(),
            'sold_at' => now()->toIso8601String(),
            'payment_method' => 'cash',
            'amount_paid_cents' => 1000000,
            'items' => [['product_id' => $product->id, 'quantity' => $quantity, 'unit_price_cents' => 15000]],
        ]]])->assertJsonCount(0, 'rejected');
    }

    $today = now($owner->merchant->timezone)->toDateString();
    $this->get("/reports?type=sales&from={$today}&to={$today}")->assertInertia(fn ($p) => $p
        ->where('report.summary.transactions', 2)
        ->where('report.summary.items_sold', 3)
        ->where('report.summary.gross_cents', 45000)
        ->where('report.products.0.quantity', 3)
        ->where('report.payments.0.method', 'cash')
        ->where('report.daily.0.count', 2));
});

test('report ranges are limited to a year', function () {
    $this->actingAs(reportOwner())->get('/reports?type=sales&from=2024-01-01&to=2025-06-01')->assertSessionHasErrors('from');
});

test('every report type renders for the owner', function (string $type) {
    $this->actingAs(reportOwner())->get("/reports?type={$type}")->assertOk();
})->with(['sales', 'inventory', 'payroll', 'workforce']);
