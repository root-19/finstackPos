<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * A FinstackPOS platform administrator (the /admin area: pricing, stores,
 * subscriptions, support inbox). Not tied to any store.
 *
 *     ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" php artisan db:seed --class=AdminSeeder --force
 *
 * ADMIN_PASSWORD sets the password; without it a new account gets a random
 * one, printed once. Safe to run again: an existing account with that email
 * is made an administrator and keeps its password unless ADMIN_PASSWORD is
 * given. Nothing here is hard-coded, so no password ends up in git.
 */
class AdminSeeder extends Seeder
{
    public function run(): void
    {
        $email = strtolower(trim((string) env('ADMIN_EMAIL')));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('Set ADMIN_EMAIL to the administrator\'s email address.');
        }

        $password = (string) env('ADMIN_PASSWORD');
        if ($password !== '' && strlen($password) < 12) {
            throw new RuntimeException('ADMIN_PASSWORD must be at least 12 characters.');
        }

        $user = User::query()->withoutGlobalScopes()->where('email', $email)->first();
        $created = $user === null;

        if ($created) {
            $user = new User(['email' => $email, 'name' => env('ADMIN_NAME') ?: 'FinstackPOS Admin']);
            $password = $password ?: Str::password(20, symbols: false);
        } elseif (env('ADMIN_NAME')) {
            $user->name = env('ADMIN_NAME');
        }

        if ($password !== '') {
            $user->password = $password; // hashed by the model's cast
        }

        $user->forceFill([
            'is_admin' => true,
            'email_verified_at' => $user->email_verified_at ?? now(),
        ])->save();

        $this->command?->info(($created ? 'Created' : 'Updated').' administrator: '.$email);
        if ($created && ! env('ADMIN_PASSWORD')) {
            $this->command?->warn('Password (shown once, change it after signing in): '.$password);
        }
    }
}
