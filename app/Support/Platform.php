<?php

namespace App\Support;

use App\Models\PlatformSetting;
use Illuminate\Support\Facades\Schema;

/**
 * Plan settings: what an administrator saved, else config/subscriptions.php.
 */
class Platform
{
    /** Setting key => config key holding its default. */
    public const SETTINGS = [
        'subscription_price_cents' => 'subscriptions.price_cents',
        'free_product_limit' => 'subscriptions.free_product_limit',
        'max_months' => 'subscriptions.max_months',
        'trial_days' => 'subscriptions.trial_days',
    ];

    /** @var array<string, string|null>|null */
    private static ?array $saved = null;

    public static function subscriptionPriceCents(): int
    {
        return (int) self::get('subscription_price_cents');
    }

    public static function freeProductLimit(): int
    {
        return (int) self::get('free_product_limit');
    }

    public static function maxMonths(): int
    {
        return (int) self::get('max_months');
    }

    public static function trialDays(): int
    {
        return (int) self::get('trial_days');
    }

    public static function get(string $key): mixed
    {
        self::$saved ??= Schema::hasTable('platform_settings')
            ? PlatformSetting::query()->pluck('value', 'key')->all()
            : [];

        return self::$saved[$key] ?? config(self::SETTINGS[$key]);
    }

    public static function set(string $key, int|string $value, ?int $userId): void
    {
        PlatformSetting::query()->updateOrCreate(['key' => $key], ['value' => (string) $value, 'updated_by' => $userId]);
        self::flush();
    }

    /** Forget the values read in this request (after saving, and between tests). */
    public static function flush(): void
    {
        self::$saved = null;
    }
}
