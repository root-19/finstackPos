<?php

namespace App\Support;

/**
 * The parts of FinstackPOS a store can turn on or off (Settings → Customize).
 * A module that is off disappears from the sidebar and its pages are blocked
 * (the `module:` route middleware); its data is kept, so turning it back on
 * brings everything back.
 *
 * Always on, so not listed: Dashboard, Settings, Profile, Support and
 * System details. New modules (e.g. Appointments) are added here; listing
 * one in DEFAULTS turns it on for stores that never customized.
 */
class Modules
{
    /**
     * key => label, description, group, whether it needs Pro, and the modules
     * it can't work without (turned on with it).
     *
     * @var array<string, array{label: string, description: string, group: string, pro: bool, requires: list<string>}>
     */
    public const ALL = [
        'pos' => [
            'label' => 'Point of Sale',
            'description' => 'The register: sell, take payments and print receipts. Includes the customer display.',
            'group' => 'Selling',
            'pro' => false,
            'requires' => ['products'],
        ],
        'products' => [
            'label' => 'Products & Categories',
            'description' => 'What you sell, with prices, sizes, photos and barcodes.',
            'group' => 'Selling',
            'pro' => false,
            'requires' => [],
        ],
        'sales' => [
            'label' => 'Sales history',
            'description' => 'Every sale with its cashier and payment. Reprint receipts, void and refund.',
            'group' => 'Selling',
            'pro' => false,
            'requires' => [],
        ],
        'table_orders' => [
            'label' => 'Tables & QR menu',
            'description' => 'A QR code menu for each table. On Pro, tables order and pay from their phones.',
            'group' => 'Selling',
            'pro' => false,
            'requires' => ['pos', 'products'],
        ],
        'inventory' => [
            'label' => 'Inventory & Suppliers',
            'description' => 'Supplies, recipes, stock levels and suppliers.',
            'group' => 'Stock',
            'pro' => false,
            'requires' => ['products'],
        ],
        'reports' => [
            'label' => 'Reports',
            'description' => 'Sales, stock and team reports.',
            'group' => 'Stock',
            'pro' => false,
            'requires' => [],
        ],
        'branches' => [
            'label' => 'Branches',
            'description' => 'More than one location, with sales and stock per branch.',
            'group' => 'Team & management',
            'pro' => true,
            'requires' => [],
        ],
        'employees' => [
            'label' => 'Employee List',
            'description' => 'Your team, their details and pay rates. Staff see their own schedule and payslips in My Work.',
            'group' => 'Team & management',
            'pro' => true,
            'requires' => [],
        ],
        'scheduling' => [
            'label' => 'Employee Scheduling',
            'description' => 'Weekly shifts, with auto-schedule.',
            'group' => 'Team & management',
            'pro' => true,
            'requires' => ['employees'],
        ],
        'attendance' => [
            'label' => 'Attendance & Timesheets',
            'description' => 'Time clock and timesheets.',
            'group' => 'Team & management',
            'pro' => true,
            'requires' => ['employees'],
        ],
        'payroll' => [
            'label' => 'Salary & Payroll',
            'description' => 'Payroll runs, payslips and SSS, PhilHealth and Pag-IBIG deductions.',
            'group' => 'Team & management',
            'pro' => true,
            'requires' => ['employees'],
        ],
    ];

    /** What a store that never customized has: everything that exists today. */
    public const DEFAULTS = [
        'pos', 'products', 'sales', 'table_orders', 'inventory', 'reports',
        'branches', 'employees', 'scheduling', 'attendance', 'payroll',
    ];

    public static function exists(string $key): bool
    {
        return array_key_exists($key, self::ALL);
    }

    /**
     * $keys plus everything they need, in registry order, unknown keys dropped.
     *
     * @param  iterable<string>  $keys
     * @return list<string>
     */
    public static function withRequirements(iterable $keys): array
    {
        $on = [];
        $queue = array_values(array_filter([...$keys], fn ($k) => is_string($k) && self::exists($k)));

        while ($queue !== []) {
            $key = array_shift($queue);
            if (isset($on[$key])) {
                continue;
            }
            $on[$key] = true;
            array_push($queue, ...self::ALL[$key]['requires']);
        }

        return array_values(array_filter(array_keys(self::ALL), fn ($k) => isset($on[$k])));
    }

    /** For the Customize page. */
    public static function catalog(): array
    {
        return collect(self::ALL)->map(fn (array $m, string $key) => ['key' => $key, ...$m])->values()->all();
    }
}
