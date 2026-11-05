import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { ConfirmDialog, DialogLayout, Segmented, Stat } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { FormEventHandler, useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, Field, FieldErrors, inputClass, InventoryNav, MOVEMENT_LABELS, peso, qty, StockStatus, unitCost } from './Partials/shared';

export type Item = {
    id: number;
    name: string;
    sku: string | null;
    category: string | null;
    unit: string;
    quantity: number;
    unit_cost_cents: number;
    value_cents: number;
    reorder_level: number | null;
    reorder_quantity: number | null;
    supplier_id: number | null;
    supplier: string | null;
    location: string | null;
    notes: string | null;
    is_active: boolean;
    status: 'ok' | 'low' | 'out' | 'inactive';
    used_in: number;
    /** Overall view with several branches: what each holds. */
    by_branch: { branch_id: number; name: string; quantity: number }[];
};

type BranchOption = { id: number; name: string; is_active: boolean };

/** Where stock moves happen from this page. */
type BranchCtx = {
    branches: BranchOption[];
    /** The branch shown, or the main one in the overall view. */
    initial: number | '';
    /** Tied to a branch, or a store with one branch: nothing to choose. */
    fixed: boolean;
    /** Showing every branch's total. */
    overall: boolean;
};

/** On hand at a branch: in the overall view, that branch's share. */
const onHandAt = (item: Item, ctx: BranchCtx, branchId: number | '') =>
    ctx.overall && !ctx.fixed ? (item.by_branch.find((b) => b.branch_id === branchId)?.quantity ?? 0) : item.quantity;

type Props = {
    items: Item[];
    branches: BranchOption[];
    branch: number | null;
    branchLocked: boolean;
    summary: { items: number; value_cents: number; low: number; out: number };
    categories: string[];
    units: string[];
    suppliers: { id: number; name: string }[];
    blocksSales: boolean;
};

type MoveType = 'purchase' | 'adjustment' | 'waste' | 'usage' | 'return';

