<?php

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

it('prints SEO tags and the marketing font on the landing page only', function () {
    $html = $this->get('/')->assertOk()->getContent();

    expect($html)
        ->toContain('<meta name="description"')
        ->toContain('<link rel="canonical" href="'.rtrim(config('app.url'), '/').'/">')
        ->toContain('property="og:image" content="'.rtrim(config('app.url'), '/').'/og-image.png"')
        ->toContain('name="twitter:card" content="summary_large_image"')
        ->toContain('Plus+Jakarta+Sans')
        ->not->toContain('id="boot-splash"');

    expect($this->get('/login')->getContent())
        ->toContain('id="boot-splash"')
        ->not->toContain('og:title')
        ->not->toContain('Plus+Jakarta+Sans');
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
