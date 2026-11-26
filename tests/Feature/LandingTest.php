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

it('prints SEO tags on the landing page only, and themes the app dark', function () {
    $html = $this->get('/')->assertOk()->getContent();

    expect($html)
        ->toContain('<meta name="description"')
        ->toContain('<link rel="canonical" href="'.rtrim(config('app.url'), '/').'/">')
        ->toContain('property="og:image" content="'.rtrim(config('app.url'), '/').'/og-image.png"')
        ->toContain('name="twitter:card" content="summary_large_image"')
        ->not->toContain('fonts.googleapis.com')
        ->toContain('data-theme="marketing"')
        ->not->toContain("localStorage.getItem('finstack-theme')")
        ->not->toContain('id="boot-splash"');

    // App pages: the shop-floor theme, the same fonts, and the boot splash; no SEO tags.
    expect($this->actingAs(User::factory()->create())->get('/profile')->getContent())
        ->toContain('data-theme="shop"')
        // The saved dark/light choice is applied before the first paint.
        ->toContain("localStorage.getItem('finstack-theme')")
        ->not->toContain('fonts.googleapis.com')
        ->toContain('id="boot-splash"')
        ->not->toContain('og:title');
});

it('serves the sign-in and sign-up pages in the landing shell', function (string $path, string $component) {
    $html = $this->get($path)
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component($component))
        ->getContent();

    expect($html)
        ->not->toContain('fonts.googleapis.com')
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

it('offers the Windows app only once an installer is published', function () {
    $dir = storage_path('app/downloads');
    $file = $dir.'/FinstackPOS_9.9.9_x64-setup.exe';
    @unlink($file);

    $this->get('/')->assertInertia(fn (Assert $page) => $page->where('desktop', null));
    $this->get('/download/windows')->assertRedirect('/#desktop');

    file_put_contents($file, str_repeat('x', 2048));

    try {
        $this->get('/')->assertInertia(fn (Assert $page) => $page
            ->where('desktop.version', '9.9.9')
            ->where('desktop.size_bytes', 2048)
            ->missing('desktop.path')
        );
        $this->get('/download/windows')
            ->assertOk()
            ->assertDownload('FinstackPOS_9.9.9_x64-setup.exe');
    } finally {
        @unlink($file);
    }
});
