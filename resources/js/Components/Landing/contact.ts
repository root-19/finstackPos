/**
 * Contact links for the landing and legal pages, from .env (build-time):
 * VITE_CONTACT_MESSENGER, VITE_CONTACT_VIBER, VITE_CONTACT_PHONE,
 * VITE_CONTACT_FACEBOOK. Empty or unsafe values are left out, so the page
 * never shows a dead or made-up link.
 */
export interface ContactLink {
    label: string;
    href: string;
    external: boolean;
}

function clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/** Only https: and viber: links are allowed (no javascript:, data:, …). */
function safeUrl(value: string, schemes: string[]): string | null {
    try {
        const url = new URL(value);
        return schemes.includes(url.protocol) ? url.toString() : null;
    } catch {
        return null;
    }
}

/** "+63 917 123 4567" or "tel:+639171234567" → "tel:+639171234567". */
function phoneUrl(value: string): string | null {
    const digits = value.replace(/^tel:/i, '').replace(/[^\d+]/g, '');
    return /^\+?\d{7,15}$/.test(digits) ? `tel:${digits}` : null;
}

export function contactLinks(): ContactLink[] {
    const env = import.meta.env;
    const links: (ContactLink | null)[] = [];

    const messenger = clean(env.VITE_CONTACT_MESSENGER);
    const viber = clean(env.VITE_CONTACT_VIBER);
    const phone = clean(env.VITE_CONTACT_PHONE);
    const facebook = clean(env.VITE_CONTACT_FACEBOOK);

    if (messenger) {
        const href = safeUrl(messenger, ['https:']);
        links.push(href ? { label: 'Messenger', href, external: true } : null);
    }
    if (viber) {
        const href = safeUrl(viber, ['https:', 'viber:']);
        links.push(href ? { label: 'Viber', href, external: href.startsWith('https:') } : null);
    }
    if (phone) {
        const href = phoneUrl(phone);
        links.push(href ? { label: `Call ${phone.replace(/^tel:/i, '')}`, href, external: false } : null);
    }
    if (facebook) {
        const href = safeUrl(facebook, ['https:']);
        links.push(href ? { label: 'Facebook', href, external: true } : null);
    }

    return links.filter((link): link is ContactLink => link !== null);
}
