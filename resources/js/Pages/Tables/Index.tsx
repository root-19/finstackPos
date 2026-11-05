import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';
import { Alert, Badge, CardHeader, ConfirmDialog, DialogLayout, EmptyState, Field } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import QRCode from 'qrcode';
import { FormEventHandler, useEffect, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';

interface TableRow {
    id: number;
    name: string;
    branch_id: number | null;
    url: string;
}

type OrderingState = 'open' | 'paused' | 'offline' | 'menu_only';

interface BranchRow {
    id: number;
    name: string;
    is_active: boolean;
    state: OrderingState;
}

type Props = {
    tables: TableRow[];
    branches: BranchRow[];
    ordering: { enabled: boolean; subscribed: boolean };
    store: { name: string };
};

const STATE_TEXT: Record<OrderingState, { tone: 'green' | 'amber' | 'gray'; label: string; text: string }> = {
    open: { tone: 'green', label: 'Taking orders', text: 'Customers can order from their table right now.' },
    paused: { tone: 'amber', label: 'Paused', text: 'Staff paused orders on the Table Orders screen. Customers are asked to order at the counter.' },
    offline: {
        tone: 'amber',
        label: 'No device online',
        text: 'Open the POS or Table Orders of this branch on a device with internet so orders can come in. Until then customers are asked to order at the counter.',
    },
    menu_only: { tone: 'gray', label: 'Menu only', text: 'The QR codes show your menu. Customers order at the counter.' },
};

export default function TablesIndex({ tables, branches, ordering, store }: PageProps<Props>) {
    const errors = usePage().props.errors as Record<string, string>;
    const [renaming, setRenaming] = useState<TableRow | null>(null);
    const [deleting, setDeleting] = useState<TableRow | null>(null);
    const [renewing, setRenewing] = useState<TableRow | null>(null);
    const [printing, setPrinting] = useState<TableRow[] | null>(null);
    const firstBranch = branches.find((b) => b.is_active)?.id ?? branches[0]?.id ?? '';
    const add = useForm({ name: '', branch_id: firstBranch });
    const bulk = useForm({ count: '10', branch_id: firstBranch });
    // Several branches: each table says which one it belongs to.
    const multi = branches.length > 1;
    const branchName = (id: number | null) => branches.find((b) => b.id === id)?.name ?? '';
    const state = STATE_TEXT[branches[0]?.state ?? 'menu_only'];
    const takesOrders = ordering.subscribed && ordering.enabled;

    const submitAdd: FormEventHandler = (e) => {
        e.preventDefault();
        add.post(route('tables.store'), { preserveScroll: true, onSuccess: () => add.reset() });
    };

    const submitBulk: FormEventHandler = (e) => {
        e.preventDefault();
        bulk.post(route('tables.bulk'), { preserveScroll: true });
    };

    const setEnabled = (enabled: boolean) =>
        router.put(route('tables.settings'), { table_ordering_enabled: enabled }, { preserveScroll: true });

    /** Render the cards with their codes, then open the print dialog. */
    const print = async (rows: TableRow[]) => {
        const codes = await Promise.all(rows.map((t) => qrDataUrl(t.url)));
        flushSync(() => setPrinting(rows.map((t, i) => ({ ...t, url: codes[i] }))));
        // Every code drawn before the print preview is taken.
        await Promise.all([...document.querySelectorAll<HTMLImageElement>('#receipt-print img')].map((img) => img.decode().catch(() => undefined)));
        window.print();
        setPrinting(null);
    };

    return (
        <AuthenticatedLayout header={<PageHeader title="Tables & QR" subtitle="A QR code on each table opens your menu on the customer's phone" />}>
            <Head title="Tables & QR" />

            <div className="app-page">
                <div className="mx-auto w-full max-w-5xl space-y-5">
                    <section className="card">
                        <CardHeader
                            title="Order from the table"
                            subtitle="Customers scan, order, and track their food on their own phone. No app, no login."
                            actions={
                                !ordering.subscribed ? (
                                    <Badge tone="brand">Pro</Badge>
                                ) : multi ? (
                                    <Badge tone={ordering.enabled ? 'green' : 'gray'}>{ordering.enabled ? 'On' : 'Off'}</Badge>
                                ) : (
                                    <Badge tone={state.tone}>{state.label}</Badge>
                                )
                            }
                        />
                        <div className="card-body space-y-4">
                            {ordering.subscribed ? (
                                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:bg-gray-50">
                                    <input
                                        type="checkbox"
                                        className="checkbox mt-0.5"
                                        checked={ordering.enabled}
                                        onChange={(e) => setEnabled(e.target.checked)}
                                    />
                                    <span>
                                        <span className="block text-sm font-medium text-gray-950">Take orders from the table QR codes</span>
                                        <span className="block text-sm text-gray-500">
                                            Off: the codes show your menu only. On: orders arrive on the POS and on Table Orders, with a sound.
                                        </span>
                                    </span>
                                </label>
                            ) : (
                                <Alert tone="blue" title="Free plan: your QR codes show the menu">
                                    Upgrade to FinstackPOS Pro (or start the free trial) to let customers order and call staff from their table.{' '}
                                    <Link href={route('subscription.index')} className="font-semibold underline">
                                        See plans
                                    </Link>
                                </Alert>
                            )}
                            {errors.table_ordering_enabled && <p className="field-error">{errors.table_ordering_enabled}</p>}
                            {takesOrders && !multi && <p className="text-sm text-gray-600">{state.text}</p>}
                            {takesOrders && multi && (
                                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                                    {branches.map((b) => (
                                        <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                                            <span className="font-medium text-gray-950">{b.name}</span>
                                            <Badge tone={STATE_TEXT[b.state].tone}>{STATE_TEXT[b.state].label}</Badge>
                                            {b.state === 'offline' && <span className="text-xs text-gray-500">Open its POS or Table Orders.</span>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <ol className="grid gap-3 text-sm text-gray-700 sm:grid-cols-3">
                                {[
                                    ['Add your tables', 'Then print the codes and place one on each table.'],
                                    ['Customers scan and order', 'They pick items, sizes, and notes, and see when it’s ready.'],
                                    ['Accept, serve, and charge', 'From the POS or any staff phone. The table pays one bill.'],
                                ].map(([title, text], i) => (
                                    <li key={title} className="flex gap-3 rounded-lg bg-surface px-3 py-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                                            {i + 1}
                                        </span>
                                        <span>
                                            <span className="block font-medium text-gray-950">{title}</span>
                                            <span className="text-gray-500">{text}</span>
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </section>

                    <section className="card">
                        <div className="card-body grid gap-4 md:grid-cols-2">
                            <form onSubmit={submitAdd}>
                                <Field label="Add a table" htmlFor="new-table" error={add.errors.name} hint="A name the staff will recognize, like “Table 7” or “Patio 2”.">
                                    <div className="flex gap-2">
                                        <TextInput
                                            id="new-table"
                                            value={add.data.name}
                                            onChange={(e) => add.setData('name', e.target.value)}
                                            placeholder="e.g. Table 7"
                                            maxLength={40}
                                            className="min-w-0 flex-1"
                                            required
                                        />
                                        {multi && <BranchSelect branches={branches} value={add.data.branch_id} onChange={(id) => add.setData('branch_id', id)} />}
                                        <button type="submit" disabled={add.processing} className="btn btn-primary shrink-0">
                                            <Icon name="plus" />
                                            Add
                                        </button>
                                    </div>
                                </Field>
                            </form>
                            <form onSubmit={submitBulk}>
                                <Field label="Or add several at once" htmlFor="bulk-count" error={bulk.errors.count} hint="Adds “Table 1”, “Table 2”… skipping names you already have.">
                                    <div className="flex gap-2">
                                        <TextInput
                                            id="bulk-count"
                                            type="number"
                                            min={1}
                                            max={50}
                                            value={bulk.data.count}
                                            onChange={(e) => bulk.setData('count', e.target.value)}
                                            className="w-24"
                                            required
                                        />
                                        {multi && <BranchSelect branches={branches} value={bulk.data.branch_id} onChange={(id) => bulk.setData('branch_id', id)} />}
                                        <button type="submit" disabled={bulk.processing} className="btn btn-secondary shrink-0">
                                            Add tables
                                        </button>
                                    </div>
                                </Field>
                            </form>
                        </div>
                    </section>

                    {tables.length === 0 ? (
                        <section className="card">
                            <EmptyState icon={<Icon name="qrCode" className="h-5 w-5" />} title="No tables yet">
                                Add your tables above. Each one gets its own QR code.
                            </EmptyState>
                        </section>
                    ) : (
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-950">
                                Your tables
                                <Badge className="tabular-nums">{tables.length}</Badge>
                            </h2>
                            <button type="button" onClick={() => void print(tables)} className="btn btn-secondary">
                                <Icon name="printer" />
                                Print all QR codes
                            </button>
                        </div>
                    )}

                    {tables.length > 0 && (
                        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {tables.map((table) => (
                                <li key={table.id} className="card flex flex-col p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-base font-semibold text-gray-950" title={table.name}>
                                                {table.name}
                                            </p>
                                            {multi && <p className="truncate text-xs text-gray-500">{branchName(table.branch_id)}</p>}
                                        </div>
                                        <div className="flex shrink-0 gap-0.5">
                                            <IconButton label={`Rename ${table.name}`} icon="pencil" onClick={() => setRenaming(table)} />
                                            <IconButton label={`New QR code for ${table.name}`} icon="refresh" onClick={() => setRenewing(table)} />
                                            <IconButton label={`Delete ${table.name}`} icon="trash" danger onClick={() => setDeleting(table)} />
                                        </div>
                                    </div>
                                    <QrImage url={table.url} className="mx-auto my-3 w-40" />
                                    <div className="mt-auto grid grid-cols-2 gap-2">
                                        <button type="button" onClick={() => void print([table])} className="btn btn-secondary btn-sm">
                                            <Icon name="printer" />
                                            Print
                                        </button>
                                        <a href={table.url} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">
                                            Open menu
                                            <Icon name="chevronRight" className="h-3.5 w-3.5" />
                                        </a>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <RenameModal table={renaming} branches={multi ? branches : []} onClose={() => setRenaming(null)} />

            <ConfirmDialog
                show={renewing !== null}
                title={`New QR code for ${renewing?.name ?? 'this table'}?`}
                confirmLabel="Make a new code"
                onConfirm={() => renewing && router.post(route('tables.regenerate', renewing.id), {}, { preserveScroll: true, onSuccess: () => setRenewing(null) })}
                onClose={() => setRenewing(null)}
            >
                The printed code on this table will stop working. Use this if someone copied the code; then print the new one.
            </ConfirmDialog>

            <ConfirmDialog
                show={deleting !== null}
                title={`Delete ${deleting?.name ?? 'table'}?`}
                confirmLabel="Delete table"
                onConfirm={() => deleting && router.delete(route('tables.destroy', deleting.id), { preserveScroll: true, onSuccess: () => setDeleting(null) })}
                onClose={() => setDeleting(null)}
            >
                Its QR code will stop working. Past orders keep the table's name.
            </ConfirmDialog>

            {printing &&
                createPortal(
                    // Printed through the receipt slot: app.css hides everything else when printing.
                    <div id="receipt-print">
                        <style>{'@page { size: A4; margin: 12mm; }'}</style>
                        <div className="grid grid-cols-2 gap-6">
                            {printing.map((table) => (
                                <div key={table.id} className="flex break-inside-avoid flex-col items-center rounded-2xl border-2 border-black px-6 py-7 text-center text-black">
                                    <p className="text-lg font-bold">{store.name}</p>
                                    <p className="mt-1 text-2xl font-extrabold">{takesOrders ? 'Scan to order' : 'Scan for our menu'}</p>
                                    <img src={table.url} alt="" className="mt-4 w-56" />
                                    <p className="mt-3 text-3xl font-black">{table.name}</p>
                                    {multi && <p className="text-sm font-semibold">{branchName(table.branch_id)}</p>}
                                    <p className="mt-2 text-sm">Open your phone camera and point it at the code.</p>
                                    <p className="mt-3 text-[10px]">Powered by FinstackPOS</p>
                                </div>
                            ))}
                        </div>
                    </div>,
                    document.body,
                )}
        </AuthenticatedLayout>
    );
}

const LOGO = '/brand/fb-profile-black.png';
let logo: Promise<HTMLImageElement | null> | null = null;
const loadLogo = () =>
    (logo ??= new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = LOGO;
    }));

/**
 * The table's QR code with the FinstackPOS logo in the middle. Level H error
 * correction rebuilds up to 30% of the code; the logo and its white border
 * cover under 8%, so phones still read it easily.
 */
async function qrDataUrl(url: string): Promise<string> {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, url, { width: 640, margin: 1, errorCorrectionLevel: 'H' });
    const img = await loadLogo();
    const ctx = canvas.getContext('2d');

    if (img && ctx) {
        const size = Math.round(canvas.width * 0.22);
        const at = (canvas.width - size) / 2;
        const border = Math.round(size * 0.12);

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.roundRect(at - border, at - border, size + border * 2, size + border * 2, size * 0.28);
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(at, at, size, size, size * 0.22);
        ctx.clip();
        // The logo file has wide margins around the F: use its middle.
        ctx.drawImage(img, 240, 240, 600, 600, at, at, size, size);
        ctx.restore();
    }

    return canvas.toDataURL('image/png');
}

function QrImage({ url, className }: { url: string; className?: string }) {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        let current = true;
        void qrDataUrl(url).then((data) => current && setSrc(data));

        return () => {
            current = false;
        };
    }, [url]);

    return src ? (
        <img src={src} alt="QR code" className={className} />
    ) : (
        <span className={`block aspect-square animate-pulse rounded bg-gray-100 ${className}`} />
    );
}

function IconButton({ label, icon, danger = false, onClick }: { label: string; icon: 'pencil' | 'refresh' | 'trash'; danger?: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className={`btn btn-ghost btn-sm btn-icon w-8 text-gray-500 ${danger ? 'hover:bg-red-50 hover:text-red-600' : ''}`}
        >
            <Icon name={icon} />
        </button>
    );
}

function BranchSelect({ branches, value, onChange }: { branches: BranchRow[]; value: number | ''; onChange: (id: number) => void }) {
    return (
        <select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Branch" className="input w-auto min-w-0 max-w-[10rem] pe-8">
            {branches.map((b) => (
                <option key={b.id} value={b.id}>
                    {b.name}
                </option>
            ))}
        </select>
    );
}

function RenameModal({ table, branches, onClose }: { table: TableRow | null; branches: BranchRow[]; onClose: () => void }) {
    const { data, setData, put, processing, errors, clearErrors } = useForm({ name: '', branch_id: '' as number | '' });

    useEffect(() => {
        if (table) {
            setData({ name: table.name, branch_id: table.branch_id ?? '' });
            clearErrors();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [table]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        if (table) {
            put(route('tables.update', table.id), { preserveScroll: true, onSuccess: () => onClose() });
        }
    };

    return (
        <Modal show={table !== null} onClose={onClose} maxWidth="md">
            <form onSubmit={submit}>
                <DialogLayout
                    title="Edit table"
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <PrimaryButton type="submit" disabled={processing}>
                                Save
                            </PrimaryButton>
                        </>
                    }
                >
                    <div className="space-y-4">
                        <Field label="Name" htmlFor="rename-table" error={errors.name} required>
                            <TextInput id="rename-table" value={data.name} maxLength={40} onChange={(e) => setData('name', e.target.value)} isFocused required />
                        </Field>
                        {branches.length > 0 && (
                            <Field label="Branch" error={errors.branch_id} hint="Its orders go to this branch's POS.">
                                <BranchSelect branches={branches} value={data.branch_id} onChange={(id) => setData('branch_id', id)} />
                            </Field>
                        )}
                    </div>
                </DialogLayout>
            </form>
        </Modal>
    );
}
