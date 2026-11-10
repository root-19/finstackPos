<?php

use App\Models\User;
use App\Support\Platform;
use Inertia\Testing\AssertableInertia as Assert;

it('passes the live price, product limit and trial to the landing page', function () {
    Platform::set('subscription_price_cents', 24900, null);
    Platform::set('free_product_limit', 75, null);
    Platform::set('trial_days', 7, null);
    Platform::set('max_months', 12, null);
    Platform::flush();

    $this->get('/')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Welcome')
            ->where('pricing.price_cents', 24900)
            ->where('pricing.free_product_limit', 75)
            ->where('pricing.max_months', 12)
            ->where('trial.days', 7)
        );
});

it('prints SEO tags and the marketing fonts on the landing page only', function () {
    $html = $this->get('/')->assertOk()->getContent();

    expect($html)
        ->toContain('<meta name="description"')
        ->toContain('<link rel="canonical" href="'.rtrim(config('app.url'), '/').'/">')
        ->toContain('property="og:image" content="'.rtrim(config('app.url'), '/').'/og-image.png"')
        ->toContain('name="twitter:card" content="summary_large_image"')
        ->toContain('IBM+Plex+Mono')
        ->not->toContain('id="boot-splash"');

    // App pages keep the app's font and boot splash.
    expect($this->actingAs(User::factory()->create())->get('/profile')->getContent())
        ->toContain('id="boot-splash"')
        ->not->toContain('og:title')
        ->not->toContain('IBM+Plex+Mono');
});

it('serves the sign-in and sign-up pages in the landing shell', function (string $path, string $component) {
    $html = $this->get($path)
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component($component))
        ->getContent();

    expect($html)
        ->toContain('IBM+Plex+Mono')
        ->toContain('<link rel="canonical" href="'.rtrim(config('app.url'), '/').$path.'">')
        ->not->toContain('id="boot-splash"');
})->with([
    ['/login', 'Auth/Login'],
    ['/register', 'Auth/Register'],
    ['/forgot-password', 'Auth/ForgotPassword'],
]);

it('leaves the landing shell with a full page load after login and logout', function () {
    $user = User::factory()->create();
    $inertia = ['X-Inertia' => 'true', 'X-Requested-With' => 'XMLHttpRequest'];

    $this->withHeaders($inertia)
        ->post('/login', ['email' => $user->email, 'password' => 'password'])
        ->assertStatus(409)
        ->assertHeader('X-Inertia-Location', url('/dashboard'));

    $this->withHeaders($inertia)
        ->post('/logout')
        ->assertStatus(409)
        ->assertHeader('X-Inertia-Location', url('/'));
});

it('serves the draft legal pages', function (string $path, string $component) {
    $this->get($path)
        ->assertOk()
        ->assertSee('<link rel="canonical" href="'.rtrim(config('app.url'), '/').$path.'">', false)
        ->assertInertia(fn (Assert $page) => $page->component($component));
})->with([
    ['/privacy', 'Legal/Privacy'],
    ['/terms', 'Legal/Terms'],
]);
