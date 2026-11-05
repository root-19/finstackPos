<?php

namespace App\Models;

use App\Enums\PaymentMethod;
use App\Models\Concerns\BelongsToMerchant;
use App\Models\Concerns\BelongsToUserBranch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    use BelongsToMerchant, BelongsToUserBranch;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'client_uuid',
        'payment_method',
        'payment_reference',
        'subtotal_cents',
        'discount_type',
        'discount_id_number',
        'discount_customer_name',
        'discount_doh_check',
        'vat_exempt_cents',
        'discount_cents',
        'service_charge_cents',
        'tax_cents',
        'total_cents',
        'amount_paid_cents',
        'change_cents',
        'sold_at',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'payment_method' => PaymentMethod::class,
            'sold_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    /**
     * Short reference printed on the device's confirmation screen.
     */
    public function reference(): string
    {
        return strtoupper(substr($this->client_uuid, 0, 8));
    }
}
