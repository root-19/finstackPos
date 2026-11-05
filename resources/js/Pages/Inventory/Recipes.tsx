import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { Alert, DialogLayout, Segmented } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { ProductSize } from '@/types/catalog';
import { Head, Link, useForm } from '@inertiajs/react';
import { FormEventHandler, useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, FieldErrors, InventoryNav, peso, qty, unitCost } from './Partials/shared';

type Line = { item_id: number; size_id: number | null; quantity: number };

type Product = {
    id: number;
    name: string;
    category: string | null;
    image_url: string | null;
    price_cents: number;
    is_active: boolean;
    sizes: ProductSize[];
    lines: Line[];
    available: { product: number | null; sizes: Record<string, number> } | null;
};

type StockItem = { id: number; name: string; unit: string; quantity: number; unit_cost_cents: number; category: string | null };

type Props = { products: Product[]; items: StockItem[] };

/** Recipe cost of one unit of a size (or the product without sizes), in cents. */
function costOf(lines: Line[], items: StockItem[], sizeId: number | null): number {
    return Math.round(
        lines
            .filter((l) => l.size_id === null || l.size_id === sizeId)
            .reduce((sum, l) => sum + l.quantity * (items.find((i) => i.id === l.item_id)?.unit_cost_cents ?? 0), 0),
    );
}

