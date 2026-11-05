import { Badge, PageTabs, Tone } from '@/Components/ui';

export { Card, EmptyState, Field, inputClass, peso } from '@/Pages/Workforce/Partials/shared';
export type { FieldErrors } from '@/Pages/Workforce/Partials/shared';

/** 2.5 → "2.5", 1000 → "1,000", 0.125 → "0.125" */
export function qty(n: number | null | undefined): string {
    if (n === null || n === undefined) {
        return '—';
    }

    return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

/** Unit costs can be fractions of a centavo (₱0.035/g). */
export function unitCost(cents: number): string {
    return `₱${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export const MOVEMENT_LABELS: Record<string, string> = {
    purchase: 'Received',
    sale: 'Sold (POS)',
    adjustment: 'Count',
    waste: 'Waste / spoilage',
    usage: 'In-store use',
    return: 'Returned to supplier',
};

export function StockStatus({ status }: { status: string }) {
    const styles: Record<string, [Tone, string]> = {
        ok: ['green', 'In stock'],
        low: ['amber', 'Low'],
        out: ['red', 'Out'],
        inactive: ['gray', 'Inactive'],
    };
    const [tone, label] = styles[status] ?? styles.ok;

    return <Badge tone={tone}>{label}</Badge>;
}

/** The inventory sub-pages, shown as tabs on each of them. */
export function InventoryNav() {
    return (
        <PageTabs
            tabs={[
                { label: 'Stock items', href: route('inventory.index'), active: route().current('inventory.index') },
                { label: 'Recipes', href: route('inventory.recipes'), active: route().current('inventory.recipes') },
                { label: 'Stock history', href: route('inventory.movements'), active: route().current('inventory.movements') },
                { label: 'Suppliers', href: route('suppliers.index'), active: route().current('suppliers.*') },
            ]}
        />
    );
}
