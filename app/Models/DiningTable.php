<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use App\Models\Concerns\BelongsToUserBranch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * A table with its own QR code. Scanning it opens the store's menu on the
 * customer's phone, and their orders arrive marked with this table.
 */
class DiningTable extends Model
{
    use BelongsToMerchant, BelongsToUserBranch;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'branch_id',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'token',
    ];

    protected function casts(): array
    {
        return [
            'staff_called_at' => 'datetime',
            'bill_requested_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (DiningTable $table) {
            $table->token ??= self::newToken();
        });
    }

    /** Unguessable, so nobody can order for a table without its code. */
    public static function newToken(): string
    {
        return Str::random(24);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(TableOrder::class);
    }

    /** The link in the table's QR code. */
    public function menuUrl(): string
    {
        return route('menu.show', $this->token);
    }
}
