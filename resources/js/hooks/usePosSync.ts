import { db } from '@/lib/db';
import { syncAll, SyncResult } from '@/lib/sync';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import useOnlineStatus from './useOnlineStatus';

const SYNC_INTERVAL_MS = 60_000;

/**
 * Keeps the local catalog and sales queue in sync with the server: on mount,
 * whenever the device comes back online, and every minute while online.
 */
export default function usePosSync(merchantId: number) {
    const online = useOnlineStatus();
    const [syncing, setSyncing] = useState(false);
    const [lastResult, setLastResult] = useState<SyncResult | null>(null);

    const syncState = useLiveQuery(
        () => db.syncState.get(merchantId),
        [merchantId],
    );

    const pendingCount = useLiveQuery(
        () =>
            db.sales
                .where('[merchant_id+sync_status]')
                .equals([merchantId, 'pending'])
                .count(),
        [merchantId],
        0,
    );

    const rejectedSales = useLiveQuery(
        () =>
            db.sales
                .where('[merchant_id+sync_status]')
                .equals([merchantId, 'rejected'])
                .toArray(),
        [merchantId],
        [],
    );

    const syncNow = useCallback(async () => {
        setSyncing(true);
        try {
            setLastResult(await syncAll(merchantId));
        } finally {
            setSyncing(false);
        }
    }, [merchantId]);

    useEffect(() => {
        if (!online) {
            return;
        }

        void syncNow();
        const timer = window.setInterval(() => void syncNow(), SYNC_INTERVAL_MS);

        return () => window.clearInterval(timer);
    }, [online, syncNow]);

    return {
        online,
        syncing,
        lastResult,
        lastSyncedAt: syncState?.last_catalog_sync ?? null,
        merchant: syncState?.merchant ?? null,
        inventory: syncState?.inventory ?? null,
        pendingCount,
        rejectedSales,
        syncNow,
    };
}
