<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Enums\Permission;
use App\Enums\UserRole;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * merchant_id, branch_id, role and role_id are deliberately excluded so
     * request data can never move a user to another merchant or branch, or
     * escalate their role.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
    ];

    /**
     * Same default as the column: an account is staff unless made owner.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'role' => 'staff',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_admin' => 'boolean',
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => UserRole::class,
        ];
    }

    public function merchant(): BelongsTo
    {
        return $this->belongsTo(Merchant::class);
    }

    /** The one branch a staff member works at (null: any branch). */
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /**
     * The custom role (and its permissions) of a staff member.
     */
    public function staffRole(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    /**
     * The employee record of this account in its own store, if any.
     */
    public function employee(): HasOne
    {
        return $this->hasOne(Employee::class)->where('merchant_id', $this->merchant_id);
    }

    public function isOwner(): bool
    {
        return $this->role === UserRole::Owner;
    }

    public function hasPermission(Permission $permission): bool
    {
        return $this->isOwner() || (bool) $this->staffRole?->grants($permission);
    }

    /** A FinstackPOS administrator (manages all stores; belongs to none). */
    public function isAdmin(): bool
    {
        return (bool) $this->is_admin;
    }

    public function roleName(): string
    {
        return $this->isOwner() ? 'Owner' : ($this->staffRole?->name ?? 'No role');
    }
}
