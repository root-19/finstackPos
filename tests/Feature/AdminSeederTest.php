<?php

use App\Models\User;
use Database\Seeders\AdminSeeder;
use Illuminate\Support\Facades\Hash;

function adminEnv(array $vars): void
{
    foreach (['ADMIN_EMAIL', 'ADMIN_NAME', 'ADMIN_PASSWORD'] as $key) {
        $value = $vars[$key] ?? null;
        putenv($value === null ? $key : "{$key}={$value}");
        if ($value === null) {
            unset($_ENV[$key], $_SERVER[$key]);
        } else {
            $_ENV[$key] = $_SERVER[$key] = $value;
        }
    }
}

afterEach(fn () => adminEnv([]));

it('creates a platform administrator who can open the admin area', function () {
    adminEnv(['ADMIN_EMAIL' => 'Boss@Example.com', 'ADMIN_NAME' => 'Boss', 'ADMIN_PASSWORD' => 'a-long-secret-123']);
    $this->seed(AdminSeeder::class);

    $admin = User::where('email', 'boss@example.com')->firstOrFail();
    expect($admin->isAdmin())->toBeTrue()
        ->and($admin->merchant_id)->toBeNull()
        ->and($admin->email_verified_at)->not->toBeNull()
        ->and(Hash::check('a-long-secret-123', $admin->password))->toBeTrue();

    $this->actingAs($admin)->get('/admin')->assertOk();
});

it('promotes an existing account without touching its password, and runs twice safely', function () {
    $user = User::factory()->create(['email' => 'owner@example.com', 'password' => 'original-password-1']);

    adminEnv(['ADMIN_EMAIL' => 'owner@example.com']);
    $this->seed(AdminSeeder::class);
    $this->seed(AdminSeeder::class);

    $user->refresh();
    expect($user->isAdmin())->toBeTrue()
        ->and(Hash::check('original-password-1', $user->password))->toBeTrue()
        ->and(User::where('email', 'owner@example.com')->count())->toBe(1);
});

it('refuses a missing email or a short password', function () {
    adminEnv([]);
    expect(fn () => $this->seed(AdminSeeder::class))->toThrow(RuntimeException::class);

    adminEnv(['ADMIN_EMAIL' => 'x@example.com', 'ADMIN_PASSWORD' => 'short']);
    expect(fn () => $this->seed(AdminSeeder::class))->toThrow(RuntimeException::class);
});
