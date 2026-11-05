<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One payment for Pro months. Applied (period set) exactly once, when the
 * gateway confirms it.
 */
class SubscriptionPayment extends Model
{
    use BelongsToMerchant;

    protected $fillable = [
        'user_id',
        'months',
        'amount_cents',
        'provider',
        'provider_id',
        'status',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'months' => 'integer',
            'amount_cents' => 'integer',
            'period_start' => 'datetime',
            'period_end' => 'datetime',
            'paid_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function applied(): bool
    {
        return $this->period_end !== null;
    }
}
