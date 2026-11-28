import { describe, expect, it } from 'vitest';
import type { LocalSale, LocalShift } from './db';
import { summarize } from './shifts';

const shift: LocalShift = {
    id: 'shift-1',
    merchant_id: 1,
    branch_id: 1,
    terminal: 'reg-a',
    opened_by: 7,
    opened_by_name: 'Ana',
    opened_at: '2026-11-28T08:00:00Z',
    opening_cash_cents: 100000,
    cash_moves: [
        { id: 'a', type: 'in', amount_cents: 5000, reason: 'Coins', at: '2026-11-28T09:00:00Z', user_id: 7 },
        { id: 'b', type: 'out', amount_cents: 12000, reason: 'Ice', at: '2026-11-28T10:00:00Z', user_id: 7 },
    ],
    closed_at: null,
    closed_by: null,
    counted_cash_cents: null,
    sync_status: 'pending',
};

const sale = (over: Partial<LocalSale>): LocalSale =>
    ({
        client_uuid: Math.random().toString(),
        merchant_id: 1,
        user_id: 7,
        items: [],
        payment_method: 'cash',
        subtotal_cents: 0,
        tax_cents: 0,
        total_cents: 0,
        amount_paid_cents: 0,
        change_cents: 0,
        sold_at: '2026-11-28T09:30:00Z',
        shift_id: 'shift-1',
        sync_status: 'pending',
        sync_error: null,
        synced_at: null,
        ...over,
    }) as LocalSale;

describe('summarize', () => {
    it('works out the X-reading and the cash expected in the drawer', () => {
        const s = summarize(shift, [
            sale({ total_cents: 30000 }),
            sale({ total_cents: 20000, payment_method: 'ewallet' }),
            sale({ total_cents: 8000, discount_type: 'senior', discount_cents: 2000 }),
            sale({ total_cents: 99999, shift_id: 'other' }), // another shift
            sale({ total_cents: 50000, sync_status: 'rejected' }), // the server refused it
        ]);

        expect(s.salesCount).toBe(3);
        expect(s.netCents).toBe(58000);
        expect(s.byMethod.cash).toEqual({ count: 2, totalCents: 38000 });
        expect(s.byMethod.ewallet).toEqual({ count: 1, totalCents: 20000 });
        expect(s.discounts).toEqual({ senior: 1, pwd: 0, discountCents: 2000 });
        // 1000 opening + 380 cash sales + 50 in - 120 out
        expect(s.cash.expectedCents).toBe(131000);
    });
});