export default function Recipes({ products, items }: PageProps<Props>) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'with' | 'without'>('all');
    const [editing, setEditing] = useState<Product | null>(null);

    const shown = useMemo(() => {
        const term = search.trim().toLowerCase();

        return products.filter(
            (p) =>
                (term === '' || p.name.toLowerCase().includes(term) || p.category?.toLowerCase().includes(term)) &&
                (filter === 'all' || (filter === 'with') === p.lines.length > 0),
        );
    }, [products, search, filter]);

    const withRecipe = products.filter((p) => p.lines.length > 0).length;

    return (
        <AuthenticatedLayout
            header={<PageHeader title="Inventory" subtitle="What each product uses from stock, its cost, and how many you can still make" />}
        >
            <Head title="Recipes" />

            <div className="app-page">
                <InventoryNav />

                <Card className="flex gap-3 p-4 text-sm text-gray-600 sm:px-5">
                    <span className="mt-0.5 text-gray-400">
                        <Icon name="info" />
                    </span>
                    <div className="min-w-0">
                        <p>
                            <strong className="font-semibold text-gray-950">How it works:</strong> list the items one product uses (e.g. an Iced Latte
                            uses 18 g espresso beans, 200 mL milk, 1 cup, 1 lid). Every sale on the POS deducts them from stock automatically, per
                            size. Items for <em>every size</em> are shared; a size can add its own (a Large uses a 22 oz cup).
                        </p>
                        <p className="mt-1.5 text-gray-500">
                            {withRecipe} of {products.length} products have a recipe.
                        </p>
                    </div>
                </Card>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="relative w-full sm:max-w-xs">
                        <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-gray-400">
                            <Icon name="search" />
                        </span>
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search products"
                            aria-label="Search products"
                            className="input ps-9"
                        />
                    </div>
                    <div className="overflow-x-auto">
                        <Segmented
                            label="Recipe filter"
                            value={filter}
                            onChange={setFilter}
                            options={[
                                { value: 'all', label: 'All' },
                                { value: 'with', label: 'With recipe' },
                                { value: 'without', label: 'No recipe yet' },
                            ]}
                        />
                    </div>
                </div>

                {items.length === 0 && (
                    <Alert tone="amber">
                        Add your ingredients and materials under{' '}
                        <Link href={route('inventory.index')} className="font-semibold underline">
                            Stock items
                        </Link>{' '}
                        first.
                    </Alert>
                )}

                {shown.length === 0 ? (
                    <Card>
                        <EmptyState title="No products here" icon={<Icon name="products" className="h-5 w-5" />}>
                            Products are added under Products.
                        </EmptyState>
                    </Card>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {shown.map((p) => {
                            const variants: { id: number | null; name: string; price: number }[] = p.sizes.length
                                ? p.sizes.map((s) => ({ id: s.id, name: s.name, price: s.price_cents }))
                                : [{ id: null, name: '', price: p.price_cents }];

                            return (
                                <Card key={p.id} className={`flex flex-col p-4 sm:p-5 ${p.is_active ? '' : 'opacity-70'}`}>
                                    <div className="flex items-start gap-3">
                                        {p.image_url ? (
                                            <img src={p.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                                        ) : (
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm font-semibold text-gray-500">
                                                {p.name[0]}
                                            </span>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <h3 className="truncate text-sm font-semibold text-gray-950">{p.name}</h3>
                                            <p className="text-xs text-gray-500">{p.category ?? 'No category'}</p>
                                        </div>
                                    </div>

                                    {p.lines.length === 0 ? (
                                        <p className="mt-4 flex-1 text-sm text-gray-500">No recipe: selling it doesn’t change inventory.</p>
                                    ) : (
                                        <table className="mt-4 w-full flex-1 text-sm">
                                            <thead className="text-left text-xs text-gray-500">
                                                <tr>
                                                    <th className="pb-1.5 font-medium">{p.sizes.length ? 'Size' : ''}</th>
                                                    <th className="pb-1.5 text-right font-medium">Cost</th>
                                                    <th className="pb-1.5 text-right font-medium">Margin</th>
                                                    <th className="pb-1.5 text-right font-medium">Can make</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {variants.map((v) => {
                                                    const cost = costOf(p.lines, items, v.id);
                                                    const margin = v.price > 0 ? Math.round(((v.price - cost) / v.price) * 100) : null;
                                                    const can = v.id === null ? p.available?.product : p.available?.sizes[v.id];

                                                    return (
                                                        <tr key={v.id ?? 'base'} className="border-t border-gray-100">
                                                            <td className="py-1.5 capitalize text-gray-700">{v.name || 'Each'}</td>
                                                            <td className="py-1.5 text-right tabular-nums text-gray-700">{peso(cost)}</td>
                                                            <td
                                                                className={`py-1.5 text-right tabular-nums ${margin !== null && margin < 30 ? 'font-medium text-amber-700' : 'text-gray-700'}`}
                                                            >
                                                                {margin !== null ? `${margin}%` : '—'}
                                                            </td>
                                                            <td
                                                                className={`py-1.5 text-right font-semibold tabular-nums ${can === 0 ? 'text-red-600' : 'text-gray-950'}`}
                                                            >
                                                                {can === undefined || can === null ? '—' : can}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => setEditing(p)}
                                        disabled={items.length === 0}
                                        className="btn btn-secondary btn-sm mt-4 w-full"
                                    >
                                        <Icon name={p.lines.length ? 'pencil' : 'plus'} className="h-3.5 w-3.5" />
                                        {p.lines.length ? 'Edit recipe' : 'Set recipe'}
                                    </button>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            <RecipeModal product={editing} items={items} onClose={() => setEditing(null)} />
        </AuthenticatedLayout>
    );
}

type EditLine = { item_id: number | ''; size_id: number | null; quantity: string };

function RecipeModal({ product, items, onClose }: { product: Product | null; items: StockItem[]; onClose: () => void }) {
    const form = useForm({ lines: [] as EditLine[] });
    const errors = form.errors as FieldErrors;
    const lines = form.data.lines;

    useEffect(() => {
        if (product) {
            form.clearErrors();
            form.setData({ lines: product.lines.map((l) => ({ item_id: l.item_id, size_id: l.size_id, quantity: String(l.quantity) })) });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product]);

    if (!product) {
        return null;
    }

    const groups: { id: number | null; title: string; hint: string }[] = [
        {
            id: null,
            title: product.sizes.length ? 'Every size' : 'Each one sold uses',
            hint: product.sizes.length ? 'Used by all sizes, e.g. a lid or a straw.' : '',
        },
        ...product.sizes.map((s) => ({ id: s.id, title: s.name, hint: 'Added on top of “Every size”.' })),
    ];

    const update = (index: number, changes: Partial<EditLine>) =>
        form.setData(
            'lines',
            lines.map((l, i) => (i === index ? { ...l, ...changes } : l)),
        );

    const parsed: Line[] = lines
        .filter((l) => l.item_id !== '' && Number(l.quantity) > 0)
        .map((l) => ({ item_id: l.item_id as number, size_id: l.size_id, quantity: Number(l.quantity) }));

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        form.transform((d) => ({ lines: d.lines.filter((l) => l.item_id !== '') }));
        form.put(route('inventory.recipes.update', product.id), { preserveScroll: true, onSuccess: onClose });
    };

    const lineError = errors.lines ?? Object.entries(errors).find(([k]) => k.startsWith('lines.'))?.[1];

    return (
        <Modal show onClose={onClose}>
            <form onSubmit={submit}>
                <DialogLayout
                    title={`Recipe · ${product.name}`}
                    description="Amounts are per one sold, in each item’s own unit."
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <PrimaryButton disabled={form.processing}>Save recipe</PrimaryButton>
                        </>
                    }
                >
                    <div className="space-y-4">
                        {groups.map((g) => {
                            const price = g.id === null ? product.price_cents : (product.sizes.find((s) => s.id === g.id)?.price_cents ?? 0);
                            const cost = costOf(parsed, items, g.id);

                            return (
                                <section key={g.id ?? 'all'} className="rounded-lg border border-gray-200 p-3 sm:p-4">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <div>
                                            <h3 className="text-sm font-semibold capitalize text-gray-950">{g.title}</h3>
                                            {g.hint && <p className="text-xs text-gray-500">{g.hint}</p>}
                                        </div>
                                        {(g.id !== null || product.sizes.length === 0) && (
                                            <p className="text-xs tabular-nums text-gray-500">
                                                Cost {peso(cost)} · Price {peso(price)}
                                                {price > 0 && ` · Margin ${Math.round(((price - cost) / price) * 100)}%`}
                                            </p>
                                        )}
                                    </div>

                                    <div className="mt-3 space-y-2">
                                        {lines.map((l, index) => {
                                            if (l.size_id !== g.id) {
                                                return null;
                                            }
                                            const item = items.find((i) => i.id === l.item_id);

                                            return (
                                                <div key={index} className="flex flex-wrap items-center gap-2">
                                                    <select
                                                        aria-label="Item"
                                                        value={l.item_id}
                                                        onChange={(e) =>
                                                            update(index, { item_id: e.target.value === '' ? '' : Number(e.target.value) })
                                                        }
                                                        className="input w-auto min-w-0 flex-1 py-1.5"
                                                    >
                                                        <option value="">Choose an item…</option>
                                                        {items.map((i) => (
                                                            <option key={i.id} value={i.id}>
                                                                {i.name} ({i.unit})
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.001"
                                                        aria-label="Amount"
                                                        value={l.quantity}
                                                        onChange={(e) => update(index, { quantity: e.target.value })}
                                                        className="input w-24 py-1.5"
                                                    />
                                                    <span className="w-12 text-xs text-gray-500">{item?.unit}</span>
                                                    <span className="hidden w-20 text-right text-xs tabular-nums text-gray-500 sm:inline">
                                                        {item ? unitCost(Number(l.quantity || 0) * item.unit_cost_cents) : ''}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        aria-label="Remove"
                                                        onClick={() =>
                                                            form.setData(
                                                                'lines',
                                                                lines.filter((_, i) => i !== index),
                                                            )
                                                        }
                                                        className="btn btn-ghost btn-sm btn-icon text-gray-400 hover:bg-red-50 hover:text-red-600"
                                                    >
                                                        <Icon name="x" />
                                                    </button>
                                                    {item && (
                                                        <span className="basis-full text-xs text-gray-500">
                                                            {qty(item.quantity)} {item.unit} on hand
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => form.setData('lines', [...lines, { item_id: '', size_id: g.id, quantity: '' }])}
                                        className="btn btn-ghost btn-sm mt-2 text-brand-700 hover:text-brand-800"
                                    >
                                        <Icon name="plus" className="h-3.5 w-3.5" />
                                        Add item
                                    </button>
                                </section>
                            );
                        })}
                    </div>

                    {lineError && <p className="field-error mt-3">{lineError}</p>}
                </DialogLayout>
            </form>
        </Modal>
    );
}
