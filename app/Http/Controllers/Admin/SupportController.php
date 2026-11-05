<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Merchant;
use App\Models\SupportMessage;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Support conversations with every store, for administrators: the stores
 * that wrote in (unanswered ones first), and each store's thread.
 */
class SupportController extends Controller
{
    /** Messages shown in a thread (the latest). */
    private const LIMIT = 200;

    public function index(): Response
    {
        $latest = DB::table('support_messages')
            ->selectRaw('merchant_id, max(id) as last_id')
            ->groupBy('merchant_id');

        $unread = DB::table('support_messages')
            ->selectRaw('merchant_id, count(*) as unread')
            ->where('from_admin', false)
            ->whereNull('read_at')
            ->groupBy('merchant_id');

        $rows = DB::table('support_messages as m')
            ->joinSub($latest, 'latest', fn ($join) => $join->on('m.id', '=', 'latest.last_id'))
            ->leftJoinSub($unread, 'unread', fn ($join) => $join->on('unread.merchant_id', '=', 'm.merchant_id'))
            ->join('merchants', 'merchants.id', '=', 'm.merchant_id')
            ->orderByRaw('coalesce(unread.unread, 0) > 0 desc')
            ->orderByDesc('m.id')
            ->limit(200)
            ->get(['m.merchant_id', 'm.body', 'm.from_admin', 'm.created_at', 'm.attachment_name', 'm.attachment_mime', 'merchants.name', 'merchants.slug', 'merchants.is_active', DB::raw('coalesce(unread.unread, 0) as unread')]);

        $owners = AdminDashboardController::ownerEmails();

        return Inertia::render('Admin/Support/Index', [
            'threads' => $rows->map(fn ($r) => [
                'store_id' => $r->merchant_id,
                'store' => $r->name,
                'slug' => $r->slug,
                'owner' => $owners[$r->merchant_id] ?? null,
                'is_active' => (bool) $r->is_active,
                'unread' => (int) $r->unread,
                'last_from_admin' => (bool) $r->from_admin,
                'last_body' => $r->body !== '' ? $r->body : (str_starts_with((string) $r->attachment_mime, 'image/') ? '[Picture]' : '[File] '.$r->attachment_name),
                'last_at' => $r->created_at,
            ]),
        ]);
    }

    public function show(Merchant $store): Response
    {
        $this->thread($store)->unreadByAdmin()->update(['read_at' => now()]);

        $messages = $this->thread($store)
            ->with('user:id,name')
            ->latest('id')
            ->limit(self::LIMIT)
            ->get()
            ->reverse()
            ->values();

        $owners = AdminDashboardController::ownerEmails();

        return Inertia::render('Admin/Support/Show', [
            'store' => [
                'id' => $store->id,
                'name' => $store->name,
                'slug' => $store->slug,
                'owner' => $owners[$store->id] ?? null,
                'is_active' => $store->is_active,
                'pro' => $store->isSubscribed(),
            ],
            'messages' => $messages->map(fn (SupportMessage $m) => $m->present(
                $m->hasAttachment() ? route('admin.support.attachment', [$store, $m]) : null,
            )),
            'upload' => ['max_kb' => SupportMessage::MAX_FILE_KB, 'types' => SupportMessage::FILE_TYPES],
        ]);
    }

    public function store(Request $request, Merchant $store): RedirectResponse
    {
        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:'.SupportMessage::MAX_LENGTH, 'required_without:attachment'],
            'attachment' => ['nullable', 'file', 'max:'.SupportMessage::MAX_FILE_KB, 'extensions:'.implode(',', SupportMessage::FILE_TYPES), 'mimes:'.implode(',', SupportMessage::FILE_TYPES)],
        ]);

        $message = new SupportMessage([
            'user_id' => $request->user()->id,
            'from_admin' => true,
            'body' => trim($data['body'] ?? ''),
        ]);
        $message->merchant()->associate($store);

        if ($request->hasFile('attachment')) {
            $message->attach($request->file('attachment'), $store->id);
        }

        $message->save();

        return back();
    }

    /** The picture or file on a message of this store's thread. */
    public function attachment(Merchant $store, int $message): StreamedResponse
    {
        $message = $this->thread($store)->whereKey($message)->whereNotNull('attachment_path')->firstOrFail();

        return $message->attachmentDisk()->response(
            $message->attachment_path,
            $message->attachment_name,
            ['Content-Type' => $message->attachment_mime, 'X-Content-Type-Options' => 'nosniff'],
            $message->attachmentIsImage() ? 'inline' : 'attachment',
        );
    }

    /** Administrators belong to no store, so the merchant scope is lifted. */
    private function thread(Merchant $store): Builder
    {
        return SupportMessage::withoutGlobalScope('merchant')->where('merchant_id', $store->id);
    }
}
