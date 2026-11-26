import type { ReceiptData, ReceiptSettings } from '@/Components/Receipt';
import { describe, expect, it } from 'vitest';
import { columns, lineWidth, receiptToEscPos, toAscii, wrap } from './escpos';

const settings: ReceiptSettings = {
    name: 'Kape ni Señor',
    address: '123 Rizal Ave, Manila',
    tin: '000-123-456-000',
    contact_number: '0917 000 0000',
    currency: 'PHP',
    tax_rate_bps: 1200,
    prices_include_tax: true,
    discount_rate_bps: 2000,
    service_charge_bps: 0,
    receipt_footer: 'Salamat po!',
    receipt_paper_mm: 58,
    manual_qr_label: null,
} as ReceiptSettings;

const receipt: ReceiptData = {
    reference: 'A-023',
    sold_at: '2026-11-26T09:30:00+08:00',
    cashier: 'Ana',
    items: [
        { name: 'Spanish Latte with an extra long name for wrapping', options: [{ group: 'Size', value: 'Grande', price_cents: 2000 }], quantity: 2, unit_price_cents: 16000, line_total_cents: 32000 },
    ],
    subtotal_cents: 32000,
    discount_type: null,
    discount_id_number: null,
    discount_customer_name: null,
    vat_exempt_cents: 0,
    discount_cents: 0,
    service_charge_cents: 0,
    tax_cents: 3429,
    total_cents: 32000,
    payment_method: 'cash',
    payment_reference: null,
    amount_paid_cents: 50000,
    change_cents: 18000,
};

const DRAWER = [0x1b, 0x70, 0x00, 0x19, 0xfa];

function textLines(bytes: Uint8Array): string[] {
    // Drop ESC/GS command sequences, keep printable text.
    const out: number[] = [];
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b === 0x1b || b === 0x1d) {
            i += bytes[i + 1] === 0x40 ? 1 : bytes[i + 1] === 0x56 ? 3 : bytes[i + 1] === 0x70 ? 4 : 2;
            continue;
        }
        out.push(b);
    }
    return String.fromCharCode(...out).split('\n');
}

function containsSeq(bytes: Uint8Array, seq: number[]): boolean {
    return Array.from(bytes).join(',').includes(seq.join(','));
}

describe('escpos', () => {
    it('makes text printable ASCII', () => {
        expect(toAscii('₱1,250.00 — Señor')).toBe('P1,250.00 - Senor');
        expect(toAscii('日本')).toBe('??');
    });

    it('wraps and right-aligns within the line width', () => {
        expect(wrap('aaaa bbbb cccc', 9)).toEqual(['aaaa bbbb', 'cccc']);
        expect(wrap('x'.repeat(12), 5)).toEqual(['xxxxx', 'xxxxx', 'xx']);
        expect(columns('Total', 'P10.00', 20)).toEqual(['Total         P10.00']);
    });

    it('never prints a line wider than the paper', () => {
        const width = lineWidth(58);
        const lines = textLines(receiptToEscPos(receipt, settings, { cut: true, openDrawer: false }));

        expect(lines.length).toBeGreaterThan(10);
        for (const line of lines) expect(line.length).toBeLessThanOrEqual(width);
        expect(lines.some((l) => l.startsWith('TOTAL') && l.includes('320.00'))).toBe(true);
        expect(lines.some((l) => l.includes('KAPE NI SENOR'))).toBe(true);
    });

    it('only kicks the drawer when asked', () => {
        expect(containsSeq(receiptToEscPos(receipt, settings, { cut: true, openDrawer: true }), DRAWER)).toBe(true);
        expect(containsSeq(receiptToEscPos(receipt, settings, { cut: true, openDrawer: false }), DRAWER)).toBe(false);
    });

    it('uses 48 columns on 80 mm paper', () => {
        const lines = textLines(receiptToEscPos(receipt, { ...settings, receipt_paper_mm: 80 }, { cut: false, openDrawer: false }));
        expect(lines.some((l) => l === '-'.repeat(48))).toBe(true);
    });
});
