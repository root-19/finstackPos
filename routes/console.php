<?php

use App\Models\Merchant;
use App\Models\User;
use App\Services\SubscriptionService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

// FinstackPOS administrators are only ever made here, never through the website.
Artisan::command('admin:create {email} {--name=FinstackPOS Admin}', function () {
    if (! Schema::hasColumn('users', 'is_admin')) {
        $this->error('The administrator migration has not run yet. Run "php artisan migrate" first.');

        return 1;
    }

    $email = strtolower($this->argument('email'));
    $existing = User::query()->where('email', $email)->first();

    if ($existing?->merchant_id) {
        $this->error('That email belongs to a store account. Use a separate email for the administrator.');

        return 1;
    }

    $password = $this->secret('Password (at least 8 characters)');
    $validator = Validator::make(
        ['email' => $email, 'password' => $password, 'password_confirmation' => $this->secret('Confirm password')],
        ['email' => ['required', 'email'], 'password' => ['required', 'confirmed', Password::defaults()]],
    );
    if ($validator->fails()) {
        $this->error($validator->errors()->first());

        return 1;
    }

    $user = $existing ?? new User(['email' => $email]);
    $user->name = $existing?->name ?? $this->option('name');
    $user->password = Hash::make($password);
    $user->is_admin = true;
    $user->email_verified_at ??= now();
    $user->save();

    $this->info("Administrator ready: {$email}. Log in and you will land on /admin.");

    return 0;
})->purpose('Create (or reset) a FinstackPOS administrator account');

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// For FinstackPOS staff: add Pro months paid outside PayMongo (cash, bank transfer, promos).
Artisan::command('subscription:grant {store : Store id or slug} {months : Months to add} {--note= : Why, e.g. "Paid by bank transfer, ref 123"}', function (SubscriptionService $subscriptions) {
    $store = $this->argument('store');
    $merchant = Merchant::query()->where('id', $store)->orWhere('slug', $store)->first();
    $months = (int) $this->argument('months');

    if (! $merchant || $months < 1 || $months > 120) {
        $this->error(! $merchant ? "No store matches \"{$store}\"." : 'Months must be between 1 and 120.');

        return 1;
    }

    $payment = $subscriptions->grant($merchant, $months, $this->option('note'));
    $this->info("{$merchant->name} is on Pro until {$payment->period_end->toDayDateTimeString()}.");

    return 0;
})->purpose('Add FinstackPOS Pro months to a store without an online payment');
