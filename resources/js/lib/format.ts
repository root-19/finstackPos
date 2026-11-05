import { PaymentMethod } from './db';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
    cash: 'Cash',
    card: 'Card',
    ewallet: 'E-wallet / QR',
    qrph: 'QR Ph (PayMongo)',
};

export const DISCOUNT_LABELS = {
    senior: 'Senior Citizen',
    pwd: 'PWD',
} as const;

export function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** A Date as YYYY-MM-DD in the viewer's local time (for date inputs). */
export function toDateInput(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
