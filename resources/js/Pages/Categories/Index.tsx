import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';
import { Badge, CardHeader, ConfirmDialog, DialogLayout, EmptyState, Field, Stat } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { CatalogCategory } from '@/types/catalog';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { FormEventHandler, useEffect, useState } from 'react';

interface CategoryRow extends CatalogCategory {
    products_count: number;
}

export default function CategoriesIndex({ categories }: PageProps<{ categories: CategoryRow[] }>) {
    const [renaming, setRenaming] = useState<CategoryRow | null>(null);
    const [deleting, setDeleting] = useState<CategoryRow | null>(null);
    const [search, setSearch] = useState('');
    const add = useForm({ name: '' });

    const totalProducts = categories.reduce((sum, c) => sum + c.products_count, 0);
    const visible = categories.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()));

    const submitAdd: FormEventHandler = (e) => {
        e.preventDefault();
        add.post(route('categories.store'), {
            preserveScroll: true,
            onSuccess: () => add.reset(),
        });
    };

    const confirmDelete = () => {
        if (!deleting) {
            return;
        }

        router.delete(route('categories.destroy', deleting.id), {
            preserveScroll: true,
            onSuccess: () => setDeleting(null),
        });
    };

    return (
        <AuthenticatedLayout header={<PageHeader title="Categories" subtitle="Group your products so cashiers find them faster" />}>
            <Head title="Categories" />

            <div className="app-page">
                <div className="mx-auto w-full max-w-3xl space-y-5">
                    <div className="grid grid-cols-2 gap-3">
                        <Stat label="Categories" value={categories.length} />
                        <Stat label="Products in categories" value={totalProducts} />
                    </div>

                    {/* Add */}
                    <section className="card">
                        <form onSubmit={submitAdd} className="card-body">
                            <label htmlFor="new-category" className="label">
                                New category
                            </label>
                            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                                <TextInput
                                    id="new-category"
                                    value={add.data.name}
                                    onChange={(e) => add.setData('name', e.target.value)}
                                    placeholder="e.g. Drinks"
                                    className="min-w-0 flex-1"
                                    required
                                />
                                <button type="submit" disabled={add.processing} className="btn btn-primary shrink-0">
                                    <Icon name="plus" />
                                    Add category
                                </button>
                            </div>
                            {add.errors.name ? (
                                <p className="field-error">{add.errors.name}</p>
                            ) : (
                                <p className="help">Cashiers can filter by category in one tap at the POS.</p>
                            )}
                        </form>
                    </section>

                    {/* List */}
                    <section className="card overflow-hidden">
                        <CardHeader
                            title={
                                <span className="inline-flex items-center gap-2">
                                    Your categories
                                    <Badge className="tabular-nums">{categories.length}</Badge>
                                </span>
                            }
                            actions={
                                categories.length > 0 && (
                                    <div className="relative w-56 max-w-full">
                                        <Icon
                                            name="search"
                                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                                        />
                                        <input
                                            type="search"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder="Search categories"
                                            aria-label="Search categories"
                                            className="input py-1.5 pl-9"
                                        />
                                    </div>
                                )
                            }
                        />

                        {categories.length === 0 ? (
                            <EmptyState icon={<Icon name="categories" className="h-5 w-5" />} title="No categories yet">
                                Add your first one above, like Drinks, Food, or Snacks.
                            </EmptyState>
                        ) : visible.length === 0 ? (
                            <EmptyState title="No matching categories">No category matches “{search}”.</EmptyState>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {visible.map((category) => (
                                    <li key={category.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                                        <span
                                            aria-hidden
                                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold uppercase text-brand-700"
                                        >
                                            {category.name[0]}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-gray-950" title={category.name}>
                                                {category.name}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {category.products_count} product{category.products_count === 1 ? '' : 's'}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Link
                                                href={route('products.index', { category: category.id })}
                                                className="btn btn-ghost btn-sm"
                                                aria-label={`View products in ${category.name}`}
                                            >
                                                <span className="hidden sm:inline">View products</span>
                                                <span className="sm:hidden">View</span>
                                                <Icon name="chevronRight" className="h-3.5 w-3.5" />
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={() => setRenaming(category)}
                                                aria-label={`Rename ${category.name}`}
                                                title="Rename"
                                                className="btn btn-ghost btn-sm btn-icon w-8 text-gray-500"
                                            >
                                                <Icon name="pencil" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeleting(category)}
                                                aria-label={`Delete ${category.name}`}
                                                title="Delete"
                                                className="btn btn-ghost btn-sm btn-icon w-8 text-gray-500 hover:bg-red-50 hover:text-red-600"
                                            >
                                                <Icon name="trash" />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>

            <RenameModal category={renaming} onClose={() => setRenaming(null)} />

            <ConfirmDialog
                show={deleting !== null}
                title={`Delete ${deleting?.name ?? 'category'}?`}
                confirmLabel="Delete category"
                onConfirm={confirmDelete}
                onClose={() => setDeleting(null)}
            >
                {deleting && deleting.products_count > 0
                    ? `Its ${deleting.products_count} product(s) will stay but become uncategorized.`
                    : 'This category will be removed.'}
            </ConfirmDialog>
        </AuthenticatedLayout>
    );
}

function RenameModal({ category, onClose }: { category: CategoryRow | null; onClose: () => void }) {
    const { data, setData, put, processing, errors, clearErrors } = useForm({ name: '' });

    useEffect(() => {
        if (category) {
            setData('name', category.name);
            clearErrors();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        if (!category) {
            return;
        }
        put(route('categories.update', category.id), {
            preserveScroll: true,
            onSuccess: () => onClose(),
        });
    };

    return (
        <Modal show={category !== null} onClose={onClose} maxWidth="md">
            <form onSubmit={submit}>
                <DialogLayout
                    title="Rename category"
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <PrimaryButton type="submit" disabled={processing}>
                                Save
                            </PrimaryButton>
                        </>
                    }
                >
                    <Field label="Name" htmlFor="rename-category" error={errors.name} required>
                        <TextInput id="rename-category" value={data.name} onChange={(e) => setData('name', e.target.value)} isFocused required />
                    </Field>
                </DialogLayout>
            </form>
        </Modal>
    );
}
