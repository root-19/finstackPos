<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A feature idea a store sent from "Suggest a feature". Store users see
 * their own store's (merchant scope); administrators see every store's.
 */
class FeatureSuggestion extends Model
{
    use BelongsToMerchant;

    public const CATEGORIES = [
        'pos' => 'Point of Sale & payments',
        'products' => 'Products & inventory',
        'tables' => 'Tables & orders',
        'team' => 'Team & payroll',
        'reports' => 'Reports',
        'desktop' => 'Windows app & printers',
        'other' => 'Something else',
    ];

    public const STATUSES = [
        'new' => 'New',
        'reviewing' => 'Reviewing',
        'planned' => 'Planned',
        'done' => 'Done',
        'declined' => 'Not planned',
    ];

    public const PLANS = ['free', 'trial', 'pro'];

    protected $fillable = ['user_id', 'category', 'title', 'details', 'plan'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** The plan a store is on right now, as stored with a suggestion. */
    public static function planOf(Merchant $merchant): string
    {
        return match (true) {
            $merchant->onTrial() => 'trial',
            $merchant->isSubscribed() => 'pro',
            default => 'free',
        };
    }
}
