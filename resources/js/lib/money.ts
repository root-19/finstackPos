import { MerchantSettings } from '@/types';

// All amounts are integer cents to avoid floating point drift.

export function formatMoney(cents: number, currency: string): string {
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
    }).format(cents / 100);
}

/** Parse user input like "1,250.50" into cents; null when not a number. */
export function parseMoney(input: string): number | null {
    const value = Number(input.replace(/,/g, '').trim());

    return input.trim() !== '' && Number.isFinite(value) && value >= 0
        ? Math.round(value * 100)
        : null;
}

export type DiscountType = 'senior' | 'pwd';

export interface Totals {
    /** VAT removed because of a VAT-exempt senior/PWD discount. */
    vatExempt: number;
    discount: number;
    serviceCharge: number;
    tax: number;
    total: number;
}

type PricingSettings = Pick<
    MerchantSettings,
    | 'tax_rate_bps'
    | 'prices_include_tax'
    | 'discount_rate_bps'
    | 'discount_vat_exempt'
    | 'service_charge_bps'
>;

/**
 * Price a sale from its line subtotal. Mirrors Merchant::computeTotals() on
 * the server, which recomputes every synced sale, so keep the two in sync.
 *
 * A senior/PWD discount (VAT-exempt by default, as in the Philippines)
 * first removes VAT, then takes the discount off the VAT-exclusive amount.
 * Service charge is a percentage of the discounted amount.
 */
export function computeTotals(
    subtotalCents: number,
    settings: PricingSettings,
    discountType: DiscountType | null = null,
): Totals {
    const bps = settings.tax_rate_bps;
    const discountBps = settings.discount_rate_bps ?? 0;
    const vatExemptDiscount = settings.discount_vat_exempt ?? false;
    let vatExempt = 0;
    let discount = 0;
    let tax = 0;
    let goods: number;
    let goodsTotal: number;

    if (discountType !== null && vatExemptDiscount) {
        const base = settings.prices_include_tax
            ? Math.round((subtotalCents * 10000) / (10000 + bps))
            : subtotalCents;
        vatExempt = subtotalCents - base;
        discount = Math.round((base * discountBps) / 10000);
        goods = base - discount;
        goodsTotal = goods;
    } else {
        if (discountType !== null) {
            discount = Math.round((subtotalCents * discountBps) / 10000);
        }
        goods = subtotalCents - discount;

        if (settings.prices_include_tax) {
            tax = goods - Math.round((goods * 10000) / (10000 + bps));
            goodsTotal = goods;
        } else {
            tax = Math.round((goods * bps) / 10000);
            goodsTotal = goods + tax;
        }
    }

    const serviceCharge = Math.round((goods * (settings.service_charge_bps ?? 0)) / 10000);

    return { vatExempt, discount, serviceCharge, tax, total: goodsTotal + serviceCharge };
}

export function formatPercent(bps: number): string {
    return `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}
