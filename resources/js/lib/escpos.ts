import type { ReceiptData, ReceiptSettings } from '@/Components/Receipt';
import { DISCOUNT_LABELS, PAYMENT_LABELS } from '@/lib/format';
import { formatMoney, formatPercent } from '@/lib/money';

/*
 * Turns a receipt into ESC/POS bytes for thermal printers, so the desktop
 * app can print without the browser's print dialog. Mirrors the layout of
 * <Receipt> (Components/Receipt.tsx); keep the two in step.
 *
 * Text is plain ASCII: printers default to code page 437, which has no
 * peso sign, so "₱" prints as "P" and accents are dropped.
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
    init: [ESC, 0x40],
    left: [ESC, 0x61, 0],
    center: [ESC, 0x61, 1],
    boldOn: [ESC, 0x45, 1],
    boldOff: [ESC, 0x45, 0],
    /** Double width + height. */
    bigOn: [GS, 0x21, 0x11],
    bigOff: [GS, 0x21, 0x00],
    /** Feed 3 lines then partial cut. */
    cut: [GS, 0x56, 0x42, 0x03],
    /** Pulse drawer pin 2 (most cash drawers). */
    drawer: [ESC, 0x70, 0x00, 0x19, 0xfa],
};

/** Characters per line in the printer's default font. */
export function lineWidth(paperMm: number): number {
    return paperMm === 58 ? 32 : 48;
}

export function toAscii(text: string): string {
    return text
        .replace(/₱/g, 'P')
        .replace(/[–—]/g, '-')
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[  ]/g, ' ')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\x20-\x7e\n]/g, '?');
}

/** Word-wrap to `width`, breaking words that are longer than a line. */
export function wrap(text: string, width: number): string[] {
    const lines: string[] = [];

    for (const paragraph of text.split('\n')) {
        let line = '';

        for (let word of paragraph.split(/\s+/).filter(Boolean)) {
            while (word.length > width) {
                if (line) {
                    lines.push(line);
                    line = '';
                }
                lines.push(word.slice(0, width));
                word = word.slice(width);
            }
            if (!line) {
                line = word;
            } else if (line.length + 1 + word.length <= width) {
                line += ' ' + word;
            } else {
                lines.push(line);
                line = word;
            }
        }
        lines.push(line);
    }

    return lines;
}

/** Left text and right-aligned text on one line (left wraps if needed). */
export function columns(left: string, right: string, width: number): string[] {
    if (right.length >= width - 1) {
        return [...wrap(left, width), right.padStart(width)];
    }

    const lines = wrap(left, width - right.length - 1);
    const last = lines.pop() ?? '';

    return [...lines, last.padEnd(width - right.length) + right];
}

class Builder {
    bytes: number[] = [];

    constructor(readonly width: number) {
        this.raw(CMD.init);
    }

    raw(cmd: number[]) {
        this.bytes.push(...cmd);
    }

    line(text = '') {
        for (const ch of toAscii(text)) {
            this.bytes.push(ch.charCodeAt(0));
        }
        this.bytes.push(LF);
    }

    lines(lines: string[]) {
        lines.forEach((l) => this.line(l));
    }

    pair(left: string, right: string) {
        this.lines(columns(toAscii(left), toAscii(right), this.width));
    }

    centered(text: string) {
        this.raw(CMD.center);
        this.lines(wrap(toAscii(text), this.width));
        this.raw(CMD.left);
    }

    divider() {
        this.line('-'.repeat(this.width));
    }

    finish({ cut, openDrawer }: { cut: boolean; openDrawer: boolean }): Uint8Array {
        if (cut) {
            this.raw(CMD.cut);
        } else {
            this.line();
            this.line();
            this.line();
        }
        if (openDrawer) {
            this.raw(CMD.drawer);
        }

        return Uint8Array.from(this.bytes);
    }
}

export type EscPosOptions = { cut: boolean; openDrawer: boolean };

