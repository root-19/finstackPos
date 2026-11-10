{{-- Plain HTML (not Markdown) so nothing the visitor typed can turn into links or formatting. --}}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>New demo request</title>
</head>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#111111;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
        <tr>
            <td style="padding:28px;">
                <p style="margin:0 0 4px;font-size:13px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:#C8102E;">Book a demo</p>
                <h1 style="margin:0 0 20px;font-size:22px;">{{ $demo->business_name }} wants a demo</h1>

                <p style="margin:0 0 6px;font-size:13px;color:#4b5563;">Requested schedule (Philippine time)</p>
                <p style="margin:0 0 20px;font-size:18px;font-weight:bold;">
                    {{ $start->format('l, F j, Y') }} · {{ $start->format('g:i A') }}–{{ $start->addMinutes(\App\Models\DemoRequest::MINUTES)->format('g:i A') }}
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:15px;line-height:1.5;">
                    <tr><td style="padding:4px 12px 4px 0;color:#4b5563;width:110px;">Name</td><td>{{ $demo->name }}</td></tr>
                    <tr><td style="padding:4px 12px 4px 0;color:#4b5563;">Business</td><td>{{ $demo->business_name }}</td></tr>
                    <tr><td style="padding:4px 12px 4px 0;color:#4b5563;">Email</td><td>{{ $demo->email }}</td></tr>
                    @if ($demo->phone)
                        <tr><td style="padding:4px 12px 4px 0;color:#4b5563;">Phone</td><td>{{ $demo->phone }}</td></tr>
                    @endif
                    @if ($demo->notes)
                        <tr><td style="padding:4px 12px 4px 0;color:#4b5563;vertical-align:top;">Notes</td><td style="white-space:pre-line;">{{ $demo->notes }}</td></tr>
                    @endif
                </table>

                <p style="margin:24px 0 0;">
                    <a href="{{ $googleCalendarUrl }}" style="display:inline-block;background:#C8102E;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px;">Add to Google Calendar</a>
                </p>
                <p style="margin:16px 0 0;font-size:13px;color:#4b5563;">
                    A calendar invite (.ics) is attached for Outlook and Apple Calendar. Reply to this email to answer {{ $demo->name }} directly.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