export default function InventoryIndex({ items, summary, categories, units, suppliers, blocksSales, branches, branch, branchLocked }: PageProps<Props>) {
    const open = branches.filter((b) => b.is_active);
    const ctx: BranchCtx = {
        branches: open,
        initial: branch ?? open[0]?.id ?? '',
        fixed: branchLocked || branches.length <= 1,
        overall: branch === null,
    };
    const showBranch = (id: number | null) => router.get(route('inventory.index'), id ? { branch: id } : {}, { preserveScroll: true });
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [status, setStatus] = useState('');
    // undefined: closed, null: adding
    const [editing, setEditing] = useState<Item | null | undefined>();
    const [moving, setMoving] = useState<{ item: Item; type: MoveType } | null>(null);
    const [receiving, setReceiving] = useState(false);
    const [removing, setRemoving] = useState<Item | null>(null);

    const shown = useMemo(() => {
        const term = search.trim().toLowerCase();

        return items.filter(
            (i) =>
                (term === '' || [i.name, i.sku, i.supplier, i.location].some((v) => v?.toLowerCase().includes(term))) &&
                (category === '' || i.category === category) &&
                (status === '' || i.status === status),
        );
    }, [items, search, category, status]);

    const toggleBlocking = () => router.put(route('inventory.settings'), { blocks_sales: !blocksSales }, { preserveScroll: true });

    return (
        <AuthenticatedLayout header={<PageHeader title="Inventory" subtitle="Supplies, ingredients, and materials, kept in step with every sale" />}>
            <Head title="Inventory" />

            <div className="app-page">
                <InventoryNav />

                {!branchLocked && branches.length > 1 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <Segmented
                            label="Branch"
                            value={branch === null ? 'all' : String(branch)}
                            onChange={(v) => showBranch(v === 'all' ? null : Number(v))}
                            options={[{ value: 'all', label: 'All branches' }, ...branches.map((b) => ({ value: String(b.id), label: b.name }))]}
                        />
                        <span className="text-xs text-gray-500">
                            {branch === null ? 'Overall: every branch added up.' : 'Stock held at this branch only.'}
                        </span>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label="Active items" value={String(summary.items)} />
                    <Stat label="Stock value" value={peso(summary.value_cents)} hint="On hand × average cost" />
                    <Stat
                        label="Low stock"
                        value={String(summary.low)}
                        tone={summary.low ? 'amber' : undefined}
                        onClick={() => setStatus('low')}
                        active={status === 'low'}
                    />
                    <Stat
                        label="Out of stock"
                        value={String(summary.out)}
                        tone={summary.out ? 'red' : undefined}
                        onClick={() => setStatus('out')}
                        active={status === 'out'}
                    />
                </div>

                <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-950">When ingredients run out on the POS</p>
                        <p className="mt-0.5 text-sm text-gray-500">
                            Sales use up each product’s recipe automatically.{' '}
                            {blocksSales
                                ? 'Products without enough ingredients cannot be sold.'
                                : 'The cashier is warned but can still sell (stock can go below zero).'}
                        </p>
                    </div>
                    <div className="shrink-0">
                        <Segmented
                            label="When ingredients run out"
                            value={blocksSales ? 'stop' : 'warn'}
                            options={[
                                { value: 'warn', label: 'Warn only' },
                                { value: 'stop', label: 'Stop selling' },
                            ]}
                            onChange={(v) => (v === 'stop') !== blocksSales && toggleBlocking()}
                        />
                    </div>
                </Card>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <div className="relative w-full sm:max-w-xs">
                            <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-gray-400">
                                <Icon name="search" />
                            </span>
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search name, SKU, supplier, location"
                                aria-label="Search inventory"
                                className="input ps-9"
                            />
                        </div>
                        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="input sm:w-auto">
                            <option value="">All categories</option>
                            {categories.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Stock status" className="input sm:w-auto">
                            <option value="">Any stock level</option>
                            <option value="ok">In stock</option>
                            <option value="low">Low</option>
                            <option value="out">Out</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <a href={route('inventory.export', branch ? { branch } : {})} className="btn btn-secondary">
                            <Icon name="download" />
                            Export CSV
                        </a>
                        <button type="button" onClick={() => setReceiving(true)} disabled={items.length === 0} className="btn btn-secondary">
                            Receive delivery
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className="btn btn-primary">
                            <Icon name="plus" />
                            Add item
                        </button>
                    </div>
                </div>

                <Card className="overflow-hidden">
                    {shown.length === 0 ? (
                        <EmptyState
                            title={items.length ? 'No items match' : 'No inventory items yet'}
                            icon={<Icon name="inventory" className="h-5 w-5" />}
                            action={
                                !items.length && (
                                    <button type="button" onClick={() => setEditing(null)} className="btn btn-primary">
                                        <Icon name="plus" />
                                        Add item
                                    </button>
                                )
                            }
                        >
                            {!items.length && 'Add the supplies, ingredients, and materials you buy, e.g. coffee beans (g), milk (mL), cups (pcs).'}
                        </EmptyState>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Item</th>
                                        <th className="num">On hand</th>
                                        <th>Status</th>
                                        <th className="num">Reorder at</th>
                                        <th className="num">Unit cost</th>
                                        <th className="num">Value</th>
                                        <th>Supplier</th>
                                        <th className="num">Stock</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shown.map((i) => (
                                        <tr key={i.id} className={i.is_active ? '' : 'opacity-60'}>
                                            <td className="min-w-[12rem]">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditing(i)}
                                                    className="text-left font-semibold text-gray-950 hover:text-brand-700"
                                                >
                                                    {i.name}
                                                </button>
                                                <p className="text-xs text-gray-500">
                                                    {[
                                                        i.category,
                                                        i.sku && `SKU ${i.sku}`,
                                                        i.location,
                                                        i.used_in ? `Used in ${i.used_in} product${i.used_in === 1 ? '' : 's'}` : null,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(' · ') || '—'}
                                                </p>
                                            </td>
                                            <td className="num whitespace-nowrap">
                                                <span className={`font-semibold ${i.quantity < 0 ? 'text-red-600' : 'text-gray-950'}`}>
                                                    {qty(i.quantity)}
                                                </span>{' '}
                                                <span className="text-gray-500">{i.unit}</span>
                                                {i.by_branch.length > 0 && (
                                                    <span className="mt-0.5 block text-xs font-normal text-gray-500">
                                                        {i.by_branch.map((b) => `${b.name} ${qty(b.quantity)}`).join(' · ')}
                                                    </span>
                                                )}
                                                {i.reorder_level !== null && i.reorder_level > 0 && (
                                                    <span className="mt-1 block h-1 w-full min-w-[4rem] overflow-hidden rounded-full bg-gray-100">
                                                        <span
                                                            className={`block h-full rounded-full ${i.status === 'ok' ? 'bg-emerald-500' : i.status === 'low' ? 'bg-amber-500' : 'bg-red-500'}`}
                                                            style={{
                                                                width: `${Math.min(100, Math.max(0, (i.quantity / (i.reorder_level * 2)) * 100))}%`,
                                                            }}
                                                        />
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <StockStatus status={i.status} />
                                            </td>
                                            <td className="num whitespace-nowrap">
                                                {i.reorder_level !== null ? `${qty(i.reorder_level)} ${i.unit}` : '—'}
                                            </td>
                                            <td className="num whitespace-nowrap">
                                                {unitCost(i.unit_cost_cents)}
                                                <span className="text-gray-400">/{i.unit}</span>
                                            </td>
                                            <td className="num whitespace-nowrap font-medium text-gray-950">{peso(i.value_cents)}</td>
                                            <td className="text-gray-600">{i.supplier ?? '—'}</td>
                                            <td className="num whitespace-nowrap">
                                                <div className="inline-flex gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setMoving({ item: i, type: 'purchase' })}
                                                        className="btn btn-secondary btn-sm"
                                                    >
                                                        <Icon name="plus" className="h-3.5 w-3.5" />
                                                        Stock in
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setMoving({ item: i, type: 'adjustment' })}
                                                        className="btn btn-ghost btn-sm"
                                                    >
                                                        Count
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setMoving({ item: i, type: 'waste' })}
                                                        className="btn btn-ghost btn-sm"
                                                    >
                                                        <Icon name="minus" className="h-3.5 w-3.5" />
                                                        Out
                                                    </button>
                                                    <Link href={route('inventory.movements', { item: i.id })} className="btn btn-ghost btn-sm">
                                                        History
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>

            <ItemModal
                show={editing !== undefined}
                item={editing ?? null}
                categories={categories}
                units={units}
                suppliers={suppliers}
                ctx={ctx}
                onClose={() => setEditing(undefined)}
                onRemove={(item) => {
                    setEditing(undefined);
                    setRemoving(item);
                }}
            />
            <MoveModal state={moving} suppliers={suppliers} ctx={ctx} onClose={() => setMoving(null)} />
            <ReceiveModal show={receiving} items={items.filter((i) => i.is_active)} suppliers={suppliers} ctx={ctx} onClose={() => setReceiving(false)} />

            <ConfirmDialog
                show={removing !== null}
                title={`Remove ${removing?.name}?`}
                confirmLabel="Remove"
                onClose={() => setRemoving(null)}
                onConfirm={() =>
                    removing && router.delete(route('inventory.destroy', removing.id), { preserveScroll: true, onSuccess: () => setRemoving(null) })
                }
            >
                {removing?.used_in ? `It is taken out of ${removing.used_in} product recipe(s), so sales stop using it. ` : ''}
                Its stock history is kept. To keep it but stop using it, mark it inactive instead.
            </ConfirmDialog>
        </AuthenticatedLayout>
    );
}

function ItemModal({
    show,
    item,
    categories,
    units,
    suppliers,
    ctx,
    onClose,
    onRemove,
}: {
    show: boolean;
    item: Item | null;
    categories: string[];
    units: string[];
    suppliers: { id: number; name: string }[];
    ctx: BranchCtx;
    onClose: () => void;
    onRemove: (item: Item) => void;
}) {
    const blank = {
        name: '',
        sku: '',
        category: '',
        unit: 'pcs',
        unit_cost: '',
        reorder_level: '',
        reorder_quantity: '',
        supplier_id: '' as number | '',
        location: '',
        notes: '',
        is_active: true,
        opening_quantity: '',
        branch_id: ctx.initial,
    };
    const form = useForm(blank);
    const errors = form.errors as FieldErrors;
    const { data, setData } = form;

    useEffect(() => {
        if (show) {
            form.clearErrors();
            setData(
                item
                    ? {
                          ...blank,
                          name: item.name,
                          sku: item.sku ?? '',
                          category: item.category ?? '',
                          unit: item.unit,
                          unit_cost: item.unit_cost_cents ? String(item.unit_cost_cents / 100) : '',
                          reorder_level: item.reorder_level !== null ? String(item.reorder_level) : '',
                          reorder_quantity: item.reorder_quantity !== null ? String(item.reorder_quantity) : '',
                          supplier_id: item.supplier_id ?? '',
                          location: item.location ?? '',
                          notes: item.notes ?? '',
                          is_active: item.is_active,
                      }
                    : blank,
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show, item]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        form.transform((d) => ({ ...d, supplier_id: d.supplier_id === '' ? null : d.supplier_id }));
        const options = { preserveScroll: true, onSuccess: onClose };
        if (item) {
            form.put(route('inventory.update', item.id), options);
        } else {
            form.post(route('inventory.store'), options);
        }
    };

    const text = (key: 'name' | 'sku' | 'location', label: string, props: Record<string, unknown> = {}) => (
        <Field label={label} error={errors[key]}>
            <input className={inputClass} value={data[key]} onChange={(e) => setData(key, e.target.value)} {...props} />
        </Field>
    );
    const number = (key: 'unit_cost' | 'reorder_level' | 'reorder_quantity' | 'opening_quantity', label: string, hint?: string, step = '0.001') => (
        <Field label={label} error={errors[key]} hint={hint}>
            <input type="number" min="0" step={step} className={inputClass} value={data[key]} onChange={(e) => setData(key, e.target.value)} />
        </Field>
    );

    return (
        <Modal show={show} onClose={onClose}>
            <form onSubmit={submit}>
                <DialogLayout
                    title={item ? `Edit ${item.name}` : 'Add inventory item'}
                    footer={
                        <>
                            {item && (
                                <button
                                    type="button"
                                    onClick={() => onRemove(item)}
                                    className="btn btn-ghost me-auto text-red-700 hover:bg-red-50 hover:text-red-700"
                                >
                                    <Icon name="trash" />
                                    Remove item
                                </button>
                            )}
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <PrimaryButton disabled={form.processing}>{item ? 'Save' : 'Add item'}</PrimaryButton>
                        </>
                    }
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        {text('name', 'Name', { required: true, autoFocus: true, placeholder: 'e.g. Espresso beans, 16 oz cup' })}
                        {text('sku', 'SKU / code (optional)')}
                        <Field label="Category" error={errors.category}>
                            <input
                                list="inventory-categories"
                                className={inputClass}
                                value={data.category}
                                onChange={(e) => setData('category', e.target.value)}
                            />
                            <datalist id="inventory-categories">
                                {categories.map((c) => (
                                    <option key={c} value={c} />
                                ))}
                            </datalist>
                        </Field>
                        <Field label="Unit" error={errors.unit} hint="Recipes and counts use this unit.">
                            <input
                                list="inventory-units"
                                required
                                className={inputClass}
                                value={data.unit}
                                onChange={(e) => setData('unit', e.target.value)}
                            />
                            <datalist id="inventory-units">
                                {units.map((u) => (
                                    <option key={u} value={u} />
                                ))}
                            </datalist>
                        </Field>
                        {number(
                            'unit_cost',
                            `Cost per ${data.unit || 'unit'} (₱)`,
                            item ? 'Updated automatically as an average when you receive stock.' : undefined,
                            '0.0001',
                        )}
                        {!item && number('opening_quantity', `Opening stock (${data.unit || 'units'})`, 'What you have on hand right now.')}
                        {!item && !ctx.fixed && <BranchField ctx={ctx} value={data.branch_id} onChange={(id) => setData('branch_id', id)} label="Opening stock is at" />}
                        {number('reorder_level', `Reorder when at or below (${data.unit || 'units'})`, 'Shows as Low stock.')}
                        {number('reorder_quantity', `Usual order quantity (${data.unit || 'units'})`)}
                        <Field label="Supplier" error={errors.supplier_id}>
                            <select
                                className={inputClass}
                                value={data.supplier_id}
                                onChange={(e) => setData('supplier_id', e.target.value === '' ? '' : Number(e.target.value))}
                            >
                                <option value="">None</option>
                                {suppliers.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        {text('location', 'Storage location', { placeholder: 'e.g. Chiller 1, Back shelf' })}
                        <Field label="Notes" error={errors.notes} className="sm:col-span-2">
                            <textarea rows={2} className={inputClass} value={data.notes} onChange={(e) => setData('notes', e.target.value)} />
                        </Field>
                        <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
                            <input
                                type="checkbox"
                                checked={data.is_active}
                                onChange={(e) => setData('is_active', e.target.checked)}
                                className="checkbox"
                            />
                            Active (shown in counts and deliveries)
                        </label>
                    </div>

                    {item && (
                        <p className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
                            On hand:{' '}
                            <strong className="font-semibold text-gray-950">
                                {qty(item.quantity)} {item.unit}
                            </strong>
                            . To change it, use Stock in, Count, or Out, so every change is recorded.
                        </p>
                    )}
                </DialogLayout>
            </form>
        </Modal>
    );
}

const MOVE_TYPES: { value: MoveType; label: string; hint: string }[] = [
    { value: 'purchase', label: 'Stock in', hint: 'Received from a supplier or bought.' },
    { value: 'adjustment', label: 'Count', hint: 'Set the quantity to what you counted.' },
    { value: 'waste', label: 'Waste', hint: 'Spoiled, expired, spilled, or damaged.' },
    { value: 'usage', label: 'In-store use', hint: 'Staff meals, samples, cleaning, etc.' },
    { value: 'return', label: 'Return', hint: 'Sent back to the supplier.' },
];

function MoveModal({
    state,
    suppliers,
    ctx,
    onClose,
}: {
    state: { item: Item; type: MoveType } | null;
    suppliers: { id: number; name: string }[];
    ctx: BranchCtx;
    onClose: () => void;
}) {
    const form = useForm({
        branch_id: ctx.initial,
        type: 'purchase' as MoveType,
        quantity: '',
        unit_cost: '',
        supplier_id: '' as number | '',
        reference: '',
        note: '',
    });
    const errors = form.errors as FieldErrors;
    const { data, setData } = form;
    const item = state?.item;

    useEffect(() => {
        if (state) {
            form.clearErrors();
            setData({
                branch_id: ctx.initial,
                type: state.type,
                quantity: state.type === 'adjustment' ? String(onHandAt(state.item, ctx, ctx.initial)) : '',
                unit_cost: state.item.unit_cost_cents ? String(state.item.unit_cost_cents / 100) : '',
                supplier_id: state.item.supplier_id ?? '',
                reference: '',
                note: '',
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state]);

    const amount = Number(data.quantity || 0);
    const onHand = item ? onHandAt(item, ctx, data.branch_id) : 0;
    const after = item ? (data.type === 'adjustment' ? amount : data.type === 'purchase' ? onHand + amount : onHand - amount) : 0;
    const branchName = ctx.branches.find((b) => b.id === data.branch_id)?.name;

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        if (!item) {
            return;
        }
        form.transform((d) => ({
            ...d,
            supplier_id: d.supplier_id === '' ? null : d.supplier_id,
            unit_cost: d.type === 'purchase' && d.unit_cost !== '' ? d.unit_cost : null,
        }));
        form.post(route('inventory.move', item.id), { preserveScroll: true, onSuccess: onClose });
    };

    return (
        <Modal show={state !== null} onClose={onClose} maxWidth="lg">
            {item && (
                <form onSubmit={submit}>
                    <DialogLayout
                        title={item.name}
                        description={`On hand${ctx.branches.length > 1 && branchName ? ` at ${branchName}` : ''}: ${qty(onHand)} ${item.unit}`}
                        footer={
                            <>
                                <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                                <PrimaryButton disabled={form.processing}>Save {MOVEMENT_LABELS[data.type]?.toLowerCase()}</PrimaryButton>
                            </>
                        }
                    >
                        <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
                            <Segmented
                                label="Type of change"
                                value={data.type}
                                options={MOVE_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                                onChange={(type) => setData((d) => ({ ...d, type, quantity: type === 'adjustment' ? String(onHandAt(item, ctx, d.branch_id)) : '' }))}
                            />
                        </div>
                        <p className="help">{MOVE_TYPES.find((t) => t.value === data.type)?.hint}</p>
                        {!ctx.fixed && (
                            <div className="mt-4">
                                <BranchField
                                    ctx={ctx}
                                    value={data.branch_id}
                                    onChange={(id) =>
                                        setData((d) => ({ ...d, branch_id: id, quantity: d.type === 'adjustment' ? String(onHandAt(item, ctx, id)) : d.quantity }))
                                    }
                                />
                            </div>
                        )}

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <Field
                                label={data.type === 'adjustment' ? `Counted on hand (${item.unit})` : `Quantity (${item.unit})`}
                                error={errors.quantity}
                                hint={data.quantity !== '' ? `On hand after: ${qty(Math.round(after * 1000) / 1000)} ${item.unit}` : undefined}
                            >
                                <input
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    required
                                    autoFocus
                                    className={inputClass}
                                    value={data.quantity}
                                    onChange={(e) => setData('quantity', e.target.value)}
                                />
                            </Field>
                            {data.type === 'purchase' && (
                                <Field
                                    label={`Cost per ${item.unit} (₱)`}
                                    error={errors.unit_cost}
                                    hint={amount && data.unit_cost ? `Total: ${peso(Math.round(amount * Number(data.unit_cost) * 100))}` : undefined}
                                >
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        className={inputClass}
                                        value={data.unit_cost}
                                        onChange={(e) => setData('unit_cost', e.target.value)}
                                    />
                                </Field>
                            )}
                            {(data.type === 'purchase' || data.type === 'return') && (
                                <Field label="Supplier" error={errors.supplier_id}>
                                    <select
                                        className={inputClass}
                                        value={data.supplier_id}
                                        onChange={(e) => setData('supplier_id', e.target.value === '' ? '' : Number(e.target.value))}
                                    >
                                        <option value="">None</option>
                                        {suppliers.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            )}
                            {(data.type === 'purchase' || data.type === 'return') && (
                                <Field label="Invoice / DR no." error={errors.reference}>
                                    <input className={inputClass} value={data.reference} onChange={(e) => setData('reference', e.target.value)} />
                                </Field>
                            )}
                            <Field
                                label={data.type === 'purchase' ? 'Note (optional)' : 'Reason (required)'}
                                error={errors.note}
                                className="sm:col-span-2"
                            >
                                <input
                                    required={data.type !== 'purchase'}
                                    className={inputClass}
                                    value={data.note}
                                    onChange={(e) => setData('note', e.target.value)}
                                    placeholder={
                                        data.type === 'adjustment' ? 'e.g. Weekly count' : data.type === 'waste' ? 'e.g. Expired, spilled' : ''
                                    }
                                />
                            </Field>
                        </div>
                    </DialogLayout>
                </form>
            )}
        </Modal>
    );
}

type ReceiveLine = { item_id: number | ''; quantity: string; unit_cost: string };

function ReceiveModal({
    show,
    items,
    suppliers,
    ctx,
    onClose,
}: {
    show: boolean;
    items: Item[];
    suppliers: { id: number; name: string }[];
    ctx: BranchCtx;
    onClose: () => void;
}) {
    const form = useForm({
        branch_id: ctx.initial,
        supplier_id: '' as number | '',
        reference: '',
        note: '',
        lines: [{ item_id: '', quantity: '', unit_cost: '' }] as ReceiveLine[],
    });
    const errors = form.errors as FieldErrors;
    const { data, setData } = form;

    useEffect(() => {
        if (show) {
            form.reset();
            form.setData('branch_id', ctx.initial);
            form.clearErrors();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show]);

    const setLine = (index: number, changes: Partial<ReceiveLine>) =>
        setData(
            'lines',
            data.lines.map((l, i) => (i === index ? { ...l, ...changes } : l)),
        );

    // Pick a supplier: suggest their items.
    const fromSupplier = data.supplier_id === '' ? items : items.filter((i) => i.supplier_id === data.supplier_id);
    const total = data.lines.reduce((sum, l) => sum + Math.round(Number(l.quantity || 0) * Number(l.unit_cost || 0) * 100), 0);
    const lineError = Object.entries(errors).find(([k]) => k.startsWith('lines'))?.[1];

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        form.transform((d) => ({
            ...d,
            supplier_id: d.supplier_id === '' ? null : d.supplier_id,
            lines: d.lines.filter((l) => l.item_id !== '').map((l) => ({ ...l, unit_cost: l.unit_cost === '' ? null : l.unit_cost })),
        }));
        form.post(route('inventory.receive'), { preserveScroll: true, onSuccess: onClose });
    };

    return (
        <Modal show={show} onClose={onClose}>
            <form onSubmit={submit}>
                <DialogLayout
                    title="Receive delivery"
                    description="Add everything that came in on one delivery receipt or invoice."
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <PrimaryButton disabled={form.processing || !data.lines.some((l) => l.item_id !== '')}>Receive stock</PrimaryButton>
                        </>
                    }
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        {!ctx.fixed && (
                            <div className="sm:col-span-2">
                                <BranchField ctx={ctx} value={data.branch_id} onChange={(id) => setData('branch_id', id)} label="Delivered to" />
                            </div>
                        )}
                        <Field label="Supplier" error={errors.supplier_id}>
                            <select
                                className={inputClass}
                                value={data.supplier_id}
                                onChange={(e) => setData('supplier_id', e.target.value === '' ? '' : Number(e.target.value))}
                            >
                                <option value="">None</option>
                                {suppliers.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Invoice / DR no." error={errors.reference}>
                            <input className={inputClass} value={data.reference} onChange={(e) => setData('reference', e.target.value)} />
                        </Field>
                    </div>

                    <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
                        <table className="min-w-full text-sm">
                            <thead className="border-b border-gray-200 bg-gray-50/80 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                                <tr>
                                    <th className="whitespace-nowrap px-3 py-2">Item</th>
                                    <th className="whitespace-nowrap px-3 py-2">Quantity</th>
                                    <th className="whitespace-nowrap px-3 py-2">Cost / unit (₱)</th>
                                    <th className="whitespace-nowrap px-3 py-2 text-right">Amount</th>
                                    <th>
                                        <span className="sr-only">Remove</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.lines.map((line, index) => {
                                    const item = items.find((i) => i.id === line.item_id);
                                    return (
                                        <tr key={index}>
                                            <td className="px-2 py-1.5">
                                                <select
                                                    aria-label="Item"
                                                    className="input min-w-[10rem] py-1.5"
                                                    value={line.item_id}
                                                    onChange={(e) => {
                                                        const picked = items.find((i) => i.id === Number(e.target.value));
                                                        setLine(index, {
                                                            item_id: picked?.id ?? '',
                                                            unit_cost: picked?.unit_cost_cents ? String(picked.unit_cost_cents / 100) : '',
                                                            quantity:
                                                                line.quantity || (picked?.reorder_quantity ? String(picked.reorder_quantity) : ''),
                                                        });
                                                    }}
                                                >
                                                    <option value="">Choose…</option>
                                                    {(fromSupplier.length ? fromSupplier : items).map((i) => (
                                                        <option key={i.id} value={i.id}>
                                                            {i.name} ({i.unit})
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.001"
                                                        aria-label="Quantity"
                                                        className="input w-24 py-1.5"
                                                        value={line.quantity}
                                                        onChange={(e) => setLine(index, { quantity: e.target.value })}
                                                    />
                                                    <span className="text-xs text-gray-500">{item?.unit}</span>
                                                </div>
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.0001"
                                                    aria-label="Cost per unit"
                                                    className="input w-28 py-1.5"
                                                    value={line.unit_cost}
                                                    onChange={(e) => setLine(index, { unit_cost: e.target.value })}
                                                />
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-gray-950">
                                                {peso(Math.round(Number(line.quantity || 0) * Number(line.unit_cost || 0) * 100))}
                                            </td>
                                            <td className="px-1">
                                                <button
                                                    type="button"
                                                    aria-label="Remove line"
                                                    onClick={() =>
                                                        setData(
                                                            'lines',
                                                            data.lines.filter((_, i) => i !== index),
                                                        )
                                                    }
                                                    disabled={data.lines.length === 1}
                                                    className="btn btn-ghost btn-sm btn-icon text-gray-400 hover:bg-red-50 hover:text-red-600"
                                                >
                                                    <Icon name="x" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="border-t border-gray-200 bg-gray-50/80 font-semibold text-gray-950">
                                <tr>
                                    <td className="px-2 py-1.5" colSpan={3}>
                                        <button
                                            type="button"
                                            onClick={() => setData('lines', [...data.lines, { item_id: '', quantity: '', unit_cost: '' }])}
                                            className="btn btn-ghost btn-sm text-brand-700 hover:text-brand-800"
                                        >
                                            <Icon name="plus" className="h-3.5 w-3.5" />
                                            Add line
                                        </button>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{peso(total)}</td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    {lineError && <p className="field-error">{lineError}</p>}

                    <Field label="Note (optional)" error={errors.note} className="mt-4">
                        <input className={inputClass} value={data.note} onChange={(e) => setData('note', e.target.value)} />
                    </Field>
                </DialogLayout>
            </form>
        </Modal>
    );
}

function BranchField({ ctx, value, onChange, label = 'Branch' }: { ctx: BranchCtx; value: number | ''; onChange: (id: number) => void; label?: string }) {
    return (
        <Field label={label}>
            <select className={inputClass} value={value} onChange={(e) => onChange(Number(e.target.value))} required>
                {ctx.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                        {b.name}
                    </option>
                ))}
            </select>
        </Field>
    );
}