export function receiptToEscPos(data: ReceiptData, settings: ReceiptSettings, options: EscPosOptions): Uint8Array {
    const b = new Builder(lineWidth(settings.receipt_paper_mm));
    const money = (cents: number) => formatMoney(cents, settings.currency);
    const soldAt = new Date(data.sold_at);
    const paymentLabel =
        data.payment_method === 'ewallet' && settings.manual_qr_label
            ? settings.manual_qr_label
            : PAYMENT_LABELS[data.payment_method];

    b.raw(CMD.boldOn);
    b.centered(settings.name.toUpperCase());
    b.raw(CMD.boldOff);
    if (settings.address) b.centered(settings.address);
    if (settings.tin) b.centered(`TIN: ${settings.tin}`);
    if (settings.contact_number) b.centered(`Tel: ${settings.contact_number}`);

    b.divider();
    b.pair(`Ref: ${data.reference}`, soldAt.toLocaleDateString());
    b.pair(data.cashier ? `Cashier: ${data.cashier}` : '', soldAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    b.divider();

    for (const item of data.items) {
        const options = item.options && item.options.length > 0 ? ` (${item.options.map((o) => o.value).join(', ')})` : '';
        b.raw(CMD.boldOn);
        b.lines(wrap(toAscii(item.name + options), b.width));
        b.raw(CMD.boldOff);
        b.pair(`  ${item.quantity} x ${money(item.unit_price_cents)}`, money(item.line_total_cents));
    }

    b.divider();
    b.pair('Subtotal', money(data.subtotal_cents));
    if (data.vat_exempt_cents > 0) {
        b.pair(`Less VAT (${formatPercent(settings.tax_rate_bps)})`, `-${money(data.vat_exempt_cents)}`);
    }
    if (data.discount_type && data.discount_cents > 0) {
        b.pair(`Less ${DISCOUNT_LABELS[data.discount_type]} (${formatPercent(settings.discount_rate_bps)})`, `-${money(data.discount_cents)}`);
    }
    if (data.service_charge_cents > 0) {
        b.pair(`Service charge (${formatPercent(settings.service_charge_bps)})`, money(data.service_charge_cents));
    }
    if (data.tax_cents > 0 && !settings.prices_include_tax) {
        b.pair(`VAT (${formatPercent(settings.tax_rate_bps)})`, money(data.tax_cents));
    }

    b.divider();
    b.raw(CMD.boldOn);
    b.pair('TOTAL', money(data.total_cents));
    b.raw(CMD.boldOff);
    b.divider();

    b.pair(paymentLabel, money(data.amount_paid_cents));
    if (data.change_cents > 0) b.pair('Change', money(data.change_cents));
    if (data.payment_reference) b.pair('Ref no.', data.payment_reference);

    if (data.vat_exempt_cents > 0 || data.discount_type) {
        b.divider();
        b.pair('VAT-exempt sale', money(data.subtotal_cents - data.vat_exempt_cents));
    } else if (data.tax_cents > 0) {
        b.divider();
        b.pair('VATable sale', money(data.total_cents - data.service_charge_cents - data.tax_cents));
        b.pair(`VAT (${formatPercent(settings.tax_rate_bps)})`, money(data.tax_cents));
    }

    if (data.discount_type) {
        b.divider();
        b.lines(wrap(toAscii(`${DISCOUNT_LABELS[data.discount_type]} ID: ${data.discount_id_number ?? ''}`), b.width));
        b.lines(wrap(toAscii(`Name: ${data.discount_customer_name ?? ''}`), b.width));
        b.line();
        b.line('Signature: ____________________'.slice(0, b.width));
    }

    if (settings.receipt_footer) {
        b.divider();
        b.centered(settings.receipt_footer);
    }

    b.line();
    b.centered('Powered by FinstackPOS');

    return b.finish(options);
}

/** A short page to check the printer, paper width and cutter. */
export function testPageEscPos(paperMm: number, options: EscPosOptions): Uint8Array {
    const b = new Builder(lineWidth(paperMm));

    b.raw(CMD.boldOn);
    b.raw(CMD.bigOn);
    b.centered('TEST PRINT');
    b.raw(CMD.bigOff);
    b.raw(CMD.boldOff);
    b.centered('FinstackPOS desktop');
    b.divider();
    b.pair('Paper', `${paperMm} mm`);
    b.pair('Characters per line', String(b.width));
    b.pair('Printed', new Date().toLocaleString());
    b.divider();
    b.line('0123456789'.repeat(5).slice(0, b.width));

    return b.finish(options);
}

/** Just the drawer pulse, for the "Open drawer" button. */
export function drawerKickEscPos(): Uint8Array {
    return Uint8Array.from([...CMD.init, ...CMD.drawer]);
}
