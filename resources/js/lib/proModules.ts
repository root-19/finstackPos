import { ICONS } from '@/Components/NavIcons';
import { Permission } from '@/types';

/**
 * The Management modules that FinstackPOS Pro unlocks: one list that both
 * the sidebar (Management section) and the Subscription page's Pro card are
 * built from. Add a module here and it shows up in both places.
 */
export interface ProModule {
    /** Sidebar label. */
    label: string;
    icon: keyof typeof ICONS;
    /** Ziggy route name of the module's index page. */
    route: string;
    /** route().current() pattern that marks the sidebar item active. */
    match: string;
    /** Permission the user needs for the module to appear in the sidebar. */
    permission: Permission;
    /** How the module is described on the Pro plan card. */
    feature: string;
}

export const PRO_MODULES: ProModule[] = [
    {
        label: 'Branches',
        icon: 'store',
        route: 'branches.index',
        match: 'branches.*',
        permission: 'settings.manage',
        feature: 'Branches: run more than one store location',
    },
    {
        label: 'Employee List',
        icon: 'employees',
        route: 'employees.index',
        match: 'employees.*',
        permission: 'employees.manage',
        feature: 'Employee List with staff logins and roles',
    },
    {
        label: 'Employee Scheduling',
        icon: 'schedule',
        route: 'shifts.index',
        match: 'shifts.*',
        permission: 'schedules.manage',
        feature: 'Employee Scheduling and auto-schedule',
    },
    {
        label: 'Attendance & Timesheets',
        icon: 'attendance',
        route: 'attendance.index',
        match: 'attendance.*',
        permission: 'attendance.manage',
        feature: 'Attendance & Timesheets',
    },
    {
        label: 'Salary & Payroll',
        icon: 'payroll',
        route: 'payroll.index',
        match: 'payroll.*',
        permission: 'payroll.manage',
        feature: 'Salary & Payroll with payslips',
    },
    {
        label: 'Deduction Settings',
        icon: 'deductions',
        route: 'deductions.index',
        match: 'deductions.*',
        permission: 'payroll.manage',
        feature: 'Deduction Settings',
    },
];

/**
 * Everything the Pro card lists: the plan-wide perks first, then one line
 * per Management module, then what Pro adds to Reports.
 */
export const PRO_FEATURES: string[] = [
    'Everything in Free',
    'Unlimited products',
    'Scan-to-order: customers order from their table',
    ...PRO_MODULES.map((m) => m.feature),
    'Payroll and schedule reports',
    'Every new Pro feature, included as it ships',
];
