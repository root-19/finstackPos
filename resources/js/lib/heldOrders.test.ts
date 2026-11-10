import type { MerchantSettings } from '@/types';
import { describe, expect, it } from 'vitest';
import type { CartDiscount, HeldOrder, LocalProduct, LocalSaleItem } from './db';
import { heldAge, heldAtBranch, heldBeforeToday, heldTotal, normalizeLabel, prepareResume } from './heldOrders';

const product = (over: Partial<LocalProduct> = {}): LocalProduct => ({
    id: 1,
    merchant_id: 1,
    category_id: null,
    name: 'Iced Coffee',
    sku: 'IC',
    barcode: null,
    image_url: null,
    price_cents: 10000,
    stock: null,
    is_active: true,
    updated_at: '2026-11-01T00:00:00Z',
    sizes: [],
    branch_ids: null,
    ...over,
});

const line = (over: Partial<LocalSaleItem> = {}): LocalSaleItem => ({
    line_id: '1',
    product_id: 1,
    name: 'Iced Coffee',
    options: [],
    unit_price_cents: 10000,
    quantity: 2,
    ...over,
});

const merchant = {
    senior_discount_enabled: true,
    pwd_discount_enabled: true,
    tax_rate_bps: 1200,
    prices_include_tax: true,
    discount_rate_bps: 2000,
    discount_vat_exempt: true,
    service_charge_bps: 0,
} as MerchantSettings;

const senior: CartDiscount = { type: 'senior', idNumber: 'SC-1', customerName: 'Lola', dohCheck: null };

describe('prepareResume', () => {
    it('keeps an unchanged cart as it was', () => {
        const result = prepareResume({ items: [line()], discount: senior }, [product()], null, merchant);

        expect(result.items).toEqual([line()]);
        expect(result.discount).toEqual(senior);
        expect(result.changes).toEqual([]);
    });

    it('takes the current catalog price and says so', () => {
        const result = prepareResume({ items: [line()], discount: null }, [product({ price_cents: 12000 })], null, merchant);

        expect(result.items[0].unit_price_cents).toBe(12000);
        expect(result.changes).toEqual([{ kind: 'price', name: 'Iced Coffee', from_cents: 10000, to_cents: 12000 }]);
    });

    it('reprices a size by its id and picks up a renamed size', () => {
        const held = line({ line_id: '1|7', options: [{ group: 'Size', value: 'Large', price_cents: 15000 }], unit_price_cents: 15000 });
        const result = prepareResume({ items: [held], discount: null }, [product({ sizes: [{ id: 7, name: 'Grande', price_cents: 16000 }] })], null, merchant);

        expect(result.items[0]).toMatchObject({ unit_price_cents: 16000, options: [{ group: 'Size', value: 'Grande', price_cents: 16000 }] });
        expect(result.changes).toHaveLength(1);
    });

    it('drops deleted, inactive and other-branch products', () => {
        const items = [line(), line({ line_id: '2', product_id: 2, name: 'Tea' }), line({ line_id: '3', product_id: 3, name: 'Cake' })];
        const products = [product({ is_active: false }), product({ id: 3, name: 'Cake', branch_ids: [9] })];

        const result = prepareResume({ items, discount: null }, products, 5, merchant);

        expect(result.items).toEqual([]);
        expect(result.changes.map((c) => c.kind === 'removed' && c.reason)).toEqual(['unavailable', 'unavailable', 'unavailable']);
    });

    it('drops a line whose size is gone, or that now needs a size', () => {
        const sized = line({ line_id: '1|7', options: [{ group: 'Size', value: 'Large', price_cents: 15000 }] });
        const gone = prepareResume({ items: [sized], discount: null }, [product({ sizes: [{ id: 8, name: 'Small', price_cents: 9000 }] })], null, merchant);
        const needs = prepareResume({ items: [line()], discount: null }, [product({ sizes: [{ id: 8, name: 'Small', price_cents: 9000 }] })], null, merchant);

        expect(gone.changes).toEqual([{ kind: 'removed', name: 'Iced Coffee (Large)', reason: 'size' }]);
        expect(needs.changes).toEqual([{ kind: 'removed', name: 'Iced Coffee', reason: 'needs_size' }]);
    });

    it('drops a discount the store no longer offers', () => {
        const result = prepareResume({ items: [line()], discount: senior }, [product()], null, { ...merchant, senior_discount_enabled: false });

        expect(result.discount).toBeNull();
        expect(result.changes).toEqual([{ kind: 'discount_removed', type: 'senior' }]);
    });
});

describe('held order list', () => {
    const held = (id: string, branch: number | null, at: string) => ({ id, branch_id: branch, held_at: at }) as HeldOrder;

    it('shows the branch’s own orders, oldest first', () => {
        const list = heldAtBranch([held('b', 1, '2026-11-09T03:00:00Z'), held('x', 2, '2026-11-09T01:00:00Z'), held('a', 1, '2026-11-09T02:00:00Z')], 1);

        expect(list.map((o) => o.id)).toEqual(['a', 'b']);
    });

    it('totals with the senior discount (VAT exempt, then 20%)', () => {
        // 2 × ₱100 VAT-inclusive: ₱178.57 base, less 20% = ₱142.86.
        expect(heldTotal({ items: [line()], discount: senior }, merchant)).toBe(14286);
        expect(heldTotal({ items: [line()], discount: null }, merchant)).toBe(20000);
    });

    it('describes the age and flags earlier days', () => {
        const now = new Date(2026, 10, 9, 15, 0);

        expect(heldAge(new Date(2026, 10, 9, 14, 48).toISOString(), now)).toBe('12 min');
        expect(heldAge(new Date(2026, 10, 9, 12, 55).toISOString(), now)).toBe('2 h 5 min');
        expect(heldBeforeToday(new Date(2026, 10, 8, 23, 59).toISOString(), now)).toBe(true);
        expect(heldBeforeToday(new Date(2026, 10, 9, 0, 1).toISOString(), now)).toBe(false);
    });

    it('cleans up labels', () => {
        expect(normalizeLabel('  Table   4 ')).toBe('Table 4');
        expect(normalizeLabel('x'.repeat(60))).toHaveLength(40);
    });
});
