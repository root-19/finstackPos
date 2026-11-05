import { LocalSaleItem, PosInventory } from './db';

/*
 * Ingredient availability on the POS, worked out offline from the last
 * synced stock levels and recipes. The server deducts the real stock when
 * each sale syncs; this only keeps the cashier from overselling meanwhile.
 */

/** The size id of a cart line ("12|34" → 34), or null without a size. */
export function sizeIdOfLine(line: LocalSaleItem): number | null {
    const [, size] = line.line_id.split('|');

    return size ? Number(size) : null;
}

/** Item id → amount used by one unit of the product in that size. */
export function usageFor(inventory: PosInventory | null, productId: number, sizeId: number | null): Map<number, number> {
    const usage = new Map<number, number>();

    for (const line of inventory?.recipes[productId] ?? []) {
        // Lines without a size apply to every size; a size's own lines add to them.
        if (line.size_id === null || line.size_id === sizeId) {
            usage.set(line.item_id, (usage.get(line.item_id) ?? 0) + line.quantity);
        }
    }

    return usage;
}

/** Item id → amount the whole cart will use. */
export function cartUsage(inventory: PosInventory | null, cart: LocalSaleItem[]): Map<number, number> {
    const total = new Map<number, number>();

    for (const line of cart) {
        usageFor(inventory, line.product_id, sizeIdOfLine(line)).forEach((amount, itemId) => {
            total.set(itemId, (total.get(itemId) ?? 0) + amount * line.quantity);
        });
    }

    return total;
}

/**
 * How many more of a product/size the stock left after the cart can make.
 * Null when it has no recipe (not tracked).
 */
export function canMake(inventory: PosInventory | null, cart: LocalSaleItem[], productId: number, sizeId: number | null): number | null {
    const usage = usageFor(inventory, productId, sizeId);

    if (!inventory || usage.size === 0) {
        return null;
    }

    const used = cartUsage(inventory, cart);
    let count = Infinity;

    usage.forEach((perUnit, itemId) => {
        const onHand = inventory.items[itemId]?.quantity ?? 0;
        // Round away float noise (0.1 + 0.2) before flooring.
        const left = Math.round((onHand - (used.get(itemId) ?? 0)) * 1000) / 1000;
        count = Math.min(count, perUnit > 0 ? Math.floor(left / perUnit + 1e-9) : Infinity);
    });

    return Number.isFinite(count) ? Math.max(count, 0) : null;
}

/** The items that are short for one more unit, e.g. "Espresso beans, 16 oz cup". */
export function shortItems(inventory: PosInventory | null, cart: LocalSaleItem[], productId: number, sizeId: number | null): string[] {
    if (!inventory) {
        return [];
    }

    const used = cartUsage(inventory, cart);
    const short: string[] = [];

    usageFor(inventory, productId, sizeId).forEach((perUnit, itemId) => {
        const item = inventory.items[itemId];
        if ((item?.quantity ?? 0) - (used.get(itemId) ?? 0) < perUnit - 1e-9) {
            short.push(item?.name ?? 'an ingredient');
        }
    });

    return short;
}

/** The stock left after a sale at a branch, so the POS stays accurate offline. */
export function afterSale(inventory: PosInventory, cart: LocalSaleItem[], branchId: number | null): PosInventory {
    const used = cartUsage(inventory, cart);
    const items = { ...inventory.items };
    const less = (value: number, amount: number) => Math.round((value - amount) * 1000) / 1000;

    used.forEach((amount, itemId) => {
        const item = items[itemId];
        if (item) {
            items[itemId] = {
                ...item,
                quantity: less(item.quantity, amount),
                branches:
                    item.branches && branchId !== null
                        ? { ...item.branches, [branchId]: less(item.branches[branchId] ?? 0, amount) }
                        : item.branches,
            };
        }
    });

    return { ...inventory, items };
}

/** The stock as one branch sees it: each item's quantity is that branch's own. */
export function inventoryAt(inventory: PosInventory | null, branchId: number | null): PosInventory | null {
    if (!inventory || branchId === null) {
        return inventory;
    }

    const items: PosInventory['items'] = {};
    for (const [id, item] of Object.entries(inventory.items)) {
        items[id] = item.branches ? { ...item, quantity: item.branches[branchId] ?? 0 } : item;
    }

    return { ...inventory, items };
}
