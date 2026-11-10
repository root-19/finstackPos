import { MerchantSettings } from '@/types';
import type { DiscountType } from './money';
import { ProductSize, SelectedOption } from '@/types/catalog';
import Dexie, { type EntityTable } from 'dexie';

/*
 * Offline store (IndexedDB via Dexie). Holds the catalog the register sells
 * from and the queue of sales waiting to be uploaded.
 *
 * Never put credentials or tokens in here: anything in IndexedDB is readable
 * by any script on the origin. Auth stays in the HttpOnly session cookie.
 */

export interface LocalCategory {
    id: number;
    merchant_id: number;
    name: string;
}

export interface LocalProduct {
    id: number;
    merchant_id: number;
    category_id: number | null;
    name: string;
    sku: string;
    barcode: string | null;
    image_url: string | null;
    /** The selling price; with sizes, the cheapest size. */
    price_cents: number;
    /** Null when stock is not tracked. */
    stock: number | null;
    is_active: boolean;
    updated_at: string;
    /** When not empty, the cashier picks one and its price is the price. */
    sizes: ProductSize[];
    /** The branches it's sold at; null (or missing on older copies): every branch. */
    branch_ids?: number[] | null;
    /** Each branch's own stock, keyed by branch id; null: one shared count (stock). */
    branch_stock?: Record<string, number> | null;
}

/** ewallet: the store's own QR / e-wallet, confirmed by the cashier. qrph: PayMongo, confirmed by the gateway. */
export type PaymentMethod = 'cash' | 'card' | 'ewallet' | 'qrph';

/** A PWD ID looked up on the DOH registry. */
export type DohCheck = 'found' | 'not_found';

export type SaleSyncStatus = 'pending' | 'synced' | 'rejected';

export interface LocalSaleItem {
    /** Product + chosen options; the same product with other options is another line. */
    line_id: string;
    product_id: number;
    name: string;
    options: SelectedOption[];
    /** The chosen size's price, or the product price without sizes. */
    unit_price_cents: number;
    quantity: number;
}

export interface LocalSale {
    client_uuid: string;
    merchant_id: number;
    user_id: number;
    items: LocalSaleItem[];
    payment_method: PaymentMethod;
    /** E-wallet reference typed by the cashier, or the PayMongo payment id. */
    payment_reference?: string | null;
    subtotal_cents: number;
    discount_type?: DiscountType | null;
    discount_id_number?: string | null;
    discount_customer_name?: string | null;
    /** PWD only: what the cashier saw on the DOH registry (unset: not checked). */
    discount_doh_check?: DohCheck | null;
    /** The table QR-code orders this sale pays for (settled when it syncs). */
    table_order_ids?: number[];
    vat_exempt_cents?: number;
    discount_cents?: number;
    service_charge_cents?: number;
    tax_cents: number;
    total_cents: number;
    amount_paid_cents: number;
    change_cents: number;
    sold_at: string;
    /** Where it was sold (unset on sales queued before branches). */
    branch_id?: number | null;
    sync_status: SaleSyncStatus;
    sync_error: string | null;
    synced_at: string | null;
}

/** Stock of the items used in recipes, and each product's recipe (see lib/inventory). */
export interface PosInventory {
    /** quantity is the store total; branches holds each branch's own (missing on older copies). */
    items: Record<string, { name: string; unit: string; quantity: number; branches?: Record<string, number> }>;
    recipes: Record<string, { item_id: number; size_id: number | null; quantity: number }[]>;
}

/** A Senior / PWD discount as applied to a cart (same shape as the POS's AppliedDiscount). */
export interface CartDiscount {
    type: DiscountType;
    idNumber: string;
    customerName: string;
    dohCheck: DohCheck | null;
}

/**
 * A cart put on hold (an open tab): kept on this device so it works offline,
 * resumed later on the same register. Prices are re-checked on resume.
 */
export interface HeldOrder {
    id: string;
    merchant_id: number;
    /** The register's branch when it was held; only shown there. */
    branch_id: number | null;
    user_id: number;
    /** Who held it, for the list (the device has no staff directory). */
    user_name: string;
    /** Customer name or table, typed by the cashier. */
    label: string;
    items: LocalSaleItem[];
    discount: CartDiscount | null;
    held_at: string;
    updated_at: string;
}

export interface SyncState {
    merchant_id: number;
    /** Server time of the last successful catalog pull. */
    last_catalog_sync: string | null;
    merchant: MerchantSettings;
    /** Missing until the first pull after inventory was added. */
    inventory?: PosInventory;
}

class FinstackDB extends Dexie {
    categories!: EntityTable<LocalCategory, 'id'>;
    products!: EntityTable<LocalProduct, 'id'>;
    sales!: EntityTable<LocalSale, 'client_uuid'>;
    syncState!: EntityTable<SyncState, 'merchant_id'>;
    heldOrders!: EntityTable<HeldOrder, 'id'>;

    constructor() {
        super('finstack-pos');

        this.version(1).stores({
            categories: 'id, merchant_id',
            products: 'id, merchant_id, [merchant_id+barcode], [merchant_id+sku]',
            sales: 'client_uuid, merchant_id, [merchant_id+sync_status], sold_at',
            syncState: 'merchant_id',
        });

        // v2: categories carry option groups and products an image. Forget
        // the last pull so the next sync downloads the catalog in full.
        this.version(2)
            .stores({})
            .upgrade((tx) => tx.table('syncState').clear());

        // v3: options moved from categories onto products. Re-pull again.
        this.version(3)
            .stores({})
            .upgrade((tx) => tx.table('syncState').clear());

        // v4: options became sizes with their own full price. Re-pull again.
        this.version(4)
            .stores({})
            .upgrade((tx) => tx.table('syncState').clear());

        // v5: held carts (open tabs). Nothing to re-pull. branch_id isn't
        // indexed: IndexedDB can't index a null, and a store holds few tabs.
        this.version(5).stores({
            heldOrders: 'id, merchant_id, held_at',
        });
    }
}

export const db = new FinstackDB();
