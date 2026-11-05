import { MerchantSettings, User } from '@/types';
import { useState } from 'react';

/*
 * Which branch this device sells for. Staff tied to a branch always sell
 * there; anyone else picks one per device (remembered on it), defaulting to
 * the main branch. The server applies the same rule to every synced sale.
 */

const storageKey = (merchantId: number) => `finstack-pos-branch:${merchantId}`;

function remembered(merchantId: number): number | null {
    try {
        return Number(window.localStorage.getItem(storageKey(merchantId))) || null;
    } catch {
        return null;
    }
}

export function useDeviceBranch(merchant: Pick<MerchantSettings, 'id' | 'branches'>, user: Pick<User, 'branch_id'>) {
    const branches = merchant.branches ?? [];
    const [chosen, setChosen] = useState<number | null>(() => remembered(merchant.id));
    const assigned = user.branch_id ?? null;
    const branchId = assigned ?? (branches.some((b) => b.id === chosen) ? chosen : (branches[0]?.id ?? null));

    return {
        branchId,
        branch: branches.find((b) => b.id === branchId) ?? null,
        branches,
        /** Tied to a branch: no choice. */
        locked: assigned !== null,
        choose: (id: number) => {
            setChosen(id);
            try {
                window.localStorage.setItem(storageKey(merchant.id), String(id));
            } catch {
                // Still used for this session.
            }
        },
    };
}
