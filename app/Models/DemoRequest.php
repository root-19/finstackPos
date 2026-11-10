<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * A "Book a demo" request from the landing page (not tied to any store).
 *
 * @property Carbon $preferred_at
 */
class DemoRequest extends Model
{
    /** Demos are booked and shown in Philippine time. */
    public const TIMEZONE = 'Asia/Manila';

    /** How long a demo call is, in minutes (used for the calendar invite). */
    public const MINUTES = 30;

    /** How far ahead a demo can be booked, in days. */
    public const MAX_DAYS_AHEAD = 60;

    protected $fillable = ['name', 'business_name', 'email', 'phone', 'preferred_at', 'notes', 'notified_at'];

    protected function casts(): array
    {
        return [
            'preferred_at' => 'datetime',
            'notified_at' => 'datetime',
        ];
    }

    /** Bookable start times (Philippine time): every 30 minutes from 9:00 AM to 5:00 PM. */
    public static function slots(): array
    {
        $slots = [];
        for ($minutes = 9 * 60; $minutes <= 17 * 60; $minutes += 30) {
            $slots[] = sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
        }

        return $slots;
    }

    /** The first and last bookable dates (Y-m-d, Philippine time): tomorrow to 60 days ahead. */
    public static function dateRange(): array
    {
        $today = CarbonImmutable::now(self::TIMEZONE)->startOfDay();

        return [
            'min' => $today->addDay()->toDateString(),
            'max' => $today->addDays(self::MAX_DAYS_AHEAD)->toDateString(),
        ];
    }

    /** The preferred start in Philippine time, for emails and the invite. */
    public function localStart(): CarbonImmutable
    {
        return CarbonImmutable::instance($this->preferred_at)->setTimezone(self::TIMEZONE);
    }
}
