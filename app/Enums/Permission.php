<?php

namespace App\Enums;

/**
 * What a staff role may open, named after the sidebar pages. The owner can
 * always do everything. Each case is also a Gate ability (see
 * AppServiceProvider).
 */
enum Permission: string
{
    case PosSell = 'pos.sell';
    case ProductsManage = 'products.manage';
    case CategoriesManage = 'categories.manage';
    case SalesView = 'sales.view';
    case InventoryManage = 'inventory.manage';
    case SchedulesManage = 'schedules.manage';
    case AttendanceManage = 'attendance.manage';

    // Owner only: never assignable, so no staff member can raise their own
    // access, see the store's payment keys, or see salaries and government IDs.
    case StaffManage = 'staff.manage';
    case SettingsManage = 'settings.manage';
    case EmployeesManage = 'employees.manage';
    case PayrollManage = 'payroll.manage';

    /**
     * In sidebar order.
     *
     * @return list<self>
     */
    public static function assignable(): array
    {
        return [
            self::PosSell, self::ProductsManage, self::CategoriesManage, self::SalesView, self::InventoryManage,
            self::SchedulesManage, self::AttendanceManage,
        ];
    }

    /** The sidebar page this permission opens. */
    public function label(): string
    {
        return match ($this) {
            self::PosSell => 'Point of Sale',
            self::ProductsManage => 'Products',
            self::CategoriesManage => 'Categories',
            self::SalesView => 'Sales',
            self::InventoryManage => 'Inventory',
            self::SchedulesManage => 'Employee Scheduling',
            self::AttendanceManage => 'Attendance & Timesheets',
            self::StaffManage => 'Staff',
            self::SettingsManage => 'Settings',
            self::EmployeesManage => 'Employee List',
            self::PayrollManage => 'Salary & Payroll',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::PosSell => 'Ring up sales, take payments, and give Senior / PWD discounts.',
            self::ProductsManage => 'Add and edit products, sizes, prices, and stock.',
            self::CategoriesManage => 'Add, rename, and delete categories.',
            self::SalesView => 'See all sales and reprint receipts.',
            self::InventoryManage => 'Track supplies and ingredients, receive stock, record counts and waste, and set recipes.',
            self::SchedulesManage => 'Create, publish, and cancel shifts for the team.',
            self::AttendanceManage => 'Record, correct, and approve attendance and timesheets.',
            default => 'Owner only.',
        };
    }
}
