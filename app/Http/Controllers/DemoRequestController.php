<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreDemoRequest;
use App\Mail\DemoRequested;
use App\Models\DemoRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * "Book a demo" from the landing page: saves the request, then emails the
 * team (services.demo_requests.notify) with a calendar invite attached.
 */
class DemoRequestController extends Controller
{
    public const BOOKED = 'Thanks! Your demo request is in. We will confirm the schedule by email.';

    public function store(StoreDemoRequest $request): RedirectResponse
    {
        $data = $request->validated();

        // A bot filled the hidden field: answer as if it worked, but keep and send nothing.
        if (filled($data['website'] ?? null)) {
            return back()->with('success', self::BOOKED);
        }

        $demo = DemoRequest::create([
            'name' => $data['name'],
            'business_name' => $data['business_name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'notes' => $data['notes'] ?? null,
            'preferred_at' => Carbon::createFromFormat('Y-m-d H:i', "{$data['date']} {$data['time']}", DemoRequest::TIMEZONE)->utc(),
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
