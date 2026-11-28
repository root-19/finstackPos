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
    $this->get('/download/windows')->assertRedirect('/download');
    $this->get('/download')->assertOk()->assertInertia(fn (Assert $page) => $page->component('Download')->where('desktop', null));

    file_put_contents($file, str_repeat('x', 2048));

    try {
        $this->get('/')->assertInertia(fn (Assert $page) => $page
            ->where('desktop.version', '9.9.9')
            ->where('desktop.size_bytes', 2048)
            ->missing('desktop.path')
        );
        $this->get('/download')->assertInertia(fn (Assert $page) => $page->where('desktop.version', '9.9.9'));
        $this->get('/download/windows')
            ->assertOk()
            ->assertDownload('FinstackPOS_9.9.9_x64-setup.exe');
    } finally {
        @unlink($file);
    }
});

it('tells installed desktop apps about a newer signed release', function () {
    $dir = storage_path('app/downloads');
    $old = $dir.'/FinstackPOS_9.9.8_x64-setup.exe';
    $new = $dir.'/FinstackPOS_9.9.9_x64-setup.exe';
    file_put_contents($old, 'old');
    file_put_contents($old.'.sig', 'sig-old');
    file_put_contents($new, 'new');

    try {
        // 9.9.9 has no signature yet: the updater offers the newest signed one.
        $this->get('/desktop/update/windows/x86_64/9.9.7')->assertOk()->assertJson([
            'version' => '9.9.8',
            'signature' => 'sig-old',
            'url' => route('download.windows', ['version' => '9.9.8']),
        ]);
        $this->get('/desktop/update/windows/x86_64/9.9.8')->assertNoContent();

        file_put_contents($new.'.sig', "sig-new\n");
        $this->get('/desktop/update/windows/x86_64/9.9.8')->assertOk()->assertJson(['version' => '9.9.9', 'signature' => 'sig-new']);
        $this->get('/desktop/update/windows/x86_64/9.9.9')->assertNoContent();
        $this->get('/desktop/update/darwin/aarch64/1.0.0')->assertNoContent();

        // Versioned downloads serve exactly that file.
        $this->get('/download/windows/9.9.8')->assertDownload('FinstackPOS_9.9.8_x64-setup.exe');
        $this->get('/download/windows/1.2.3')->assertRedirect('/download');
    } finally {
        foreach ([$old, $old.'.sig', $new, $new.'.sig'] as $file) {
            @unlink($file);
        }
    }
});

it('shows system details to signed-in store users', function () {
    $this->get('/system')->assertRedirect('/login');

    // Any store user, even a cashier with no extra permissions.
    $this->actingAs(staffWith([]))->get('/system')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('System/Index')
        ->has('server_time')
        ->has('web_version')
        ->where('desktop_latest', null)
    );
});

it('serves a sitemap and puts the page title and structured data in the HTML', function () {
    $this->get('/sitemap.xml')->assertOk()->assertHeader('Content-Type', 'application/xml')
        ->assertSee(rtrim(config('app.url'), '/').'/download', false);

    $html = $this->get('/')->assertOk()->getContent();
    expect($html)
        ->toContain('<title inertia>FinstackPOS: POS, inventory and payroll for Philippine small businesses</title>')
        ->toContain('application/ld+json')
        ->toContain('"@type":"SoftwareApplication"');
});

it('never uses localhost as the public address in production', function () {
    config(['app.url' => 'http://localhost']);
    app()->detectEnvironment(fn () => 'production');

    $html = $this->get('https://finstackpos.shop/')->getContent();
    expect($html)->toContain('<link rel="canonical" href="https://finstackpos.shop/">')
        ->not->toContain('http://localhost/og-image.png');
});
