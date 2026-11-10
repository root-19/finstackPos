<?php

use App\Http\Controllers\DemoRequestController;
use App\Mail\DemoRequested;
use App\Models\DemoRequest;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    Carbon::setTestNow(Carbon::parse('2026-11-10 08:00', 'Asia/Manila'));
    config(['services.demo_requests.notify' => 'owner@example.test']);
    Mail::fake();
});

afterEach(fn () => Carbon::setTestNow());

function demoForm(array $overrides = []): array
{
    return [
        'name' => 'Ana Bautista',
        'business_name' => 'Kapihan sa Kanto',
        'email' => 'ana@example.test',
        'phone' => '0917 123 4567',
        'date' => '2026-11-12',
        'time' => '10:00',
        'notes' => 'Two branches, milk tea',
        'website' => '',
        ...$overrides,
    ];
}

it('offers the bookable slots and dates on the landing page', function () {
    $this->get('/')->assertInertia(fn (Assert $page) => $page
        ->where('demo.min', '2026-11-11')
        ->where('demo.max', '2027-01-09')
        ->where('demo.slots.0', '09:00')
        ->where('demo.slots', fn ($slots) => collect($slots)->last() === '17:00')
        ->where('demo.minutes', 30)
    );
});

it('saves a demo request in UTC and emails the team with a calendar invite', function () {
    $this->from('/')->post('/book-demo', demoForm())
        ->assertRedirect('/')
        ->assertSessionHas('success', DemoRequestController::BOOKED);

    $demo = DemoRequest::sole();
    // 10:00 AM in Manila (UTC+8) is 02:00 UTC.
    expect($demo->preferred_at->utc()->format('Y-m-d H:i'))->toBe('2026-11-12 02:00')
        ->and($demo->business_name)->toBe('Kapihan sa Kanto')
        ->and($demo->notified_at)->not->toBeNull();

    Mail::assertSent(DemoRequested::class, function (DemoRequested $mail) {
        $ics = $mail->ics();

        return $mail->hasTo('owner@example.test')
            && $mail->hasReplyTo('ana@example.test')
            && str_contains($mail->envelope()->subject, 'Thu, Nov 12, 10:00 AM PHT')
            && str_contains($ics, "DTSTART:20261112T020000Z\r\n")
            && str_contains($ics, "DTEND:20261112T023000Z\r\n")
            && str_contains($ics, 'SUMMARY:FinstackPOS demo: Kapihan sa Kanto')
            // Commas in the notes are escaped in the invite.
            && str_contains($ics, 'Notes: Two branches\, milk tea')
            && str_contains($mail->googleCalendarUrl(), 'dates=20261112T020000Z%2F20261112T023000Z');
    });
});

it('rejects past dates, far dates, odd times and missing fields', function (array $input, string $field) {
    $this->from('/')->post('/book-demo', demoForm($input))->assertSessionHasErrors($field);

    expect(DemoRequest::count())->toBe(0);
    Mail::assertNothingSent();
})->with([
    'today' => [['date' => '2026-11-10'], 'date'],
    'too far' => [['date' => '2027-02-01'], 'date'],
    'off-slot time' => [['time' => '10:15'], 'time'],
    'after hours' => [['time' => '19:00'], 'time'],
    'bad email' => [['email' => 'not-an-email'], 'email'],
    'no name' => [['name' => ''], 'name'],
    'bad phone' => [['phone' => 'call me'], 'phone'],
]);

it('quietly ignores bots that fill the hidden field', function () {
    $this->from('/')->post('/book-demo', demoForm(['website' => 'https://spam.example']))
        ->assertRedirect('/')
        ->assertSessionHas('success');

    expect(DemoRequest::count())->toBe(0);
    Mail::assertNothingSent();
});

it('still saves the request when no notify address is set', function () {
    config(['services.demo_requests.notify' => null]);

    $this->from('/')->post('/book-demo', demoForm())->assertSessionHas('success');

    expect(DemoRequest::sole()->notified_at)->toBeNull();
    Mail::assertNothingSent();
});

it('limits how often one visitor can book', function () {
    foreach (range(1, 5) as $i) {
        $this->from('/')->post('/book-demo', demoForm(['email' => "ana{$i}@example.test"]))->assertRedirect('/');
    }

    $this->from('/')->post('/book-demo', demoForm())->assertStatus(429);
});

it('renders the notification email without letting the visitor inject markup', function () {
    $demo = DemoRequest::create([
        'name' => '<b>Ana</b>',
        'business_name' => 'Kapihan [click](https://evil.example)',
        'email' => 'ana@example.test',
        'preferred_at' => Carbon::parse('2026-11-12 10:00', 'Asia/Manila')->utc(),
    ]);

    $html = (new DemoRequested($demo))->render();

    expect($html)
        ->toContain('&lt;b&gt;Ana&lt;/b&gt;')
        ->not->toContain('<b>Ana</b>')
        ->not->toContain('href="https://evil.example"')
        ->toContain('Thursday, November 12, 2026');
});
