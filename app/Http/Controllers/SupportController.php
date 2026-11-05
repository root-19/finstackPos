<?php

namespace App\Http\Controllers;

use App\Models\SupportMessage;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The store's chat with FinstackPOS support. Every plan has it; anyone in
 * the store can write, and the whole store shares one conversation.
 */
class SupportController extends Controller
{
    /** Messages shown at once (the latest). */
    private const LIMIT = 200;

    public function index(Request $request): Response
    {
        // Opening the chat reads the administrators' replies.
        SupportMessage::query()->unreadByStore()->update(['read_at' => now()]);

        $messages = SupportMessage::query()
            ->with('user:id,name')
            ->latest('id')
            ->limit(self::LIMIT)
            ->get()
            ->reverse()
            ->values();

        return Inertia::render('Support/Index', [
            'messages' => $messages->map(fn (SupportMessage $m) => $m->present(
                $m->hasAttachment() ? route('support.attachment', $m) : null,
            )),
            'upload' => ['max_kb' => SupportMessage::MAX_FILE_KB, 'types' => SupportMessage::FILE_TYPES],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:'.SupportMessage::MAX_LENGTH, 'required_without:attachment'],
            'attachment' => ['nullable', 'file', 'max:'.SupportMessage::MAX_FILE_KB, 'extensions:'.implode(',', SupportMessage::FILE_TYPES), 'mimes:'.implode(',', SupportMessage::FILE_TYPES)],
        ]);

        $message = new SupportMessage([
            'user_id' => $request->user()->id,
            'from_admin' => false,
            'body' => trim($data['body'] ?? ''),
        ]);

        if ($request->hasFile('attachment')) {
            $message->attach($request->file('attachment'), $request->user()->merchant_id);
        }

        $message->save();

        return back();
    }

    /** The picture or file on one of the store's own messages (merchant scoped: others are 404). */
    public function attachment(SupportMessage $message): StreamedResponse
    {
        abort_unless($message->hasAttachment(), 404);

        return $message->attachmentDisk()->response(
            $message->attachment_path,
            $message->attachment_name,
            ['Content-Type' => $message->attachment_mime, 'X-Content-Type-Options' => 'nosniff'],
            $message->attachmentIsImage() ? 'inline' : 'attachment',
        );
    }
}
