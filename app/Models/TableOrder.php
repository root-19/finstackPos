<?php

namespace App\Models;

use App\Models\Concerns\BelongsToMerchant;
use App\Models\Concerns\BelongsToUserBranch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An order a customer placed from their table and pays for at checkout:
 * cash (staff collect it when they accept), QR Ph through the store's
 * PayMongo (confirmed by itself), or the store's own QR (the customer says
 * they paid; staff confirm it when they accept). Once paid it is a sale.
 */
class TableOrder extends Model
{
    use BelongsToMerchant, BelongsToUserBranch;

    /** Waiting for staff to accept it. */
    public const NEW = 'new';

    public const PREPARING = 'preparing';

    public const READY = 'ready';

    public const SERVED = 'served';

    public const REJECTED = 'rejected';

    /** Payment statuses. */
    public const UNPAID = 'unpaid';

    /** Paid by the store's own QR, the customer says; staff confirm it. */
    public const AWAITING = 'awaiting';

    public const PAID = 'paid';

    /** Each status and the time column stamped when it's reached. */
    public const STATUS_TIMES = [
        self::PREPARING => 'accepted_at',
        self::READY => 'ready_at',
        self::SERVED => 'served_at',
        self::REJECTED => 'rejected_at',
    ];

    /**
     * @var list<string>
     */
    protected $fillable = [
        'branch_id',
        'dining_table_id',
        'table_name',
        'public_token',
        'status',
        'note',
        'subtotal_cents',
        'total_cents',
        'payment_method',
        'payment_status',
        'payment_intent_id',
        'payment_qr',
        'payment_reference',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'payment_qr',
    ];

    protected function casts(): array
    {
        return [
            'subtotal_cents' => 'integer',
            'total_cents' => 'integer',
            'accepted_at' => 'datetime',
            'ready_at' => 'datetime',
            'served_at' => 'datetime',
            'rejected_at' => 'datetime',
            'settled_at' => 'datetime',
        ];
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(DiningTable::class, 'dining_table_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(TableOrderItem::class);
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function paymentIntent(): BelongsTo
    {
        return $this->belongsTo(PaymentIntent::class);
    }

    public function paid(): bool
    {
        return $this->settled_at !== null;
    }

    /** May move to $status from where it is now (always forward). */
    public function canMoveTo(string $status): bool
    {
        return match ($status) {
            self::PREPARING => $this->status === self::NEW,
            self::READY => in_array($this->status, [self::NEW, self::PREPARING], true),
            self::SERVED => in_array($this->status, [self::PREPARING, self::READY], true),
            self::REJECTED => in_array($this->status, [self::NEW, self::PREPARING], true) && $this->settled_at === null,
            default => false,
        };
    }

    /**
     * What the customer's phone shows.
     *
     * @return array<string, mixed>
     */
    public function forCustomer(): array
    {
        return [
            'token' => $this->public_token,
            'status' => $this->status,
            'paid' => $this->paid(),
            'payment_method' => $this->payment_method,
            'payment_status' => $this->payment_status,
            // The PayMongo QR to scan while it's unpaid.
            'qr_image' => $this->paid() ? null : $this->payment_qr,
            'note' => $this->note,
            'subtotal_cents' => $this->subtotal_cents,
            'total_cents' => $this->total_cents,
            'placed_at' => $this->created_at->toIso8601String(),
            'items' => $this->items->map->forDisplay()->all(),
        ];
    }

    /**
     * What the orders screen and the POS show.
     *
     * @return array<string, mixed>
     */
    public function forStaff(): array
    {
        return [
            'id' => $this->id,
            'table_id' => $this->dining_table_id,
            'table_name' => $this->table_name,
            'status' => $this->status,
            'note' => $this->note,
            'subtotal_cents' => $this->subtotal_cents,
            'total_cents' => $this->total_cents,
            'payment_method' => $this->payment_method,
            'payment_status' => $this->payment_status,
            'payment_reference' => $this->payment_reference,
            'placed_at' => $this->created_at->toIso8601String(),
            'items' => $this->items->map(fn (TableOrderItem $item) => [
                ...$item->forDisplay(),
                'product_id' => $item->product_id,
                'size_id' => $item->size_id,
                'unit_price_cents' => $item->unit_price_cents,
            ])->all(),
        ];
    }
}
