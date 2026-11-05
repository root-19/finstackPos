<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * One message in a store's support conversation with the FinstackPOS
 * administrators. Store users see their own store's thread (merchant
 * scope); administrators read every store's. A message may carry one
 * picture or file, kept on the private disk.
 */
class SupportMessage extends Model
{
    use BelongsToMerchant;

    /** Longest message. */
    public const MAX_LENGTH = 2000;

    /** Largest attachment, in kilobytes (10 MB). */
    public const MAX_FILE_KB = 10240;

    /** What can be attached: pictures and the usual documents. */
    public const FILE_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'txt', 'csv', 'xls', 'xlsx', 'doc', 'docx', 'zip'];

    /** The disk attachments live on (never the public one). */
    public const DISK = 'local';

    protected $fillable = ['user_id', 'from_admin', 'body', 'read_at'];

    protected function casts(): array
    {
        return [
            'from_admin' => 'boolean',
            'read_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Messages written by administrators the store has not opened yet. */
    public function scopeUnreadByStore(Builder $query): Builder
    {
        return $query->where('from_admin', true)->whereNull('read_at');
    }

    /** Messages written by stores no administrator has opened yet. */
    public function scopeUnreadByAdmin(Builder $query): Builder
    {
        return $query->where('from_admin', false)->whereNull('read_at');
    }

    /** Store the uploaded file under the merchant's own folder, with a random name. */
    public function attach(UploadedFile $file, int $merchantId): void
    {
        $extension = Str::lower($file->getClientOriginalExtension() ?: $file->extension());
        $this->attachment_path = $file->storeAs("support/{$merchantId}", Str::random(40).'.'.$extension, self::DISK);
        $this->attachment_name = Str::limit($file->getClientOriginalName(), 200, '');
        $this->attachment_mime = $file->getMimeType();
        $this->attachment_size = $file->getSize();
    }

    public function hasAttachment(): bool
    {
        return $this->attachment_path !== null;
    }

    public function attachmentIsImage(): bool
    {
        return $this->hasAttachment() && str_starts_with((string) $this->attachment_mime, 'image/');
    }

    public function attachmentDisk(): \Illuminate\Contracts\Filesystem\Filesystem
    {
        return Storage::disk(self::DISK);
    }

    /**
     * How a message is shown in either chat. The attachment link is the
     * route of the side reading it (store or admin), passed by the caller.
     *
     * @return array<string, mixed>
     */
    public function present(?string $attachmentUrl = null): array
    {
        return [
            'id' => $this->id,
            'from_admin' => $this->from_admin,
            'sender' => $this->from_admin ? 'FinstackPOS support' : ($this->user?->name ?? 'Store'),
            'body' => $this->body,
            'attachment' => $this->hasAttachment() ? [
                'name' => $this->attachment_name,
                'size' => $this->attachment_size,
                'is_image' => $this->attachmentIsImage(),
                'url' => $attachmentUrl,
            ] : null,
            'created_at' => $this->created_at->toIso8601String(),
            'read' => $this->read_at !== null,
        ];
    }
}
