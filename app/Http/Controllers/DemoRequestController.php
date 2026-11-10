<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreDemoRequest;
use App\Mail\DemoRequested;
use App\Models\DemoRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

/**
 * "Book a demo" from the landing page: saves the request, then emails the
 * team (services.demo_requests.notify) with a calendar invite attached.
 */
class DemoRequestController extends Controller
{
    public const BOOKED = 'Thanks! Your demo request is in. We will confirm the schedule by email.';

    /** Demo requests one email address can make in 24 hours. */
    public const PER_EMAIL_PER_DAY = 3;

    public function store(StoreDemoRequest $request): RedirectResponse
    {
        $data = $request->validated();

        // A bot filled the hidden field: answer as if it worked, but keep and send nothing.
        if (filled($data['website'] ?? null)) {
            return back()->with('success', self::BOOKED);
        }

        $email = Str::lower($data['email']);
        $preferredAt = Carbon::createFromFormat('Y-m-d H:i', "{$data['date']} {$data['time']}", DemoRequest::TIMEZONE)->utc();

        // The same person asking for the same slot again (a double tap, a retry): already booked, don't email twice.
        if (DemoRequest::query()->where('email', $email)->where('preferred_at', $preferredAt)->exists()) {
            return back()->with('success', self::BOOKED);
        }

        // Limits on top of the per-IP throttle (see AppServiceProvider), so a flood from many IPs can't
        // use up the mail account's daily quota (the same account sends password resets).
        if (DemoRequest::query()->where('email', $email)->where('created_at', '>=', now()->subDay())->count() >= self::PER_EMAIL_PER_DAY) {
            return back()->withErrors(['email' => 'You already asked for a few demos today. We will reply by email.']);
        }

        if (DemoRequest::query()->where('created_at', '>=', now()->subDay())->count() >= (int) config('services.demo_requests.daily_limit')) {
            Log::warning('Demo requests hit the daily limit; new ones are refused until it resets');

            return back()->withErrors(['form' => 'We have received many demo requests today. Please try again tomorrow.']);
        }

        $demo = DemoRequest::create([
            'name' => $data['name'],
            'business_name' => $data['business_name'],
            'email' => $email,
            'phone' => $data['phone'] ?? null,
            'notes' => $data['notes'] ?? null,
            'preferred_at' => $preferredAt,
        ]);

        $notify = config('services.demo_requests.notify');

        if ($notify) {
            // Sent right away (not queued): the queue may have no worker running.
            try {
                Mail::to($notify)->send(new DemoRequested($demo));
                $demo->update(['notified_at' => now()]);
            } catch (Throwable $e) {
                // The request is saved either way; the team can find it in demo_requests.
                Log::error('Demo request email failed', ['demo_request_id' => $demo->id, 'error' => $e->getMessage()]);
            }
        } else {
            Log::warning('DEMO_REQUEST_NOTIFY_EMAIL is not set; demo request saved without an email', ['demo_request_id' => $demo->id]);
        }

        return back()->with('success', self::BOOKED);
    }
}
