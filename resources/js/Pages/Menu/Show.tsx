import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import { computeTotals, formatMoney, formatPercent } from '@/lib/money';
import { formatPriceRange } from '@/lib/options';
import { SelectedOption } from '@/types/catalog';
import { Head } from '@inertiajs/react';
import { isAxiosError } from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/*
 * The menu a table's QR code opens on the customer's phone (no login).
 * Customers add items, check out paying by cash or QR, and follow their
 * orders. The server prices every order again; staff accept it, which
 * records the sale (a QR Ph payment records it as soon as it's paid).
 */

type OrderingState = 'open' | 'paused' | 'offline' | 'menu_only';
type PayMethod = 'cash' | 'qrph' | 'ewallet';

interface MenuSize {
    id: number;
    name: string;
    price_cents: number;
    sold_out: boolean;
}

interface MenuItem {
    id: number;
    category_id: number | null;
    name: string;
    image_url: string | null;
    price_cents: number;
    sizes: MenuSize[];
    sold_out: boolean;
}

interface CartLine {
    key: string;
    item: MenuItem;
    size: MenuSize | null;
    quantity: number;
    note: string;
}

interface PlacedOrder {
    token: string;
    status: 'new' | 'preparing' | 'ready' | 'served' | 'rejected';
    paid: boolean;
    payment_method: PayMethod;
    payment_status: 'unpaid' | 'awaiting' | 'paid';
    /** The PayMongo QR to scan while unpaid. */
    qr_image: string | null;
    note: string | null;
    subtotal_cents: number;
    total_cents: number;
    placed_at: string;
    items: { name: string; options: SelectedOption[]; quantity: number; note: string | null; line_total_cents: number }[];
}

interface Props {
    token: string;
    table: { name: string; branch: string | null };
    store: {
        name: string;
        address: string | null;
        currency: string;
        timezone: string;
        tax_rate_bps: number;
        prices_include_tax: boolean;
        service_charge_bps: number;
    };
    payments: { cash: boolean; qrph: boolean; ewallet: { label: string; image_url: string } | null };
    state: OrderingState;
    categories: { id: number; name: string }[];
    products: MenuItem[];
}

const POLL_MS = 6_000;
// While a QR payment is open, check sooner.
const PAYING_POLL_MS = 3_000;

const BANNERS: Record<Exclude<OrderingState, 'open'>, { title: string; text: string }> = {
    menu_only: { title: 'Please order at the counter', text: 'Take a look at the menu, then tell the staff what you’d like.' },
    paused: { title: 'Ordering from the table is paused', text: 'Please order at the counter for now. Thank you for waiting!' },
    offline: { title: 'The store can’t receive orders right now', text: 'Please order at the counter. You can still browse the menu.' },
};

const STEPS = ['Sent', 'Preparing', 'Ready', 'Served'] as const;
const STEP_OF: Record<PlacedOrder['status'], number> = { new: 0, preparing: 1, ready: 2, served: 3, rejected: -1 };

/** Order tokens placed from this phone at this table. Storage may be unavailable (private mode). */
const storageKey = (token: string) => `finstack-menu-orders:${token}`;
function loadTokens(token: string): string[] {
    try {
        const saved = JSON.parse(window.localStorage.getItem(storageKey(token)) ?? '[]');

        return Array.isArray(saved) ? saved.filter((t) => typeof t === 'string').slice(-20) : [];
    } catch {
        return [];
    }
}
function saveTokens(token: string, tokens: string[]): void {
    try {
        window.localStorage.setItem(storageKey(token), JSON.stringify(tokens.slice(-20)));
    } catch {
        // Orders still show until the page is closed.
    }
}

const errorOf = (error: unknown): string => {
    if (isAxiosError(error)) {
        const errors = error.response?.data?.errors as Record<string, string[]> | undefined;
        if (errors) {
            return Object.values(errors)[0]?.[0] ?? 'Please check your order.';
        }
        if (error.response?.status === 429) {
            return 'Too many tries. Please wait a moment.';
        }
        if (!error.response) {
            return 'No internet connection. Please try again.';
        }
    }

    return 'Something went wrong. Please try again or ask the staff.';
};

