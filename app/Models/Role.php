<?php

namespace App\Models;

use App\Enums\Permission;
use App\Models\Concerns\BelongsToMerchant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A job role the owner defines for their staff (e.g. "Barista") with the
 * permissions it grants.
 */
class Role extends Model
{
    use BelongsToMerchant;

    /**
     * Created for every new store; the owner can edit or delete them.
     */
    public const DEFAULTS = [
        'Manager' => ['pos.sell', 'products.manage', 'categories.manage', 'sales.view', 'inventory.manage'],
        'Cashier' => ['pos.sell'],
    ];

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'permissions',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'permissions' => 'array',
        ];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function grants(Permission $permission): bool
    {
        return in_array($permission->value, $this->permissions ?? [], true);
    }
}
