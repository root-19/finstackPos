import { CartDiscount, db, HeldOrder, LocalSaleItem } from '@/lib/db';
import { heldAtBranch, normalizeLabel } from '@/lib/heldOrders';
import { uuid } from '@/lib/uuid';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback } from 'react';

/**
 * The register's held carts (open tabs), kept in IndexedDB so they survive a
 * reload and work offline. Only the register's own branch's are listed.
 */
export default function useHeldOrders(merchantId: number, branchId: number | null, user: { id: number; name: string }) {
    const all = useLiveQuery(() => db.heldOrders.where({ merchant_id: merchantId }).toArray(), [merchantId], []);
    const orders = heldAtBranch(all, branchId);

    /** Save a cart; with an id (a resumed order held again) it keeps its place in the list. */
    const hold = useCallback(
        async (cart: { label: string; items: LocalSaleItem[]; discount: CartDiscount | null }, id?: string, heldAt?: string) => {
            const now = new Date().toISOString();
            const order: HeldOrder = {
                id: id ?? uuid(),
                merchant_id: merchantId,
                branch_id: branchId,
                user_id: user.id,
                user_name: user.name,
                label: normalizeLabel(cart.label),
                items: cart.items,
                discount: cart.discount,
                held_at: heldAt ?? now,
                updated_at: now,
            };
            await db.heldOrders.put(order);

            return order;
        },
        [merchantId, branchId, user.id, user.name],
    );

    /** Take an order off hold: it becomes the cart, so it leaves the list. */
    const take = useCallback(async (id: string) => {
        return db.transaction('rw', db.heldOrders, async () => {
            const order = await db.heldOrders.get(id);
            if (order) {
                await db.heldOrders.delete(id);
            }

            return order ?? null;
        });
    }, []);

    const rename = useCallback(async (id: string, label: string) => {
        await db.heldOrders.update(id, { label: normalizeLabel(label), updated_at: new Date().toISOString() });
    }, []);

    const discard = useCallback(async (id: string) => {
        await db.heldOrders.delete(id);
    }, []);

    return { orders, hold, take, rename, discard };
}
