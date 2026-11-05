<?php

namespace App\Models;

use App\Support\Platform;
use Database\Factories\MerchantFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Merchant extends Model
{
    /** @use HasFactory<MerchantFactory> */
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'slug',
        'address',
        'tin',
        'contact_number',
        'currency',
        'timezone',
        'tax_rate_bps',
        'prices_include_tax',
        'receipt_footer',
        'receipt_paper_mm',
        'auto_print_receipt',
        'senior_discount_enabled',
        'pwd_discount_enabled',
        'discount_rate_bps',
        'discount_vat_exempt',
        'service_charge_bps',
        'manual_qr_enabled',
        'manual_qr_label',
        'paymongo_enabled',
        'table_ordering_enabled',
        'is_active',
    ];

    /**
     * Same defaults as the columns, so a freshly created store prices sales
     * correctly before it is ever reloaded from the database.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'currency' => 'PHP',
        'timezone' => 'Asia/Manila',
        'tax_rate_bps' => 0,
        'prices_include_tax' => true,
        'receipt_paper_mm' => 80,
        'auto_print_receipt' => false,
        'senior_discount_enabled' => true,
        'pwd_discount_enabled' => true,
        'discount_rate_bps' => 2000,
        'discount_vat_exempt' => true,
        'service_charge_bps' => 0,
        'manual_qr_enabled' => false,
        'paymongo_enabled' => false,
        'table_ordering_enabled' => true,
        'is_active' => true,
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'paymongo_secret_key',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'tax_rate_bps' => 'integer',
            'prices_include_tax' => 'boolean',
            'receipt_paper_mm' => 'integer',
            'auto_print_receipt' => 'boolean',
            'senior_discount_enabled' => 'boolean',
            'pwd_discount_enabled' => 'boolean',
            'discount_rate_bps' => 'integer',
            'discount_vat_exempt' => 'boolean',
            'service_charge_bps' => 'integer',
            'manual_qr_enabled' => 'boolean',
            'paymongo_enabled' => 'boolean',
            'paymongo_secret_key' => 'encrypted',
            'is_active' => 'boolean',
            'schedule_settings' => 'array',
            'inventory_blocks_sales' => 'boolean',
            'subscribed_until' => 'datetime',
            'trial_ends_at' => 'datetime',
            'table_ordering_enabled' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        // Every new store starts with editable Manager and Cashier roles.
        static::created(function (Merchant $merchant) {
            foreach (Role::DEFAULTS as $name => $permissions) {
                $role = new Role(['name' => $name, 'permissions' => $permissions]);
                $role->merchant()->associate($merchant);
                $role->save();
            }

            // Statutory deduction templates, off until the owner verifies them.
            DeductionRule::insertDefaultsFor($merchant->id);

            $merchant->createMainBranch();
        });
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function roles(): HasMany
    {
        return $this->hasMany(Role::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function categories(): HasMany
    {
        return $this->hasMany(Category::class);
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    public function diningTables(): HasMany
    {
        return $this->hasMany(DiningTable::class);
    }

    public function branches(): HasMany
    {
        return $this->hasMany(Branch::class);
    }

    /**
     * The store's first branch: where sales go when no other branch is
     * chosen (every store has one; see the created hook).
     */
    public function mainBranch(): Branch
    {
        return Branch::withoutGlobalScopes()->where('merchant_id', $this->id)->orderByDesc('is_active')->oldest('id')->first()
            ?? $this->createMainBranch();
    }

    private function createMainBranch(): Branch
    {
        $branch = new Branch(['name' => 'Main branch', 'address' => $this->address]);
        $branch->merchant_id = $this->id;
        $branch->save();

        return $branch;
    }

    /**
     * Active branches, main first.
     *
     * @return list<array{id: int, name: string}>
     */
    public function branchList(): array
    {
        return Branch::withoutGlobalScopes()
            ->where('merchant_id', $this->id)
            ->where('is_active', true)
            ->orderBy('id')
            ->get(['id', 'name'])
            ->map(fn (Branch $b) => ['id' => $b->id, 'name' => $b->name])
            ->all();
    }

    public function paymentIntents(): HasMany
    {
        return $this->hasMany(PaymentIntent::class);
    }

    /**
     * Settings the POS client needs to price, take payment for, and print a
     * sale offline. Never includes the gateway secret.
     *
     * @return array<string, mixed>
     */
    public function posSettings(): array
    {
        return [
            ...$this->only([
                'id', 'name', 'address', 'tin', 'contact_number', 'currency',
                'tax_rate_bps', 'prices_include_tax',
                'receipt_footer', 'receipt_paper_mm', 'auto_print_receipt',
                'senior_discount_enabled', 'pwd_discount_enabled', 'discount_rate_bps', 'discount_vat_exempt',
                'service_charge_bps', 'manual_qr_enabled', 'manual_qr_label',
            ]),
            'inventory_blocks_sales' => (bool) $this->inventory_blocks_sales,
            'manual_qr_image_url' => $this->manual_qr_image_path ? '/storage/'.$this->manual_qr_image_path : null,
            // Chosen in Settings (the key itself never leaves the server).
            'paymongo_enabled' => (bool) $this->paymongo_enabled,
            'paymongo_ready' => $this->paymongoReady(),
            // The POS checks for orders from the tables' QR codes.
            'table_ordering' => $this->tableOrderingActive(),
            // Where a sale is made (the POS picks one, unless the cashier is tied to one).
            'branches' => $this->branchList(),
        ];
    }

    /** Pro, and turned on: customers can order from the table QR codes. */
    public function tableOrderingActive(): bool
    {
        return $this->table_ordering_enabled && $this->isSubscribed();
    }

    /**
     * What the menu on a customer's phone at $branch can do right now: open
     * (take orders), paused (its staff said not now), offline (no device of
     * the branch is checking, so nobody would see an order), or menu_only
     * (the menu to look at: the Free plan, ordering off, or a closed branch).
     */
    public function tableOrderingState(Branch $branch): string
    {
        return match (true) {
            ! $this->tableOrderingActive() || ! $branch->is_active => 'menu_only',
            $branch->ordering_paused => 'paused',
            ! $branch->orderDeviceOnline() => 'offline',
            default => 'open',
        };
    }

    /** Pro: the Management modules and unlimited products (see config/subscriptions.php). */
    public function isSubscribed(): bool
    {
        return $this->subscribed_until !== null && $this->subscribed_until->isFuture();
    }

    /** Pro through the free trial, with no paid time after it yet. */
    public function onTrial(): bool
    {
        return $this->trial_ends_at !== null
            && $this->trial_ends_at->isFuture()
            && $this->subscribed_until !== null
            && $this->subscribed_until->lte($this->trial_ends_at);
    }

    /** The free Pro trial is still unused and the store isn't on Pro now. */
    public function canStartTrial(): bool
    {
        return $this->trial_ends_at === null && ! $this->isSubscribed() && Platform::trialDays() > 0;
    }

    /** Products a free store may have; null when unlimited. */
    public function productLimit(): ?int
    {
        return $this->isSubscribed() ? null : Platform::freeProductLimit();
    }

    public function subscriptionPayments(): HasMany
    {
        return $this->hasMany(SubscriptionPayment::class);
    }

    public function paymongoReady(): bool
    {
        return $this->paymongo_enabled && filled($this->paymongo_secret_key);
    }

    public function allowsDiscount(string $type): bool
    {
        return match ($type) {
            'senior' => $this->senior_discount_enabled,
            'pwd' => $this->pwd_discount_enabled,
            default => false,
        };
    }

    /**
     * Price a sale from its line subtotal. Mirrors computeTotals() in
     * resources/js/lib/money.ts, so keep the two in sync.
     *
     * A senior/PWD discount (VAT-exempt by default, as in the Philippines)
     * first removes VAT, then takes the discount off the VAT-exclusive
     * amount. Service charge is a percentage of the discounted amount.
     *
     * @return array{vat_exempt: int, discount: int, service_charge: int, tax: int, total: int}
     */
    public function computeTotals(int $subtotalCents, ?string $discountType = null): array
    {
        $bps = $this->tax_rate_bps;
        $vatExempt = 0;
        $discount = 0;
        $tax = 0;

        if ($discountType !== null && $this->discount_vat_exempt) {
            $base = $this->prices_include_tax
                ? (int) round($subtotalCents * 10000 / (10000 + $bps))
                : $subtotalCents;
            $vatExempt = $subtotalCents - $base;
            $discount = (int) round($base * $this->discount_rate_bps / 10000);
            $goods = $base - $discount;
            $goodsTotal = $goods;
        } else {
            if ($discountType !== null) {
                $discount = (int) round($subtotalCents * $this->discount_rate_bps / 10000);
            }
            $goods = $subtotalCents - $discount;

            if ($this->prices_include_tax) {
                $tax = $goods - (int) round($goods * 10000 / (10000 + $bps));
                $goodsTotal = $goods;
            } else {
                $tax = (int) round($goods * $bps / 10000);
                $goodsTotal = $goods + $tax;
            }
        }

        $serviceCharge = (int) round($goods * $this->service_charge_bps / 10000);

        return [
            'vat_exempt' => $vatExempt,
            'discount' => $discount,
            'service_charge' => $serviceCharge,
            'tax' => $tax,
            'total' => $goodsTotal + $serviceCharge,
        ];
    }
}
