<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;

/**
 * Who changed what, when, and why: attendance corrections, salary changes,
 * deduction rule edits, and payroll status changes.
 */
class AuditLog extends Model
{
    use BelongsToMerchant;

    public const UPDATED_AT = null;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'subject_type',
        'subject_id',
        'action',
        'old_values',
        'new_values',
        'reason',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'old_values' => 'array',
            'new_values' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @param  array<string, mixed>|null  $old
     * @param  array<string, mixed>|null  $new
     */
    public static function record(Model $subject, string $action, ?array $old = null, ?array $new = null, ?string $reason = null): self
    {
        $log = new self([
            'subject_type' => class_basename($subject),
            'subject_id' => $subject->getKey(),
            'action' => $action,
            'old_values' => $old,
            'new_values' => $new,
            'reason' => $reason,
        ]);
        $log->merchant_id = $subject->getAttribute('merchant_id') ?? Auth::user()?->merchant_id;
        $log->user_id = Auth::id();
        $log->save();

        return $log;
    }

    /**
     * The audit trail of one record, newest first.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public static function trailFor(Model $subject): Collection
    {
        return self::query()
            ->with('user:id,name')
            ->where('subject_type', class_basename($subject))
            ->where('subject_id', $subject->getKey())
            ->latest('id')
            ->get()
            ->map(fn (self $log) => [
                'id' => $log->id,
                'action' => $log->action,
                'old_values' => $log->old_values,
                'new_values' => $log->new_values,
                'reason' => $log->reason,
                'user' => $log->user?->name,
                'at' => $log->created_at?->toIso8601String(),
            ]);
    }
}
