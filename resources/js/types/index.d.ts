/** Owner: full access. Staff: whatever their custom role allows. */
export type UserRole = 'owner' | 'staff';

/** Mirrors App\Enums\Permission. */
export type Permission =
    | 'pos.sell'
    | 'products.manage'
    | 'categories.manage'
    | 'sales.view'
    | 'sales.void'
    | 'inventory.manage'
    | 'staff.manage'
    | 'settings.manage'
    | 'schedules.manage'
    | 'attendance.manage'
    | 'employees.manage'
    | 'payroll.manage';

export interface User {
    id: number;
    merchant_id: number | null;
    role: UserRole;
    role_id: number | null;
    /** The one branch a staff member works at (null: any branch). */
    branch_id?: number | null;
    name: string;
    email: string;
    email_verified_at?: string;
}

/** What the POS needs to price, take payment for, and print a sale offline. */
export interface MerchantSettings {
    id: number;
    name: string;
    address: string | null;
    tin: string | null;
    contact_number: string | null;
    currency: string;
    tax_rate_bps: number;
    prices_include_tax: boolean;
    receipt_footer: string | null;
    receipt_paper_mm: 58 | 80;
    auto_print_receipt: boolean;
    senior_discount_enabled: boolean;
    pwd_discount_enabled: boolean;
    discount_rate_bps: number;
    discount_vat_exempt: boolean;
    service_charge_bps: number;
    manual_qr_enabled: boolean;
    manual_qr_label: string | null;
    manual_qr_image_url: string | null;
    /** PayMongo is on and a key is saved (the key itself never leaves the server). */
    paymongo_enabled?: boolean;
    paymongo_ready: boolean;
    /** Stop selling products whose recipe ingredients have run out (otherwise just warn). */
    inventory_blocks_sales?: boolean;
    /** Pro and turned on: customers order from the tables' QR codes. */
    table_ordering?: boolean;
    /** Open branches, main first. */
    branches?: { id: number; name: string }[];
}

/** UI hints mirroring the server gates; never a substitute for them. */
export type Abilities = Record<Permission, boolean>;

/** Laravel's LengthAwarePaginator as serialized to JSON. */
export interface Paginated<T> {
    data: T[];
    links: { url: string | null; label: string; active: boolean }[];
    current_page: number;
    last_page: number;
    from: number | null;
    to: number | null;
    total: number;
}

export type PageProps<
    T extends Record<string, unknown> = Record<string, unknown>,
> = T & {
    auth: {
        user: User;
        merchant: MerchantSettings | null;
        /** "Owner" or the staff member's custom role name. */
        roleName: string | null;
        /** A FinstackPOS administrator (the /admin area). */
        isAdmin: boolean;
        can: Abilities | null;
        /** Linked to an employee record, so "My work" (clock, payslips) applies. */
        hasEmployeeProfile: boolean;
        /** The store's plan: Pro (active) unlocks Management and unlimited products. */
        subscription: { active: boolean; trial: boolean; until: string | null } | null;
        /** Support chat messages waiting to be read (replies for a store, questions for an admin). */
        supportUnread: number;
    };
    flash: {
        success: string | null;
    };
};
