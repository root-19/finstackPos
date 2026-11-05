<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A location of the store. Sales are made at a branch, staff can be tied to
 * one, and each branch has its own tables and table orders. Products and
 * stock are shared by the whole store.
 */
class Branch extends Model
{
    use BelongsToMerchant;

    /** Seconds without any device of the branch checking for orders before its menus stop taking them. */
    public const ORDER_DEVICE_TIMEOUT = 90;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'address',
        'is_active',
        'ordering_paused',
    ];

    protected $attributes = [
        'is_active' => true,
        'ordering_paused' => false,
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'ordering_paused' => 'boolean',
            'orders_seen_at' => 'datetime',
        ];
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function tables(): HasMany
    {
        return $this->hasMany(DiningTable::class);
    }

    /**
     * The branch a user works at: their own when they're tied to one;
     * otherwise the one they asked for (a branch of their store; an active
     * one unless $activeOnly is off, e.g. for a sale made before the branch
     * closed), else the store's main branch.
     */
    public static function forUser(User $user, ?int $requested = null, bool $activeOnly = true): self
    {
        if ($user->branch_id !== null && ($own = self::withoutGlobalScopes()->find($user->branch_id))) {
            return $own;
        }

        $chosen = $requested !== null
            ? self::withoutGlobalScopes()->where('merchant_id', $user->merchant_id)->when($activeOnly, fn ($q) => $q->where('is_active', true))->find($requested)
            : null;

        return $chosen ?? $user->merchant->mainBranch();
    }

    /**
     * The branch a page shows: the user's own when they're tied to one,
     * else the requested branch of their store, else null (every branch:
     * the overall view).
     */
    public static function viewFor(User $user, mixed $requested): ?int
    {
        if ($user->branch_id !== null) {
            return $user->branch_id;
        }

        return is_numeric($requested)
            ? self::withoutGlobalScopes()->where('merchant_id', $user->merchant_id)->whereKey((int) $requested)->value('id')
            : null;
    }

    /** A device of this branch is checking for orders (see TableOrderController::feed). */
    public function markOrderDeviceSeen(): void
    {
        // A write every 15 seconds is plenty for a 90-second timeout.
        if ($this->orders_seen_at === null || $this->orders_seen_at->lt(now()->subSeconds(15))) {
            $this->forceFill(['orders_seen_at' => now()])->saveQuietly();
        }
    }

    public function orderDeviceOnline(): bool
    {
        return $this->orders_seen_at !== null && $this->orders_seen_at->gte(now()->subSeconds(self::ORDER_DEVICE_TIMEOUT));
    }
}
