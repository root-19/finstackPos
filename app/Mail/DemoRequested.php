<?php

namespace App\Mail;

use App\Models\DemoRequest;
use Carbon\CarbonImmutable;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Attachment;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Tells the FinstackPOS team someone booked a demo. Reply-To is the visitor,
 * and a calendar invite (.ics) plus a Google Calendar link put the slot on
 * the team's calendar in one tap.
 */
class DemoRequested extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public DemoRequest $demo) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            replyTo: [new Address($this->demo->email, $this->demo->name)],
            subject: 'Demo request: '.$this->demo->business_name.', '.$this->demo->localStart()->format('D, M j, g:i A').' PHT',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.demo-requested',
            with: [
                'demo' => $this->demo,
                'start' => $this->demo->localStart(),
                'googleCalendarUrl' => $this->googleCalendarUrl(),
            ],
        );
    }

    /** @return array<int, Attachment> */
    public function attachments(): array
    {
        return [
            Attachment::fromData(fn () => $this->ics(), 'finstackpos-demo.ics')->withMime('text/calendar; charset=utf-8; method=PUBLISH'),
        ];
    }

    private function title(): string
    {
        return 'FinstackPOS demo: '.$this->demo->business_name;
    }

    private function details(): string
    {
        $d = $this->demo;

        return implode("\n", array_filter([
            "Name: {$d->name}",
            "Business: {$d->business_name}",
            "Email: {$d->email}",
            $d->phone ? "Phone: {$d->phone}" : null,
            $d->notes ? "Notes: {$d->notes}" : null,
        ]));
    }

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable} start and end in UTC */
    private function span(): array
    {
        $start = CarbonImmutable::instance($this->demo->preferred_at)->utc();

        return [$start, $start->addMinutes(DemoRequest::MINUTES)];
    }

    public function googleCalendarUrl(): string
    {
        [$start, $end] = $this->span();

        return 'https://calendar.google.com/calendar/render?'.http_build_query([
            'action' => 'TEMPLATE',
            'text' => $this->title(),
            'dates' => $start->format('Ymd\THis\Z').'/'.$end->format('Ymd\THis\Z'),
            'details' => $this->details(),
            'ctz' => DemoRequest::TIMEZONE,
        ], '', '&', PHP_QUERY_RFC3986);
    }

    /** An RFC 5545 event for the requested slot (times in UTC). */
    public function ics(): string
    {
        [$start, $end] = $this->span();
        $host = parse_url((string) config('app.url'), PHP_URL_HOST) ?: 'finstackpos';

        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//FinstackPOS//Demo requests//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            'UID:demo-request-'.$this->demo->id.'@'.$host,
            'DTSTAMP:'.CarbonImmutable::now('UTC')->format('Ymd\THis\Z'),
            'DTSTART:'.$start->format('Ymd\THis\Z'),
            'DTEND:'.$end->format('Ymd\THis\Z'),
            'SUMMARY:'.self::escape($this->title()),
            'DESCRIPTION:'.self::escape($this->details()),
            'END:VEVENT',
            'END:VCALENDAR',
        ];

        return implode("\r\n", array_map(self::fold(...), $lines))."\r\n";
    }

    /** Escape a TEXT value: backslash, semicolon, comma and newlines. */
    private static function escape(string $text): string
    {
        return str_replace(['\\', ';', ',', "\r\n", "\n", "\r"], ['\\\\', '\;', '\,', '\n', '\n', '\n'], $text);
    }

    /** Fold lines longer than 75 octets (continuation lines start with a space). */
    private static function fold(string $line): string
    {
        $out = '';
        while (strlen($line) > 75) {
            $cut = 75;
            // Don't split a multi-byte UTF-8 character.
            while ($cut > 0 && (ord($line[$cut]) & 0xC0) === 0x80) {
                $cut--;
            }
            $out .= substr($line, 0, $cut)."\r\n ";
            $line = substr($line, $cut);
        }

        return $out.$line;
    }
}
