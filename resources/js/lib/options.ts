import { ProductSize } from '@/types/catalog';
import { formatMoney } from './money';

/**
 * "₱65.00" for a single-price product, "₱65.00 – ₱95.00" when it has sizes
 * (each size has its own full price).
 */
export function formatPriceRange(
    priceCents: number,
    sizes: ProductSize[],
    currency: string,
): string {
    if (sizes.length === 0) {
        return formatMoney(priceCents, currency);
    }

    const prices = sizes.map((s) => s.price_cents);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    return min === max
        ? formatMoney(min, currency)
        : `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`;
}
