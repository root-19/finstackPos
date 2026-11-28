import { useLiveQuery } from 'dexie-react-hooks';
import { db, LocalSale, LocalShift } from './db';
import { uuid } from './uuid';

/*
 * Cash shifts on this register. Opening, moving cash and closing all write to
 * IndexedDB first, so they work offline; the whole shift is then uploaded
 * (sync.ts pushes shifts before sales, so each sale finds its shift).
 * The register's figures are worked out here from the sales on this device;
 * the server's report (CashShift::report) also knows voids and cash refunds.
 */

/** The open shift on this register, null when none, undefined while loading. */
export function useOpenShift(merchantId: number, terminal: string): LocalShift | null | undefined {
    return useLiveQuery(
        async () =>
            (await db.shifts.where('[merchant_id+terminal]').equals([merchantId, terminal]).filter((s) => s.closed_at === null).first()) ?? null,
        [merchantId, terminal],
    );
}

export async function openShift(input: {
    merchantId: number;
    branchId: number | null;
    terminal: string;
    user: { id: number; name: string };
    openingCashCents: number;
}): Promise<LocalShift> {
    const shift: LocalShift = {
        id: uuid(),
        merchant_id: input.merchantId,
        branch_id: input.branchId,
        terminal: input.terminal,
        opened_by: input.user.id,
        opened_by_name: input.user.name,
        opened_at: new Date().toISOString(),
        opening_cash_cents: input.openingCashCents,
        cash_moves: [],
        closed_at: null,
        closed_by: null,
        counted_cash_cents: null,
        sync_status: 'pending',
    };
    await db.shifts.add(shift);

    return shift;
}

export async function moveCash(shiftId: string, move: { type: 'in' | 'out'; amountCents: number; reason: string; userId: number }): Promise<void> {
    await db.shifts
        .where({ id: shiftId })
        .modify((s) => {
            s.cash_moves = [
                ...s.cash_moves,
                { id: uuid(), type: move.type, amount_cents: move.amountCents, reason: move.reason.trim(), at: new Date().toISOString(), user_id: move.userId },
            ];
            s.sync_status = 'pending';
        });
}

export async function closeShift(shiftId: string, countedCashCents: number, userId: number): Promise<void> {
    await db.shifts
        .where({ id: shiftId })
        .modify((s) => {
            s.closed_at = new Date().toISOString();
            s.closed_by = userId;
            s.counted_cash_cents = countedCashCents;
            s.sync_status = 'pending';
        });
}

export type ShiftSummary = {
    salesCount: number;
    netCents: number;
    byMethod: Record<string, { count: number; totalCents: number }>;
    discounts: { senior: number; pwd: number; discountCents: number };
    cash: { openingCents: number; salesCents: number; inCents: number; outCents: number; expectedCents: number };
};

/** The register's own X-reading of a shift, from the sales rung up in it on this device. */
export function summarize(shift: LocalShift, sales: LocalSale[]): ShiftSummary {
    const own = sales.filter((s) => s.shift_id === shift.id && s.sync_status !== 'rejected');
    const byMethod: ShiftSummary['byMethod'] = {};
    for (const s of own) {
        const row = (byMethod[s.payment_method] ??= { count: 0, totalCents: 0 });
        row.count += 1;
        row.totalCents += s.total_cents;
    }
    const inCents = shift.cash_moves.filter((m) => m.type === 'in').reduce((a, m) => a + m.amount_cents, 0);
    const outCents = shift.cash_moves.filter((m) => m.type === 'out').reduce((a, m) => a + m.amount_cents, 0);
    const salesCents = byMethod.cash?.totalCents ?? 0;

    return {
        salesCount: own.length,
        netCents: own.reduce((a, s) => a + s.total_cents, 0),
        byMethod,
        discounts: {
            senior: own.filter((s) => s.discount_type === 'senior').length,
            pwd: own.filter((s) => s.discount_type === 'pwd').length,
            discountCents: own.reduce((a, s) => a + (s.discount_cents ?? 0), 0),
        },
        cash: {
            openingCents: shift.opening_cash_cents,
            salesCents,
            inCents,
            outCents,
            expectedCents: shift.opening_cash_cents + salesCents + inCents - outCents,
        },
    };
}

/** The sales of a shift on this device (for the X-reading). */
export function useShiftSales(merchantId: number, shiftId: string | null | undefined): LocalSale[] {
    return (
        useLiveQuery(
            (): Promise<LocalSale[]> => (shiftId ? db.sales.where({ merchant_id: merchantId }).filter((s) => s.shift_id === shiftId).toArray() : Promise.resolve([])),
            [merchantId, shiftId],
        ) ?? []
    );
}

/** What the server says about a closed shift (voids and cash refunds included). */
export type ServerShiftReport = {
    sales_count: number;
    net_cents: number;
    voids: { count: number; total_cents: number };
    cash: {
        opening_cents: number;
        sales_cents: number;
        in_cents: number;
        out_cents: number;
        refunds_cents: number;
        expected_cents: number;
        counted_cents: number | null;
        difference_cents: number | null;
    };
};

export async function fetchServerReport(shiftId: string): Promise<ServerShiftReport | null> {
    try {
        const { data } = await window.axios.get<{ report: ServerShiftReport }>(route('pos.shifts.report', { uuid: shiftId }));
        return data.report;
    } catch {
        return null;
    }
}
