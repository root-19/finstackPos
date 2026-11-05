import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import Pagination from '@/Components/Pagination';
import { Alert, Badge, ConfirmDialog, EmptyState } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatMoney } from '@/lib/money';
import { formatPriceRange } from '@/lib/options';
import { PageProps, Paginated } from '@/types';
import { CatalogCategory, ProductSize } from '@/types/catalog';
import { Head, Link, router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import ProductFormModal from './Partials/ProductFormModal';

export interface ProductRow {
    id: number;
    name: string;
    sku: string;
    barcode: string | null;
    image_url: string | null;
    category_id: number | null;
    category: string | null;
    price_cents: number;
    stock: number | null;
    is_active: boolean;
    sizes: ProductSize[];
    all_branches: boolean;
    branch_ids: number[];
    /** Each branch's own count (empty while one shared count is kept). */
    branch_stock: { branch_id: number; name: string; stock: number }[];
}

export type BranchOption = { id: number; name: string; is_active: boolean };

const LOW_STOCK = 5;

export default function ProductsIndex({
    auth,
    products,
    categories,
    filters,
    productLimit,
    branches,
}: PageProps<{
    products: Paginated<ProductRow>;
    categories: CatalogCategory[];
    branches: BranchOption[];
    filters: { search: string; category: number | null; branch: number | null };
    /** Free plan: products allowed (limit null = unlimited on Pro). */
    productLimit: { used: number; limit: number | null };
}>) {
    const currency = auth.merchant?.currency ?? 'PHP';
    const [search, setSearch] = useState(filters.search);
    // undefined: closed, null: creating, ProductRow: editing
    const [editing, setEditing] = useState<ProductRow | null | undefined>();
    const [deleting, setDeleting] = useState<ProductRow | null>(null);
    const filtered = Boolean(filters.search || filters.category || filters.branch);
    const multi = branches.length > 1;
    const soldAt = (p: ProductRow) =>
        p.all_branches ? 'All branches' : branches.filter((b) => p.branch_ids.includes(b.id)).map((b) => b.name).join(', ') || '—';
    const atLimit = productLimit.limit !== null && productLimit.used >= productLimit.limit;

    const applyFilters = (next: { search?: string; category?: number | null; branch?: number | null }) => {
        const query = { search: filters.search, category: filters.category, branch: filters.branch, ...next };

        router.get(
            route('products.index'),
            {
                search: query.search || undefined,
                category: query.category ?? undefined,
                branch: query.branch ?? undefined,
            },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    useEffect(() => {
        if (search === filters.search) {
            return;
        }

        const timer = window.setTimeout(() => applyFilters({ search }), 300);

        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const confirmDelete = () => {
        if (!deleting) {
            return;
        }

        router.delete(route('products.destroy', deleting.id), {
            preserveScroll: true,
            onSuccess: () => setDeleting(null),
        });
    };

    const addButton = (
        <button type="button" onClick={() => setEditing(null)} disabled={atLimit} className="btn btn-primary">
            <Icon name="plus" />
            Add product
        </button>
    );

    return (
        <AuthenticatedLayout
            header={<PageHeader title="Products" subtitle={`${products.total} product${products.total === 1 ? '' : 's'} in your catalog`} />}
        >
            <Head title="Products" />

            <div className="app-page">
                {/* Toolbar: filters left, actions right */}
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                        <div className="relative min-w-0 flex-1 md:max-w-sm">
                            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search name, SKU, or barcode"
                                aria-label="Search products"
                                className="input pl-9"
                            />
                        </div>
                        <select
                            value={filters.category ?? ''}
                            onChange={(e) =>
                                applyFilters({
                                    category: e.target.value ? Number(e.target.value) : null,
                                })
                            }
                            aria-label="Filter by category"
                            className="input sm:w-52"
                        >
                            <option value="">All categories</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                        {multi && (
                            <select
                                value={filters.branch ?? ''}
                                onChange={(e) => applyFilters({ branch: e.target.value ? Number(e.target.value) : null })}
                                aria-label="Filter by branch"
                                className="input sm:w-48"
                            >
                                <option value="">All branches</option>
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        Sold at {b.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2 md:ms-auto">
                        <Link href={route('categories.index')} className="btn btn-secondary flex-1 sm:flex-none">
                            <Icon name="categories" />
                            Categories
                        </Link>
                        <button
                            type="button"
                            onClick={() => setEditing(null)}
                            disabled={atLimit}
                            title={atLimit ? 'Free plan limit reached' : undefined}
                            className="btn btn-primary flex-1 sm:flex-none"
                        >
                            <Icon name="plus" />
                            Add product
                        </button>
                    </div>
                </div>

                {productLimit.limit !== null && (
                    <Alert tone={atLimit ? 'red' : 'blue'}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                                <strong>
                                    {productLimit.used} of {productLimit.limit}
                                </strong>{' '}
                                products on the free plan.
                                {atLimit ? ' You have reached the limit.' : ''} Pro removes the limit.
                            </span>
                            {auth.user.role === 'owner' && (
                                <Link href={route('subscription.index')} className="btn btn-secondary btn-sm">
                                    <Icon name="star" />
                                    Upgrade to Pro
                                </Link>
                            )}
                        </div>
                    </Alert>
                )}

                <div className="card overflow-hidden">
                    {products.data.length === 0 ? (
                        <EmptyState
                            icon={<Icon name="products" className="h-5 w-5" />}
                            title={filtered ? 'No products match your filters' : 'No products yet'}
                            action={filtered ? undefined : addButton}
                        >
                            {filtered ? 'Try a different search or category.' : 'Add your first product to start selling.'}
                        </EmptyState>
                    ) : (
                        <>
                            {/* Desktop table */}
                            <div className="hidden overflow-x-auto md:block">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Product</th>
                                            <th>Category</th>
                                            <th className="num">Price</th>
                                            {multi && <th>Sold at</th>}
                                            <th>Stock</th>
                                            <th>Status</th>
                                            <th>
                                                <span className="sr-only">Actions</span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {products.data.map((p) => (
                                            <tr key={p.id}>
                                                <td className="max-w-md">
                                                    <div className="flex items-center gap-3">
                                                        <Thumbnail product={p} />
                                                        <div className="min-w-0">
                                                            <p className="truncate font-medium text-gray-950">{p.name}</p>
                                                            <p className="truncate text-xs text-gray-500">
                                                                {p.sku}
                                                                {p.barcode && ` · ${p.barcode}`}
                                                            </p>
                                                            <OptionsSummary product={p} currency={currency} />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap">{p.category ?? <span className="text-gray-400">—</span>}</td>
                                                <td className="num whitespace-nowrap font-medium text-gray-950">
                                                    {formatPriceRange(p.price_cents, p.sizes, currency)}
                                                </td>
                                                {multi && <td className="max-w-[12rem] truncate text-sm text-gray-600">{soldAt(p)}</td>}
                                                <td>
                                                    <StockBadge stock={p.stock} />
                                                    {p.branch_stock.length > 1 && (
                                                        <p className="mt-0.5 text-xs text-gray-500">{p.branch_stock.map((b) => `${b.name} ${b.stock}`).join(' · ')}</p>
                                                    )}
                                                </td>
                                                <td>
                                                    <StatusBadge active={p.is_active} />
                                                </td>
                                                <td className="text-right">
                                                    <RowActions name={p.name} onEdit={() => setEditing(p)} onDelete={() => setDeleting(p)} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Phones: stacked list */}
                            <ul className="divide-y divide-gray-100 md:hidden">
                                {products.data.map((p) => (
                                    <li key={p.id} className="px-4 py-3">
                                        <div className="flex items-start gap-3">
                                            <Thumbnail product={p} />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="min-w-0 truncate text-sm font-medium text-gray-950">{p.name}</p>
                                                    <p className="shrink-0 text-sm font-medium tabular-nums text-gray-950">
                                                        {formatPriceRange(p.price_cents, p.sizes, currency)}
                                                    </p>
                                                </div>
                                                <p className="truncate text-xs text-gray-500">
                                                    {p.sku}
                                                    {p.category && ` · ${p.category}`}
                                                    {multi && ` · ${soldAt(p)}`}
                                                </p>
                                                <OptionsSummary product={p} currency={currency} />
                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    <StockBadge stock={p.stock} />
                                                    <StatusBadge active={p.is_active} />
                                                    <div className="ms-auto">
                                                        <RowActions name={p.name} onEdit={() => setEditing(p)} onDelete={() => setDeleting(p)} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    <Pagination paginator={products} noun="products" />
                </div>
            </div>

            <ProductFormModal
                show={editing !== undefined}
                product={editing ?? null}
                categories={categories}
                branches={branches}
                currency={currency}
                onClose={() => setEditing(undefined)}
            />

            <ConfirmDialog
                show={deleting !== null}
                title={`Delete ${deleting?.name ?? 'product'}?`}
                confirmLabel="Delete product"
                onConfirm={confirmDelete}
                onClose={() => setDeleting(null)}
            >
                It will be removed from every register on their next sync. Past sales keep their record of it.
            </ConfirmDialog>
        </AuthenticatedLayout>
    );
}

function OptionsSummary({ product, currency }: { product: ProductRow; currency: string }) {
    if (product.sizes.length === 0) {
        return null;
    }

    return (
        <p className="mt-0.5 truncate text-xs text-brand-700">
            {product.sizes.map((s) => `${s.name} ${formatMoney(s.price_cents, currency)}`).join(' · ')}
        </p>
    );
}

function Thumbnail({ product }: { product: ProductRow }) {
    return product.image_url ? (
        <img src={product.image_url} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-gray-200" />
    ) : (
        <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm font-semibold uppercase text-gray-400 ring-1 ring-gray-200"
        >
            {product.name[0]}
        </span>
    );
}

function StockBadge({ stock }: { stock: number | null }) {
    if (stock === null) {
        return <span className="whitespace-nowrap text-xs text-gray-400">Not tracked</span>;
    }

    if (stock <= 0) {
        return <Badge tone="red">Out of stock</Badge>;
    }

    return (
        <Badge tone={stock <= LOW_STOCK ? 'amber' : 'gray'} className="tabular-nums">
            {stock} in stock
        </Badge>
    );
}

function StatusBadge({ active }: { active: boolean }) {
    return active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Hidden</Badge>;
}

function RowActions({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
    return (
        <div className="inline-flex items-center gap-1">
            <button type="button" onClick={onEdit} className="btn btn-ghost btn-sm" aria-label={`Edit ${name}`}>
                <Icon name="pencil" className="h-3.5 w-3.5" />
                Edit
            </button>
            <button
                type="button"
                onClick={onDelete}
                className="btn btn-ghost btn-sm btn-icon w-8 text-gray-500 hover:bg-red-50 hover:text-red-600"
                aria-label={`Delete ${name}`}
                title="Delete"
            >
                <Icon name="trash" className="h-4 w-4" />
            </button>
        </div>
    );
}
