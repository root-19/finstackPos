import Checkbox from '@/Components/Checkbox';
import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';
import { DialogLayout, Field } from '@/Components/ui';
import { CatalogCategory } from '@/types/catalog';
import { useForm } from '@inertiajs/react';
import { FormEventHandler, ReactNode, useEffect, useMemo, useState } from 'react';
import type { BranchOption, ProductRow } from '../Index';
import SizesEditor, { SizeForm, toSizeForms } from './SizesEditor';

interface ProductForm {
    name: string;
    sku: string;
    barcode: string;
    category_id: string;
    price: string;
    track_stock: boolean;
    stock: string;
    is_active: boolean;
    image: File | null;
    remove_image: boolean;
    sizes: SizeForm[];
    all_branches: boolean;
    branch_ids: number[];
    /** Branch id → quantity on hand there. */
    branch_stock: Record<number, string>;
}

const EMPTY: ProductForm = {
    name: '',
    sku: '',
    barcode: '',
    category_id: '',
    price: '',
    track_stock: false,
    stock: '',
    is_active: true,
    image: null,
    remove_image: false,
    sizes: [],
    all_branches: true,
    branch_ids: [],
    branch_stock: {},
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** Matches the server rule; QR codes often hold a URL, so this is longer than any product barcode. */
const MAX_BARCODE_LENGTH = 255;

function randomSku(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(6));

    return 'SKU-' + Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export default function ProductFormModal({
    show,
    product,
    categories,
    branches,
    currency,
    onClose,
}: {
    show: boolean;
    /** Null when adding a new product. */
    product: ProductRow | null;
    categories: CatalogCategory[];
    branches: BranchOption[];
    currency: string;
    onClose: () => void;
}) {
    const form = useForm<ProductForm>(EMPTY);
    const { data, setData, errors, processing } = form;
    const [imageError, setImageError] = useState<string | null>(null);
    const [barcodeError, setBarcodeError] = useState<string | null>(null);
    const [barcodeNote, setBarcodeNote] = useState<string | null>(null);
    const [readingCode, setReadingCode] = useState(false);

    useEffect(() => {
        if (!show) {
            return;
        }

        form.clearErrors();
        setImageError(null);
        setBarcodeError(null);
        setBarcodeNote(null);
        form.setData(
            product
                ? {
                      name: product.name,
                      sku: product.sku,
                      barcode: product.barcode ?? '',
                      category_id: product.category_id ? String(product.category_id) : '',
                      price: (product.price_cents / 100).toFixed(2),
                      track_stock: product.stock !== null,
                      stock: product.stock !== null ? String(product.stock) : '',
                      is_active: product.is_active,
                      image: null,
                      remove_image: false,
                      sizes: toSizeForms(product.sizes ?? []),
                      all_branches: product.all_branches,
                      branch_ids: product.branch_ids,
                      branch_stock: Object.fromEntries(product.branch_stock.map((b) => [b.branch_id, String(b.stock)])),
                  }
                : EMPTY,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show, product]);

    // Preview the newly picked file, otherwise the saved image.
    const previewUrl = useMemo(() => (data.image ? URL.createObjectURL(data.image) : null), [data.image]);
    useEffect(
        () => () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        },
        [previewUrl],
    );
    const shownImage = previewUrl ?? (data.remove_image ? null : (product?.image_url ?? null));
    const hasSizes = data.sizes.length > 0;
    // Several branches: where it's sold, and a count for each.
    const multi = branches.length > 1;
    const sellingAt = data.all_branches ? branches.filter((b) => b.is_active || data.branch_ids.includes(b.id)) : branches.filter((b) => data.branch_ids.includes(b.id));
    const stockTotal = sellingAt.reduce((sum, b) => sum + Number(data.branch_stock[b.id] || 0), 0);
    const photoError = imageError ?? errors.image;

    const pickImage = (file: File | undefined) => {
        if (!file) {
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            setImageError('The image must be 2 MB or smaller.');
            return;
        }
        setImageError(null);
        setData((d) => ({ ...d, image: file, remove_image: false }));
    };

    // A photo or image of the code fills the barcode field; nothing is uploaded to the server.
    const readCode = async (file: File | undefined) => {
        if (!file) {
            return;
        }
        setBarcodeError(null);
        setBarcodeNote(null);
        setReadingCode(true);
        try {
            const { readCodeFromImage } = await import('@/lib/barcodeImage');
            const value = (await readCodeFromImage(file)).trim();
            if (value.length > MAX_BARCODE_LENGTH) {
                setBarcodeError(`That code holds ${value.length} characters; the most a barcode can have here is ${MAX_BARCODE_LENGTH}.`);
                return;
            }
            setData('barcode', value);
            setBarcodeNote('Read from the picture. Check it matches the code on the item.');
        } catch (err) {
            setBarcodeError(err instanceof Error ? err.message : 'That picture could not be read.');
        } finally {
            setReadingCode(false);
        }
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        form.transform((d) => ({
            name: d.name,
            sku: d.sku,
            barcode: d.barcode || null,
            category_id: d.category_id ? Number(d.category_id) : null,
            // With sizes the server lists the product at its cheapest size.
            price: d.sizes.length > 0 ? null : d.price,
            stock: d.track_stock ? (multi ? stockTotal : Number(d.stock || 0)) : null,
            is_active: d.is_active,
            all_branches: d.all_branches,
            branch_ids: d.all_branches ? [] : d.branch_ids,
            branch_stock: multi && d.track_stock ? Object.fromEntries(sellingAt.map((b) => [b.id, Number(d.branch_stock[b.id] || 0)])) : null,
            image: d.image,
            remove_image: d.remove_image,
            sizes: d.sizes,
            // Files need multipart; PHP only parses that for POST, so spoof PUT.
            ...(product ? { _method: 'put' } : {}),
        }));

        const url = product ? route('products.update', product.id) : route('products.store');
        form.post(url, {
            forceFormData: true,
            // sizes[0][name], not sizes[][name]: PHP would split the
            // "brackets" format into separate entries.
            queryStringArrayFormat: 'indices',
            preserveScroll: true,
            onSuccess: () => onClose(),
        });
    };

    return (
        <Modal show={show} onClose={onClose}>
            <form onSubmit={submit}>
                <DialogLayout
                    title={product ? 'Edit product' : 'Add product'}
                    description={product ? product.sku : 'Add an item your cashiers can ring up at the POS.'}
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <PrimaryButton type="submit" disabled={processing}>
                                {product ? 'Save changes' : 'Add product'}
                            </PrimaryButton>
                        </>
                    }
                >
                    <div className="space-y-6">
                        {/* Photo */}
                        <div className="flex items-center gap-4">
                            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-50 ring-1 ring-gray-200">
                                {shownImage ? (
                                    <img src={shownImage} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <Icon name="products" className="h-7 w-7 text-gray-300" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="label">
                                    Product photo <span className="font-normal text-gray-500">(optional)</span>
                                </p>
                                <div className="mt-1.5 flex flex-wrap gap-2">
                                    <label className="btn btn-secondary btn-sm cursor-pointer focus-within:ring-2 focus-within:ring-brand-500/40">
                                        {shownImage ? 'Change photo' : 'Upload photo'}
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            className="sr-only"
                                            onChange={(e) => {
                                                pickImage(e.target.files?.[0]);
                                                e.target.value = '';
                                            }}
                                        />
                                    </label>
                                    {shownImage && (
                                        <button
                                            type="button"
                                            onClick={() => setData((d) => ({ ...d, image: null, remove_image: true }))}
                                            className="btn btn-ghost btn-sm text-red-600 hover:bg-red-50 hover:text-red-700"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                                {photoError ? <p className="field-error">{photoError}</p> : <p className="help">JPG, PNG, or WebP up to 2 MB.</p>}
                            </div>
                        </div>

                        <Section title="Details">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Name" htmlFor="name" error={errors.name} required className="sm:col-span-2">
                                    <TextInput id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} isFocused required />
                                </Field>

                                <Field label="SKU" htmlFor="sku" error={errors.sku} required>
                                    <div className="flex gap-2">
                                        <TextInput
                                            id="sku"
                                            value={data.sku}
                                            onChange={(e) => setData('sku', e.target.value)}
                                            className="min-w-0"
                                            required
                                        />
                                        <button type="button" onClick={() => setData('sku', randomSku())} className="btn btn-secondary shrink-0">
                                            Generate
                                        </button>
                                    </div>
                                </Field>

                                <Field
                                    label="Barcode or QR code"
                                    htmlFor="barcode"
                                    error={barcodeError ?? errors.barcode}
                                    hint={barcodeNote ?? 'Optional. Type it, or upload a photo of the code. Scanned at the POS.'}
                                >
                                    <div className="flex gap-2">
                                        <TextInput
                                            id="barcode"
                                            value={data.barcode}
                                            onChange={(e) => {
                                                setBarcodeNote(null);
                                                setData('barcode', e.target.value);
                                            }}
                                            className="min-w-0"
                                        />
                                        <label
                                            className={`btn btn-secondary shrink-0 cursor-pointer focus-within:ring-2 focus-within:ring-brand-500/40 ${readingCode ? 'pointer-events-none opacity-60' : ''}`}
                                        >
                                            {readingCode ? 'Reading…' : 'Upload'}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="sr-only"
                                                disabled={readingCode}
                                                aria-label="Upload a photo of the barcode or QR code"
                                                onChange={(e) => {
                                                    readCode(e.target.files?.[0]);
                                                    e.target.value = '';
                                                }}
                                            />
                                        </label>
                                    </div>
                                </Field>

                                <Field label="Category" htmlFor="category_id" error={errors.category_id} className="sm:col-span-2">
                                    <select
                                        id="category_id"
                                        value={data.category_id}
                                        onChange={(e) => setData('category_id', e.target.value)}
                                        className="input"
                                    >
                                        <option value="">No category</option>
                                        {categories.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            </div>
                        </Section>

                        <Section title="Pricing">
                            <div className="space-y-4">
                                <Field
                                    label={`Price (${currency})`}
                                    htmlFor="price"
                                    error={errors.price}
                                    required={!hasSizes}
                                    className="sm:max-w-[50%]"
                                >
                                    {hasSizes ? (
                                        // With sizes, each size's own price is what's charged.
                                        <p className="flex h-[38px] items-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">
                                            Set per size below
                                        </p>
                                    ) : (
                                        <TextInput
                                            id="price"
                                            inputMode="decimal"
                                            value={data.price}
                                            onChange={(e) => setData('price', e.target.value)}
                                            placeholder="0.00"
                                            className="tabular-nums"
                                            required
                                        />
                                    )}
                                </Field>

                                <div className="rounded-lg border border-gray-200 p-3 sm:p-4">
                                    <SizesEditor
                                        sizes={data.sizes}
                                        onChange={(sizes) => setData('sizes', sizes)}
                                        errors={errors as Record<string, string | undefined>}
                                        currency={currency}
                                    />
                                </div>
                            </div>
                        </Section>

                        {multi && (
                            <Section title="Branches">
                                <div className="space-y-3 rounded-lg border border-gray-200 p-4">
                                    <label className="flex items-center gap-3 text-sm font-medium text-gray-950">
                                        <input type="radio" name="sold-at" checked={data.all_branches} onChange={() => setData('all_branches', true)} />
                                        Sold at all branches
                                    </label>
                                    <label className="flex items-center gap-3 text-sm font-medium text-gray-950">
                                        <input type="radio" name="sold-at" checked={!data.all_branches} onChange={() => setData('all_branches', false)} />
                                        Only at these branches
                                    </label>
                                    {!data.all_branches && (
                                        <div className="grid gap-2 ps-7 sm:grid-cols-2">
                                            {branches.map((b) => (
                                                <label key={b.id} className="flex items-center gap-2 text-sm text-gray-700">
                                                    <Checkbox
                                                        checked={data.branch_ids.includes(b.id)}
                                                        onChange={(e) =>
                                                            setData(
                                                                'branch_ids',
                                                                e.target.checked ? [...data.branch_ids, b.id] : data.branch_ids.filter((id) => id !== b.id),
                                                            )
                                                        }
                                                    />
                                                    {b.name}
                                                    {!b.is_active && <span className="text-xs text-gray-400">(closed)</span>}
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                    {(errors as Record<string, string>).branch_ids && <p className="field-error">{(errors as Record<string, string>).branch_ids}</p>}
                                    <p className="help">The POS of other branches won't show it.</p>
                                </div>
                            </Section>
                        )}

                        <Section title="Stock and visibility">
                            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                                <div className="p-4">
                                    <label className="flex items-start gap-3">
                                        <Checkbox
                                            className="mt-0.5"
                                            checked={data.track_stock}
                                            onChange={(e) => setData('track_stock', e.target.checked)}
                                        />
                                        <span>
                                            <span className="block text-sm font-medium text-gray-950">Track stock for this product</span>
                                            <span className="block text-xs text-gray-500">Each sale lowers the quantity on hand.</span>
                                        </span>
                                    </label>
                                    {data.track_stock && multi && (
                                        <div className="mt-3 ps-7">
                                            <p className="text-sm font-medium text-gray-950">Quantity on hand at each branch</p>
                                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                                {sellingAt.map((b) => (
                                                    <label key={b.id} className="flex items-center gap-2 text-sm text-gray-700">
                                                        <span className="min-w-0 flex-1 truncate">{b.name}</span>
                                                        <TextInput
                                                            type="number"
                                                            min={0}
                                                            value={data.branch_stock[b.id] ?? ''}
                                                            onChange={(e) => setData('branch_stock', { ...data.branch_stock, [b.id]: e.target.value })}
                                                            className="w-24 tabular-nums"
                                                            aria-label={`Stock at ${b.name}`}
                                                        />
                                                    </label>
                                                ))}
                                            </div>
                                            <p className="help">Overall: {stockTotal}</p>
                                        </div>
                                    )}
                                    {data.track_stock && !multi && (
                                        <Field label="Quantity on hand" htmlFor="stock" error={errors.stock} className="mt-3 max-w-[12rem] ps-7">
                                            <TextInput
                                                id="stock"
                                                type="number"
                                                min={0}
                                                value={data.stock}
                                                onChange={(e) => setData('stock', e.target.value)}
                                                className="tabular-nums"
                                            />
                                        </Field>
                                    )}
                                </div>
                                <label className="flex items-start gap-3 p-4">
                                    <Checkbox className="mt-0.5" checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />
                                    <span>
                                        <span className="block text-sm font-medium text-gray-950">Show this product in the POS</span>
                                        <span className="block text-xs text-gray-500">
                                            Hidden products stay in your catalog but don't appear at the POS.
                                        </span>
                                    </span>
                                </label>
                            </div>
                        </Section>
                    </div>
                </DialogLayout>
            </form>
        </Modal>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-950">{title}</h3>
            {children}
        </section>
    );
}