export default function MenuShow({ token, table, store, payments, state: initialState, categories, products }: Props) {
    const [state, setState] = useState<OrderingState>(initialState);
    const [categoryId, setCategoryId] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [cart, setCart] = useState<CartLine[]>([]);
    const [picking, setPicking] = useState<MenuItem | null>(null);
    // The order sheet: the cart, then how to pay.
    const [sheet, setSheet] = useState<'cart' | 'pay' | null>(null);
    const [method, setMethod] = useState<PayMethod>('cash');
    const [orderNote, setOrderNote] = useState('');
    const [placing, setPlacing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [tokens, setTokens] = useState<string[]>(() => loadTokens(token));
    const [orders, setOrders] = useState<PlacedOrder[]>([]);
    // The order whose QR payment is open.
    const [paying, setPaying] = useState<string | null>(null);
    const ordersRef = useRef<HTMLElement>(null);

    const money = (cents: number) => formatMoney(cents, store.currency);
    const canOrder = state === 'open';
    const payingOrder = orders.find((o) => o.token === paying) ?? null;

    const poll = useCallback(async () => {
        try {
            const { data } = await window.axios.get<{ state: OrderingState; orders: PlacedOrder[] }>(route('menu.state', token), { params: { orders: tokens } });
            setState(data.state);
            setOrders(data.orders);
        } catch {
            // Try again on the next round.
        }
    }, [token, tokens]);

    useEffect(() => {
        void poll();
        const timer = window.setInterval(() => void poll(), paying ? PAYING_POLL_MS : POLL_MS);

        return () => window.clearInterval(timer);
    }, [poll, paying]);

    useEffect(() => {
        if (!toast) {
            return;
        }
        const timer = window.setTimeout(() => setToast(null), 4000);

        return () => window.clearTimeout(timer);
    }, [toast]);

    // A QR Ph payment went through.
    useEffect(() => {
        if (payingOrder?.paid && payingOrder.payment_method === 'qrph') {
            setPaying(null);
            setToast('Paid! Your order is on its way to the kitchen.');
        }
    }, [payingOrder]);

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();

        return products.filter((p) => (categoryId === null || p.category_id === categoryId) && (term === '' || p.name.toLowerCase().includes(term)));
    }, [products, categoryId, search]);

    const units = cart.reduce((sum, l) => sum + l.quantity, 0);
    const subtotal = cart.reduce((sum, l) => sum + (l.size?.price_cents ?? l.item.price_cents) * l.quantity, 0);
    // What the store will charge (the server works it out again).
    const totals = computeTotals(subtotal, {
        tax_rate_bps: store.tax_rate_bps,
        prices_include_tax: store.prices_include_tax,
        service_charge_bps: store.service_charge_bps,
        discount_rate_bps: 0,
        discount_vat_exempt: false,
    });
    const inCart = (itemId: number) => cart.filter((l) => l.item.id === itemId).reduce((sum, l) => sum + l.quantity, 0);
    const qrAvailable = payments.qrph || payments.ewallet !== null;
    const qrMethod: PayMethod = payments.qrph ? 'qrph' : 'ewallet';

    const addLine = (item: MenuItem, size: MenuSize | null, quantity: number, note: string) => {
        const key = `${item.id}|${size?.id ?? ''}|${note.trim().toLowerCase()}`;
        setCart((lines) =>
            lines.some((l) => l.key === key)
                ? lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + quantity) } : l))
                : [...lines, { key, item, size, quantity, note: note.trim() }],
        );
        setToast(`Added ${quantity} × ${item.name}`);
    };

    const setQuantity = (key: string, quantity: number) =>
        setCart((lines) => (quantity <= 0 ? lines.filter((l) => l.key !== key) : lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, quantity) } : l))));

    const placeOrder = async () => {
        setPlacing(true);
        setError(null);
        try {
            const { data } = await window.axios.post<{ order: PlacedOrder }>(route('menu.order', token), {
                items: cart.map((l) => ({ product_id: l.item.id, size_id: l.size?.id ?? null, quantity: l.quantity, note: l.note || null })),
                note: orderNote.trim() || null,
                payment_method: method,
            });
            const next = [...tokens, data.order.token];
            saveTokens(token, next);
            setTokens(next);
            setOrders((list) => [data.order, ...list]);
            setCart([]);
            setOrderNote('');
            setSheet(null);
            if (method === 'cash') {
                setToast('Order sent! Please pay the staff in cash.');
                window.setTimeout(() => ordersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
            } else {
                setPaying(data.order.token);
            }
        } catch (e) {
            setError(errorOf(e));
            void poll();
        } finally {
            setPlacing(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-28">
            <Head title={`${store.name} · Menu`} />

            <header className="bg-gradient-to-br from-brand-600 to-brand-800 px-4 pb-6 pt-5 text-white">
                <div className="mx-auto max-w-3xl">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-wider text-white/70">Welcome to</p>
                            <h1 className="truncate text-2xl font-bold tracking-tight">{store.name}</h1>
                            {(table.branch || store.address) && <p className="mt-0.5 truncate text-sm text-white/75">{table.branch ?? store.address}</p>}
                        </div>
                        <span className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold ring-1 ring-white/30 backdrop-blur">{table.name}</span>
                    </div>
                    {canOrder && <p className="mt-3 text-sm text-white/85">Tap an item to add it, then check out and pay by cash or QR.</p>}
                </div>
            </header>

            <main className="mx-auto max-w-3xl px-4">
                {!canOrder && (
                    <div role="status" className="-mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
                        <p className="font-semibold">{BANNERS[state].title}</p>
                        <p className="text-sm text-amber-900">{BANNERS[state].text}</p>
                    </div>
                )}

                {orders.length > 0 && (
                    <section ref={ordersRef} aria-label="Your orders" className={`scroll-mt-4 space-y-3 ${canOrder ? '-mt-3' : 'mt-4'}`}>
                        {orders.map((order) => (
                            <OrderTracker
                                key={order.token}
                                order={order}
                                money={money}
                                timezone={store.timezone}
                                qrLabel={payments.ewallet?.label ?? 'QR'}
                                onPay={() => setPaying(order.token)}
                            />
                        ))}
                    </section>
                )}

                <div className="sticky top-0 z-10 -mx-4 mt-4 space-y-2.5 bg-gray-50/95 px-4 py-3 backdrop-blur">
                    <div className="relative">
                        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search the menu"
                            aria-label="Search the menu"
                            className="input h-11 rounded-full pl-9 text-base"
                        />
                    </div>
                    {categories.length > 0 && (
                        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5" role="group" aria-label="Categories">
                            <Chip active={categoryId === null} onClick={() => setCategoryId(null)}>
                                All
                            </Chip>
                            {categories.map((c) => (
                                <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                                    {c.name}
                                </Chip>
                            ))}
                        </div>
                    )}
                </div>

                <ul className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {visible.map((item) => {
                        const count = inCart(item.id);

                        return (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    disabled={item.sold_out || !canOrder}
                                    onClick={() => setPicking(item)}
                                    className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-gray-200 transition active:scale-[0.98] disabled:active:scale-100"
                                >
                                    {/* The whole picture, never cropped, on a soft backdrop. */}
                                    <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-gray-50">
                                        {item.image_url ? (
                                            <img
                                                src={item.image_url}
                                                alt=""
                                                loading="lazy"
                                                className={`h-full w-full object-contain p-2 ${item.sold_out ? 'opacity-40 grayscale' : ''}`}
                                            />
                                        ) : (
                                            <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-50 to-gray-100 text-4xl font-bold text-brand-300">
                                                {item.name[0]}
                                            </span>
                                        )}
                                        {item.sold_out && <span className="absolute inset-x-0 bottom-0 bg-gray-900/80 py-1 text-center text-xs font-semibold text-white">Sold out</span>}
                                        {count > 0 && (
                                            <span className="absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-600 px-2 text-sm font-bold text-white shadow">
                                                {count}
                                            </span>
                                        )}
                                    </span>
                                    <span className="flex flex-1 flex-col border-t border-gray-100 p-3">
                                        <span className="line-clamp-2 text-sm font-semibold leading-snug text-gray-950">{item.name}</span>
                                        <span className="mt-auto flex items-center justify-between gap-2 pt-2">
                                            <span className="text-sm font-bold tabular-nums text-gray-950">
                                                {item.sizes.length > 0 ? formatPriceRange(item.price_cents, item.sizes, store.currency) : money(item.price_cents)}
                                            </span>
                                            {canOrder && !item.sold_out && (
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm">
                                                    <Icon name="plus" />
                                                </span>
                                            )}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
                {visible.length === 0 && (
                    <p className="py-16 text-center text-sm text-gray-500">{products.length === 0 ? 'The menu is empty for now.' : 'Nothing matches your search.'}</p>
                )}

                <p className="mt-10 text-center text-xs text-gray-400">
                    Powered by <span className="font-semibold text-gray-500">FinstackPOS</span>
                </p>
            </main>

            {toast && (
                <div role="status" className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-sm rounded-full bg-gray-950 px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg">
                    {toast}
                </div>
            )}

            {canOrder && units > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgb(16_24_40/0.08)] backdrop-blur">
                    <div className="mx-auto max-w-3xl">
                        <button type="button" onClick={() => setSheet('cart')} className="btn btn-primary h-12 w-full justify-between rounded-full px-5 text-base">
                            <span className="inline-flex items-center gap-2">
                                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white/20 px-2 text-sm font-bold">{units}</span>
                                View order
                            </span>
                            <span className="tabular-nums">{money(subtotal)}</span>
                        </button>
                    </div>
                </div>
            )}

            <ItemSheet
                item={picking}
                money={money}
                currency={store.currency}
                onClose={() => setPicking(null)}
                onAdd={(size, quantity, note) => {
                    if (picking) {
                        addLine(picking, size, quantity, note);
                    }
                    setPicking(null);
                }}
            />

            {/* The order, then checkout. */}
            <Modal show={sheet !== null} onClose={() => setSheet(null)} maxWidth="md">
                <div className="flex max-h-[88vh] flex-col">
                    <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
                        {sheet === 'pay' && (
                            <button type="button" onClick={() => setSheet('cart')} className="btn btn-ghost btn-icon -ms-2" aria-label="Back to your order">
                                <Icon name="chevronLeft" className="h-5 w-5" />
                            </button>
                        )}
                        <div className="min-w-0 flex-1">
                            <h2 className="text-lg font-bold text-gray-950">{sheet === 'pay' ? 'Checkout' : 'Your order'}</h2>
                            <p className="text-sm text-gray-500">{table.name}</p>
                        </div>
                        <button type="button" onClick={() => setSheet(null)} className="btn btn-ghost btn-icon" aria-label="Close">
                            <Icon name="x" className="h-5 w-5" />
                        </button>
                    </div>

                    {sheet === 'cart' ? (
                        <>
                            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
                                <ul className="divide-y divide-gray-100">
                                    {cart.map((line) => (
                                        <li key={line.key} className="flex items-start gap-3 py-3">
                                            {line.item.image_url && (
                                                <img src={line.item.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-gray-50 object-contain p-1 ring-1 ring-gray-100" />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-gray-950">{line.item.name}</p>
                                                {line.size && <p className="text-sm text-gray-500">{line.size.name}</p>}
                                                {line.note && <p className="mt-0.5 text-sm italic text-gray-600">“{line.note}”</p>}
                                                <p className="mt-1 text-sm font-semibold tabular-nums text-gray-950">
                                                    {money((line.size?.price_cents ?? line.item.price_cents) * line.quantity)}
                                                </p>
                                            </div>
                                            <Stepper value={line.quantity} onChange={(q) => setQuantity(line.key, q)} label={line.item.name} />
                                        </li>
                                    ))}
                                </ul>
                                {cart.length === 0 && <p className="py-8 text-center text-sm text-gray-500">Your order is empty.</p>}
                                <label htmlFor="order-note" className="label mt-2">
                                    Anything else? <span className="font-normal text-gray-400">(optional)</span>
                                </label>
                                <textarea
                                    id="order-note"
                                    value={orderNote}
                                    onChange={(e) => setOrderNote(e.target.value)}
                                    maxLength={200}
                                    rows={2}
                                    placeholder="e.g. Serve the drinks first"
                                    className="input mt-1 text-base"
                                />
                            </div>
                            <div className="border-t border-gray-100 px-5 py-4">
                                <div className="mb-3 flex items-baseline justify-between">
                                    <span className="text-sm text-gray-600">Subtotal</span>
                                    <span className="text-xl font-bold tabular-nums text-gray-950">{money(subtotal)}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setError(null);
                                        setSheet('pay');
                                    }}
                                    disabled={cart.length === 0 || !canOrder}
                                    className="btn btn-primary h-12 w-full rounded-full text-base"
                                >
                                    Checkout
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                                <p className="text-sm font-semibold text-gray-950">How will you pay?</p>
                                <div className="mt-2 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Payment method">
                                    <PayOption
                                        active={method === 'cash'}
                                        onClick={() => setMethod('cash')}
                                        icon="cash"
                                        title="Cash"
                                        hint="Pay the staff when they confirm your order"
                                    />
                                    <PayOption
                                        active={method !== 'cash'}
                                        onClick={() => setMethod(qrMethod)}
                                        icon="qrCode"
                                        title={payments.qrph ? 'QR Ph' : (payments.ewallet?.label ?? 'QR')}
                                        hint={qrAvailable ? (payments.qrph ? 'GCash, Maya, or any bank app' : 'Scan the store’s QR') : 'Not available here'}
                                        disabled={!qrAvailable}
                                    />
                                </div>

                                <dl className="mt-5 space-y-1.5 rounded-xl bg-gray-50 px-4 py-3 text-sm">
                                    <Row label="Subtotal" value={money(subtotal)} />
                                    {totals.serviceCharge > 0 && <Row label={`Service charge (${formatPercent(store.service_charge_bps)})`} value={money(totals.serviceCharge)} />}
                                    {!store.prices_include_tax && totals.tax > 0 && <Row label={`VAT (${formatPercent(store.tax_rate_bps)})`} value={money(totals.tax)} />}
                                    <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
                                        <dt className="font-semibold text-gray-950">Total</dt>
                                        <dd className="text-xl font-bold tabular-nums text-gray-950">{money(totals.total)}</dd>
                                    </div>
                                </dl>
                                <p className="mt-3 text-xs text-gray-500">Senior Citizen or PWD? Please order at the counter so the discount can be applied.</p>
                                {error && (
                                    <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                                        {error}
                                    </p>
                                )}
                            </div>
                            <div className="border-t border-gray-100 px-5 py-4">
                                <button
                                    type="button"
                                    onClick={() => void placeOrder()}
                                    disabled={placing || cart.length === 0 || !canOrder}
                                    className="btn btn-primary h-12 w-full justify-between rounded-full px-5 text-base"
                                >
                                    <span>{placing ? 'Sending…' : method === 'cash' ? 'Place order' : 'Place order & pay'}</span>
                                    <span className="tabular-nums">{money(totals.total)}</span>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </Modal>

            {/* Paying an order by QR. */}
            <Modal show={payingOrder !== null && !payingOrder.paid} onClose={() => setPaying(null)} maxWidth="sm">
                {payingOrder && (
                    <QrPayment
                        order={payingOrder}
                        money={money}
                        token={token}
                        store={store.name}
                        ewallet={payments.ewallet}
                        onDone={(updated) => {
                            setOrders((list) => list.map((o) => (o.token === updated.token ? updated : o)));
                            setPaying(null);
                            setToast('Thank you! The staff will confirm your payment.');
                        }}
                        onClose={() => setPaying(null)}
                    />
                )}
            </Modal>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3 text-gray-600">
            <dt>{label}</dt>
            <dd className="tabular-nums text-gray-900">{value}</dd>
        </div>
    );
}

function PayOption({
    active,
    onClick,
    icon,
    title,
    hint,
    disabled = false,
}: {
    active: boolean;
    onClick: () => void;
    icon: 'cash' | 'qrCode';
    title: string;
    hint: string;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={onClick}
            className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-gray-200 bg-white'
            }`}
        >
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${active ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                <Icon name={icon} className="h-5 w-5" />
            </span>
            <span className="font-semibold text-gray-950">{title}</span>
            <span className="text-xs leading-snug text-gray-500">{hint}</span>
        </button>
    );
}

/**
 * QR Ph: the PayMongo code to scan; the page notices the payment by itself.
 * The store's own QR: scan it, then say it's paid (staff check it).
 */
function QrPayment({
    order,
    money,
    token,
    store,
    ewallet,
    onDone,
    onClose,
}: {
    order: PlacedOrder;
    money: (cents: number) => string;
    token: string;
    store: string;
    ewallet: { label: string; image_url: string } | null;
    onDone: (order: PlacedOrder) => void;
    onClose: () => void;
}) {
    const [reference, setReference] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const manual = order.payment_method === 'ewallet';
    const image = manual ? ewallet?.image_url : order.qr_image;

    const markPaid = async () => {
        setSending(true);
        setError(null);
        try {
            const { data } = await window.axios.post<{ order: PlacedOrder }>(route('menu.paid', token), { order: order.token, reference: reference.trim() || null });
            onDone(data.order);
        } catch (e) {
            setError(errorOf(e));
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="p-5 text-center">
            <div className="flex items-start justify-between gap-3 text-left">
                <div>
                    <h2 className="text-lg font-bold text-gray-950">Pay {money(order.total_cents)}</h2>
                    <p className="text-sm text-gray-500">{manual ? `Scan with ${ewallet?.label ?? 'your e-wallet'}` : 'Scan with GCash, Maya, or your bank app'}</p>
                </div>
                <button type="button" onClick={onClose} className="btn btn-ghost btn-icon -me-2 -mt-1" aria-label="Close">
                    <Icon name="x" className="h-5 w-5" />
                </button>
            </div>

            {image ? (
                <img src={image} alt={`QR code to pay ${store}`} className="mx-auto mt-4 aspect-square w-64 max-w-full rounded-xl bg-white object-contain p-2 ring-1 ring-gray-200" />
            ) : (
                <p className="mt-6 rounded-lg bg-amber-50 px-3 py-4 text-sm text-amber-900">The QR code isn’t available. Please pay the staff instead.</p>
            )}
            <p className="mt-3 text-xs text-gray-500">Tip: take a screenshot, then open it in your e-wallet app.</p>

            {manual ? (
                <div className="mt-4 space-y-3 text-left">
                    {order.payment_status === 'awaiting' ? (
                        <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">Thanks! The staff will confirm your payment.</p>
                    ) : (
                        <>
                            <label className="label" htmlFor="pay-reference">
                                Reference no. <span className="font-normal text-gray-400">(optional)</span>
                            </label>
                            <input
                                id="pay-reference"
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                                maxLength={100}
                                inputMode="numeric"
                                placeholder="From your payment receipt"
                                className="input text-base"
                            />
                            {error && <p className="field-error">{error}</p>}
                            <button type="button" onClick={() => void markPaid()} disabled={sending} className="btn btn-primary h-12 w-full rounded-full text-base">
                                <Icon name="check" />
                                {sending ? 'Sending…' : 'Done, I’ve paid'}
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <p className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-gray-700">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-600" />
                    Waiting for your payment…
                </p>
            )}
        </div>
    );
}

function ItemSheet({
    item,
    money,
    currency,
    onClose,
    onAdd,
}: {
    item: MenuItem | null;
    money: (cents: number) => string;
    currency: string;
    onClose: () => void;
    onAdd: (size: MenuSize | null, quantity: number, note: string) => void;
}) {
    const [sizeId, setSizeId] = useState<number | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [note, setNote] = useState('');

    useEffect(() => {
        if (item) {
            setSizeId(item.sizes.find((s) => !s.sold_out)?.id ?? null);
            setQuantity(1);
            setNote('');
        }
    }, [item]);

    const size = item?.sizes.find((s) => s.id === sizeId) ?? null;
    const price = size?.price_cents ?? item?.price_cents ?? 0;
    const ready = item !== null && (item.sizes.length === 0 || size !== null);

    return (
        <Modal show={item !== null} onClose={onClose} maxWidth="md">
            {item && (
                <div className="flex max-h-[88vh] flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {item.image_url && (
                            <div className="flex h-64 items-center justify-center bg-gray-50 sm:h-72">
                                <img src={item.image_url} alt="" className="h-full w-full object-contain p-4" />
                            </div>
                        )}
                        <div className="px-5 pt-4">
                            <div className="flex items-start justify-between gap-3">
                                <h2 className="text-xl font-bold text-gray-950">{item.name}</h2>
                                <button type="button" onClick={onClose} className="btn btn-ghost btn-icon -me-2 -mt-1" aria-label="Close">
                                    <Icon name="x" className="h-5 w-5" />
                                </button>
                            </div>
                            <p className="text-base font-semibold tabular-nums text-gray-700">
                                {item.sizes.length > 0 ? formatPriceRange(item.price_cents, item.sizes, currency) : money(item.price_cents)}
                            </p>

                            {item.sizes.length > 0 && (
                                <fieldset className="mt-4">
                                    <legend className="text-sm font-semibold text-gray-950">Choose a size</legend>
                                    <div className="mt-2 space-y-2">
                                        {item.sizes.map((s) => (
                                            <label
                                                key={s.id}
                                                className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${s.sold_out ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${
                                                    sizeId === s.id ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-gray-200'
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="size"
                                                    className="text-brand-600 focus:ring-brand-500"
                                                    checked={sizeId === s.id}
                                                    disabled={s.sold_out}
                                                    onChange={() => setSizeId(s.id)}
                                                />
                                                <span className="flex-1 font-medium text-gray-950">{s.name}</span>
                                                <span className="text-sm tabular-nums text-gray-700">{s.sold_out ? 'Sold out' : money(s.price_cents)}</span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                            )}

                            <label htmlFor="item-note" className="label mt-4">
                                Special request <span className="font-normal text-gray-400">(optional)</span>
                            </label>
                            <input
                                id="item-note"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                maxLength={120}
                                placeholder="e.g. Less ice, no onions"
                                className="input mt-1 text-base"
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-3 border-t border-gray-100 px-5 py-4">
                        <Stepper value={quantity} min={1} onChange={setQuantity} label={item.name} />
                        <button
                            type="button"
                            disabled={!ready}
                            onClick={() => onAdd(size, quantity, note)}
                            className="btn btn-primary h-12 flex-1 justify-between rounded-full px-5 text-base"
                        >
                            <span>Add</span>
                            <span className="tabular-nums">{money(price * quantity)}</span>
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

function OrderTracker({
    order,
    money,
    timezone,
    qrLabel,
    onPay,
}: {
    order: PlacedOrder;
    money: (cents: number) => string;
    timezone: string;
    qrLabel: string;
    onPay: () => void;
}) {
    const step = STEP_OF[order.status];
    const waitingToPay = !order.paid && order.payment_method !== 'cash' && order.payment_status === 'unpaid' && order.status !== 'rejected';
    const headline =
        order.status === 'rejected'
            ? 'The store couldn’t take this order. Please ask the staff.'
            : waitingToPay
              ? 'Waiting for your payment'
              : {
                    new: order.paid ? 'Paid. Waiting for the staff to confirm…' : 'Sent. Waiting for the staff to confirm…',
                    preparing: 'Confirmed! Being prepared',
                    ready: 'Ready! On its way to your table',
                    served: 'Served. Enjoy!',
                    rejected: '',
                }[order.status];
    const payment = order.paid
        ? `Paid · ${order.payment_method === 'cash' ? 'Cash' : order.payment_method === 'qrph' ? 'QR Ph' : qrLabel}`
        : order.payment_method === 'cash'
          ? 'Pay the staff in cash'
          : order.payment_status === 'awaiting'
            ? 'Payment sent · the staff will confirm it'
            : 'Not paid yet';

    return (
        <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
            <div className="flex items-start justify-between gap-3">
                <p className={`text-sm font-semibold ${order.status === 'rejected' ? 'text-red-700' : order.status === 'ready' ? 'text-emerald-700' : 'text-gray-950'}`}>
                    {headline}
                </p>
                <p className="shrink-0 text-xs text-gray-500">{new Date(order.placed_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: timezone })}</p>
            </div>
            {step >= 0 && !waitingToPay && (
                <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Order progress">
                    {STEPS.map((label, i) => (
                        <li key={label} className="text-center">
                            <span className={`block h-1.5 rounded-full ${i <= step ? 'bg-brand-600' : 'bg-gray-200'} ${i === step && step < 3 ? 'animate-pulse' : ''}`} />
                            <span className={`mt-1 block text-[11px] ${i <= step ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>{label}</span>
                        </li>
                    ))}
                </ol>
            )}
            <ul className="mt-3 space-y-1 text-sm text-gray-700">
                {order.items.map((item, i) => (
                    <li key={i} className="flex justify-between gap-3">
                        <span className="min-w-0">
                            {item.quantity}× {item.name}
                            {item.options.length > 0 && <span className="text-gray-500"> ({item.options.map((o) => o.value).join(', ')})</span>}
                            {item.note && <span className="block text-xs italic text-gray-500">“{item.note}”</span>}
                        </span>
                        <span className="shrink-0 tabular-nums">{money(item.line_total_cents)}</span>
                    </li>
                ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                <span className={`text-xs font-medium ${order.paid ? 'text-emerald-700' : 'text-gray-600'}`}>{payment}</span>
                <span className="text-sm font-bold tabular-nums text-gray-950">{money(order.total_cents)}</span>
            </div>
            {waitingToPay && (
                <button type="button" onClick={onPay} className="btn btn-primary mt-3 h-11 w-full rounded-full">
                    <Icon name="qrCode" />
                    Pay now
                </button>
            )}
        </article>
    );
}

function Stepper({ value, onChange, label, min = 0 }: { value: number; onChange: (value: number) => void; label: string; min?: number }) {
    return (
        <div className="inline-flex shrink-0 items-center rounded-full border border-gray-300 bg-white">
            <button
                type="button"
                aria-label={`One less ${label}`}
                onClick={() => onChange(Math.max(min, value - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-full text-gray-700 active:bg-gray-100"
            >
                <Icon name={value <= 1 && min === 0 ? 'trash' : 'minus'} />
            </button>
            <span className="w-7 text-center font-semibold tabular-nums" aria-live="polite">
                {value}
            </span>
            <button
                type="button"
                aria-label={`One more ${label}`}
                onClick={() => onChange(Math.min(50, value + 1))}
                className="flex h-10 w-10 items-center justify-center rounded-full text-gray-700 active:bg-gray-100"
            >
                <Icon name="plus" />
            </button>
        </div>
    );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors ${
                active ? 'bg-gray-950 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200'
            }`}
        >
            {children}
        </button>
    );
}
