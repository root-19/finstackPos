import { MerchantSettings } from '@/types';
import { isAxiosError } from 'axios';
import { db, LocalCategory, LocalProduct, LocalSale, PosInventory } from './db';

interface CatalogResponse {
    merchant: MerchantSettings;
    categories: Omit<LocalCategory, 'merchant_id'>[];
    products: Omit<LocalProduct, 'merchant_id'>[];
    deleted: { categories: number[]; products: number[] };
    inventory: PosInventory;
    server_time: string;
}

interface SalesResponse {
    synced: string[];
    rejected: { client_uuid: string | null; message: string }[];
}

export type SyncResult =
    | { ok: true }
    | { ok: false; reason: 'offline' | 'unauthenticated' | 'error'; message: string };

const BATCH_SIZE = 50;
const KEEP_SYNCED_SALES_DAYS = 14;

/** Upload queued sales, oldest first, until the queue is empty. */
async function pushSales(merchantId: number): Promise<void> {
    for (;;) {
        const batch = await db.sales
            .where('[merchant_id+sync_status]')
            .equals([merchantId, 'pending'])
            .sortBy('sold_at')
            .then((sales) => sales.slice(0, BATCH_SIZE));

        if (batch.length === 0) {
            return;
        }

        const { data } = await window.axios.post<SalesResponse>(
            route('pos.sync.sales'),
            { sales: batch.map(toPayload) },
        );

        const now = new Date().toISOString();

        await db.transaction('rw', db.sales, async () => {
            for (const id of data.synced) {
                await db.sales.update(id, {
                    sync_status: 'synced',
                    sync_error: null,
                    synced_at: now,
                });
            }

            for (const { client_uuid, message } of data.rejected) {
                if (client_uuid) {
                    await db.sales.update(client_uuid, {
                        sync_status: 'rejected',
                        sync_error: message,
                    });
                }
            }
        });

        // Guard against looping forever on sales the server didn't answer for.
        if (data.synced.length + data.rejected.length < batch.length) {
            throw new Error('The server did not acknowledge every sale.');
        }
    }
}

function toPayload(sale: LocalSale) {
    return {
        client_uuid: sale.client_uuid,
        branch_id: sale.branch_id ?? null,
        sold_at: sale.sold_at,
        payment_method: sale.payment_method,
        payment_reference: sale.payment_reference ?? null,
        amount_paid_cents: sale.amount_paid_cents,
        discount_type: sale.discount_type ?? null,
        discount_id_number: sale.discount_id_number ?? null,
        discount_customer_name: sale.discount_customer_name ?? null,
        discount_doh_check: sale.discount_doh_check ?? null,
        table_order_ids: sale.table_order_ids ?? [],
        items: sale.items.map(
            ({ product_id, quantity, unit_price_cents, options }) => ({
                product_id,
                quantity,
                unit_price_cents,
                // Sales queued before options existed have none.
                options: options ?? [],
            }),
        ),
    };
}

/** Pull catalog changes since the last pull (everything on the first). */
async function pullCatalog(merchantId: number): Promise<void> {
    const state = await db.syncState.get(merchantId);
    const since = state?.last_catalog_sync ?? undefined;

    const { data } = await window.axios.get<CatalogResponse>(
        route('pos.sync.catalog'),
        { params: { since } },
    );

    await db.transaction(
        'rw',
        [db.categories, db.products, db.syncState],
        async () => {
            if (!since) {
                await db.categories.where({ merchant_id: merchantId }).delete();
                await db.products.where({ merchant_id: merchantId }).delete();
            }

            await db.categories.bulkPut(
                data.categories.map((c) => ({ ...c, merchant_id: merchantId })),
            );
            await db.products.bulkPut(
                data.products.map((p) => ({ ...p, merchant_id: merchantId })),
            );
            await db.categories.bulkDelete(data.deleted.categories);
            await db.products.bulkDelete(data.deleted.products);

            await db.syncState.put({
                merchant_id: merchantId,
                last_catalog_sync: data.server_time,
                merchant: data.merchant,
                inventory: data.inventory,
            });
        },
    );
}

/** Drop old, already-uploaded sales so the device doesn't fill up. */
async function pruneSyncedSales(merchantId: number): Promise<void> {
    const cutoff = new Date(
        Date.now() - KEEP_SYNCED_SALES_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    await db.sales
        .where('[merchant_id+sync_status]')
        .equals([merchantId, 'synced'])
        .filter((sale) => sale.sold_at < cutoff)
        .delete();
}

let inFlight: Promise<SyncResult> | null = null;

/**
 * Push queued sales first (so pulled stock already reflects them), then
 * pull the catalog. Concurrent calls share the same run.
 */
export function syncAll(merchantId: number): Promise<SyncResult> {
    if (!inFlight) {
        inFlight = run(merchantId).finally(() => {
            inFlight = null;
        });
    }

    return inFlight;
}

async function run(merchantId: number): Promise<SyncResult> {
    if (!navigator.onLine) {
        return { ok: false, reason: 'offline', message: 'You are offline.' };
    }

    try {
        await pushSales(merchantId);
        await pullCatalog(merchantId);
        await pruneSyncedSales(merchantId);

        return { ok: true };
    } catch (error) {
        return toFailure(error);
    }
}

function toFailure(error: unknown): SyncResult {
    if (isAxiosError(error)) {
        if (!error.response) {
            return { ok: false, reason: 'offline', message: 'Cannot reach the server.' };
        }

        // 401: session ended, 419: CSRF token expired. Either way, log in again.
        if ([401, 419].includes(error.response.status)) {
            return {
                ok: false,
                reason: 'unauthenticated',
                message: 'Your session has expired. Log in again to sync.',
            };
        }
    }

    return {
        ok: false,
        reason: 'error',
        message: error instanceof Error ? error.message : 'Sync failed.',
    };
}
