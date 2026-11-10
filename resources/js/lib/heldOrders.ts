import type { MerchantSettings } from '@/types';
import type { CartDiscount, HeldOrder, LocalProduct, LocalSaleItem } from './db';
import { computeTotals } from './money';

/*
 * Held carts (open tabs). Pure helpers only, so they can be unit tested
 * without IndexedDB; reading and writing the table is in hooks/useHeldOrders.
 */

export const HELD_LABEL_MAX = 40;

/** What changed in a held cart when it was brought back. */
export type ResumeChange =
    | { kind: 'removed'; name: string; reason: 'unavailable' | 'size' | 'needs_size' }
    | { kind: 'price'; name: string; from_cents: number; to_cents: number }
    | { kind: 'discount_removed'; type: CartDiscount['type'] };

/**
 * A held cart checked against the catalog the register has now. The server
 * only accepts catalog prices, so every line takes today's price; lines that
 * can't be sold here any more are dropped, and so is a discount the store
 * stopped offering. Nothing is changed silently: each change is listed.
 */
export function prepareResume(
    held: Pick<HeldOrder, 'items' | 'discount'>,
    products: LocalProduct[],
    branchId: number | null,
    merchant: Pick<MerchantSettings, 'senior_discount_enabled' | 'pwd_discount_enabled'>,
): { items: LocalSaleItem[]; discount: CartDiscount | null; changes: ResumeChange[] } {
    const byId = new Map(products.map((p) => [p.id, p]));
    const items: LocalSaleItem[] = [];
    const changes: ResumeChange[] = [];

    for (const line of held.items) {
        const product = byId.get(line.product_id);
        const label = lineLabel(line);

        const soldHere = product && product.is_active && (!product.branch_ids || branchId === null || product.branch_ids.includes(branchId));
        if (!product || !soldHere) {
            changes.push({ kind: 'removed', name: label, reason: 'unavailable' });
            continue;
        }

        const sizes = product.sizes ?? [];
        const [, sizeKey] = line.line_id.split('|');
        let price: number;
        let options = line.options;

        if (sizeKey !== undefined) {
            // Matched by id; a renamed size is still the same size.
            const size = sizes.find((s) => s.id === Number(sizeKey));
            if (!size) {
                changes.push({ kind: 'removed', name: label, reason: 'size' });
                continue;
            }
            price = size.price_cents;
            options = [{ group: 'Size', value: size.name, price_cents: size.price_cents }];
        } else if (sizes.length > 0) {
            // Sizes were added since: the cashier has to pick one.
            changes.push({ kind: 'removed', name: label, reason: 'needs_size' });
            continue;
        } else {
            price = product.price_cents;
        }

        if (price !== line.unit_price_cents) {
            changes.push({ kind: 'price', name: label, from_cents: line.unit_price_cents, to_cents: price });
        }

        items.push({ ...line, name: product.name, options, unit_price_cents: price });
    }

    let discount = held.discount;
    if (discount && !(discount.type === 'senior' ? merchant.senior_discount_enabled : merchant.pwd_discount_enabled)) {
        changes.push({ kind: 'discount_removed', type: discount.type });
        discount = null;
    }

    return { items, discount, changes };
}

/** The held cart's total with today's settings (for the list; resuming re-checks prices). */
export function heldTotal(held: Pick<HeldOrder, 'items' | 'discount'>, merchant: MerchantSettings): number {
    const subtotal = held.items.reduce((sum, l) => sum + l.unit_price_cents * l.quantity, 0);

    return computeTotals(subtotal, merchant, held.discount?.type ?? null).total;
}

export function heldUnits(held: Pick<HeldOrder, 'items'>): number {
    return held.items.reduce((sum, l) => sum + l.quantity, 0);
}

/** Held orders of the register's branch, oldest first (the longest-waiting customer on top). */
export function heldAtBranch(orders: HeldOrder[], branchId: number | null): HeldOrder[] {
    return orders.filter((o) => branchId === null || o.branch_id === null || o.branch_id === branchId).sort((a, b) => a.held_at.localeCompare(b.held_at));
}

/** Held on an earlier day than today (in the device's time): worth a second look. */
export function heldBeforeToday(heldAt: string, now: Date = new Date()): boolean {
    const held = new Date(heldAt);

    return new Date(held.getFullYear(), held.getMonth(), held.getDate()) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** "just now", "12 min", "2 h 5 min", or the date when it's from an earlier day. */
export function heldAge(heldAt: string, now: Date = new Date()): string {
    if (heldBeforeToday(heldAt, now)) {
        return new Date(heldAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    const minutes = Math.max(0, Math.floor((now.getTime() - new Date(heldAt).getTime()) / 60_000));
    if (minutes < 1) {
        return 'just now';
    }
    if (minutes < 60) {
        return `${minutes} min`;
    }

    return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}

export function normalizeLabel(label: string): string {
    return label.replace(/\s+/g, ' ').trim().slice(0, HELD_LABEL_MAX);
}

function lineLabel(line: LocalSaleItem): string {
    const size = line.options.map((o) => o.value).join(' · ');

    return size ? `${line.name} (${size})` : line.name;
}
