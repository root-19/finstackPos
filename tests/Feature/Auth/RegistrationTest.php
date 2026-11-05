<?php

use App\Enums\UserRole;
use App\Models\Merchant;

test('registration screen can be rendered', function () {
    $response = $this->get('/register');

    $response->assertStatus(200);
});

test('new users can register', function () {
    $response = $this->post('/register', [
        'business_name' => 'Aling Nena Store',
        'name' => 'Test User',
        'email' => 'test@example.com',
        'password' => 'password',
        'password_confirmation' => 'password',
    ]);

    $this->assertAuthenticated();
    $response->assertRedirect(route('dashboard', absolute: false));

    $user = auth()->user();
    expect($user->merchant->name)->toBe('Aling Nena Store')
        ->and($user->role)->toBe(UserRole::Owner);
});

test('registration ignores attempts to pick a merchant or role', function () {
    $other = Merchant::factory()->create();

    $this->post('/register', [
        'business_name' => 'My Store',
        'name' => 'Test User',
        'email' => 'test@example.com',
        'password' => 'password',
        'password_confirmation' => 'password',
        'merchant_id' => $other->id,
    ]);

    expect(auth()->user()->merchant_id)->not->toBe($other->id);
});
