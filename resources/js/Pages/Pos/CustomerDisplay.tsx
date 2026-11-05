import { Icon } from '@/Components/NavIcons';
import { displaySupported, DisplayState, useDisplaySubscriber } from '@/lib/customerDisplay';
import { formatMoney } from '@/lib/money';
import { Head } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';

type Store = {
    id: number;
    name: string;
    address: string | null;
    contact_number: string | null;
    currency: string;
    receipt_footer: string | null;
};

/** How long the thank-you screen stays before the welcome screen returns. */
const THANK_YOU_MS = 12000;

/**
 * The customer-facing screen of a dual-monitor register. Open it from the
 * register ("Customer display"), move the window to the second monitor, and
 * make it full screen. It shows only what the register sends it.
 */
export default function CustomerDisplay({ store }: { store: Store }) {
    const terminal = new URLSearchParams(window.location.search).get('terminal') ?? 'default';
    const { state, connected } = useDisplaySubscriber(store.id, terminal);
    const money = (cents: number) => formatMoney(cents, store.currency);
    const [thanked, setThanked] = useState<string | null>(null);
    const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
    const listRef = useRef<HTMLUListElement>(null);

    // Leave the thank-you screen after a while, even if the register's dialog stays open.
    const paidRef = state.phase === 'paid' ? state.reference : null;
    useEffect(() => {
        if (!paidRef) {
            setThanked(null);
            return;
        }
        const timer = window.setTimeout(() => setThanked(paidRef), THANK_YOU_MS);

        return () => window.clearTimeout(timer);
    }, [paidRef]);

    useEffect(() => {
        const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', onChange);

        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    // Keep the newest line in view.
    const lineCount = state.phase === 'cart' || state.phase === 'paying' ? state.lines.length : 0;
    useEffect(() => {
        listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
    }, [lineCount]);

    const shown: DisplayState = state.phase === 'paid' && thanked === state.reference ? { phase: 'idle' } : state;

    return (
        <div className="flex h-[100dvh] flex-col overflow-hidden bg-white text-gray-950 [cursor:default]">
            <Head title="Customer display" />

            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-[3vw] py-[2vh]">
                <div className="flex min-w-0 items-center gap-3">
                    <img src="/brand/fb-profile-black.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
                    <span className="truncate text-[clamp(1.1rem,1.8vw,1.75rem)] font-semibold tracking-tight">{store.name}</span>
                </div>
                {!fullscreen && (
                    <button
                        type="button"
                        onClick={() => void document.documentElement.requestFullscreen?.()}
                        className="btn btn-secondary btn-sm shrink-0"
                    >
                        <Icon name="expand" />
                        Full screen
                    </button>
                )}
            </header>

            <main className="min-h-0 flex-1">
                {shown.phase === 'idle' && <Welcome store={store} connected={connected} />}
                {(shown.phase === 'cart' || shown.phase === 'paying') && (
                    <div className="grid h-full min-h-0 grid-rows-[1fr_auto] md:grid-cols-[1fr_minmax(20rem,36%)] md:grid-rows-1">
                        <section className="flex min-h-0 flex-col px-[3vw] py-[3vh]">
                            <h2 className="text-[clamp(0.85rem,1.1vw,1.1rem)] font-medium uppercase tracking-wider text-gray-400">Your order</h2>
                            <ul ref={listRef} className="mt-3 min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
                                {shown.lines.map((line) => (
                                    <li key={line.key} className="flex items-baseline gap-4 py-[1.6vh]">
                                        <span className="w-[3ch] shrink-0 text-right text-[clamp(1.1rem,1.7vw,1.6rem)] font-semibold tabular-nums text-gray-500">
                                            {line.quantity}×
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[clamp(1.2rem,2vw,2rem)] font-semibold">{line.name}</span>
                                            <span className="block text-[clamp(0.9rem,1.2vw,1.2rem)] text-gray-500">
                                                {line.detail ? `${line.detail} · ` : ''}
                                                {money(line.unit_price_cents)} each
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-[clamp(1.2rem,2vw,2rem)] font-semibold tabular-nums">
                                            {money(line.line_total_cents)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <aside className="flex flex-col justify-end border-t border-gray-200 bg-surface px-[3vw] py-[3vh] md:border-l md:border-t-0">
                            {shown.phase === 'paying' && shown.payment && (
                                <div className="mb-[3vh] text-center">
                                    <p className="text-[clamp(1.1rem,1.6vw,1.6rem)] font-semibold">
                                        {shown.payment.qrImage
                                            ? `Scan to pay with ${shown.payment.label}`
                                            : shown.payment.preparingQr
                                              ? 'Preparing your QR code…'
                                              : `Paying by ${shown.payment.label}`}
                                    </p>
                                    {shown.payment.qrImage ? (
                                        <>
                                            <img
                                                src={shown.payment.qrImage}
                                                alt="Payment QR code"
                                                className="mx-auto mt-3 aspect-square w-[min(85%,46vh)] rounded-xl bg-white object-contain p-3 shadow-sm ring-1 ring-gray-200"
                                            />
                                            <p className="mt-2 text-[clamp(0.9rem,1.2vw,1.2rem)] text-gray-500">
                                                Use GCash, Maya, or any bank app. Pay the exact amount due.
                                            </p>
                                        </>
                                    ) : (
                                        shown.payment.preparingQr && (
                                            <div className="mx-auto mt-3 aspect-square w-[min(85%,46vh)] animate-pulse rounded-xl bg-gray-200" aria-hidden />
                                        )
                                    )}
                                </div>
                            )}
                            <dl className="space-y-2 text-[clamp(1rem,1.4vw,1.4rem)]">
                                <Row label="Subtotal" value={money(shown.totals.subtotal_cents)} />
                                {shown.totals.vat_exempt_cents > 0 && <Row label="VAT exempt" value={`−${money(shown.totals.vat_exempt_cents)}`} />}
                                {shown.totals.discount_cents > 0 && (
                                    <Row label={shown.discountLabel ?? 'Discount'} value={`−${money(shown.totals.discount_cents)}`} accent />
                                )}
                                {shown.totals.service_charge_cents > 0 && (
                                    <Row label="Service charge" value={money(shown.totals.service_charge_cents)} />
                                )}
                                {shown.totals.tax_cents > 0 && <Row label={shown.taxLabel ?? 'VAT'} value={money(shown.totals.tax_cents)} />}
                            </dl>
                            <div className="mt-[2vh] flex items-baseline justify-between gap-4 border-t border-gray-300 pt-[2vh]">
                                <span className="text-[clamp(1.2rem,1.8vw,1.8rem)] font-semibold">
                                    {shown.phase === 'paying' ? 'Amount due' : 'Total'}
                                </span>
                                <span className="text-[clamp(2rem,4.2vw,4.5rem)] font-bold tabular-nums tracking-tight text-brand-700">
                                    {money(shown.totals.total_cents)}
                                </span>
                            </div>
                        </aside>
                    </div>
                )}
                {shown.phase === 'paid' && (
                    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                        <span className="flex h-[10vh] w-[10vh] items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                            <Icon name="check" className="h-1/2 w-1/2" />
                        </span>
                        <h2 className="mt-[3vh] text-[clamp(2rem,4.5vw,4.5rem)] font-bold tracking-tight">Thank you!</h2>
                        <p className="mt-2 text-[clamp(1rem,1.6vw,1.6rem)] text-gray-500">Payment received · {shown.method}</p>
                        <dl className="mt-[4vh] grid grid-cols-2 gap-x-[4vw] gap-y-2 text-left text-[clamp(1rem,1.6vw,1.6rem)]">
                            <dt className="text-gray-500">Total</dt>
                            <dd className="text-right font-semibold tabular-nums">{money(shown.total_cents)}</dd>
                            <dt className="text-gray-500">Paid</dt>
                            <dd className="text-right font-semibold tabular-nums">{money(shown.amount_paid_cents)}</dd>
                            {shown.change_cents > 0 && (
                                <>
                                    <dt className="text-gray-500">Change</dt>
                                    <dd className="text-right text-[1.3em] font-bold tabular-nums text-brand-700">{money(shown.change_cents)}</dd>
                                </>
                            )}
                        </dl>
                        <p className="mt-[4vh] text-sm text-gray-400">Receipt #{shown.reference}</p>
                    </div>
                )}
            </main>
        </div>
    );
}

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <dt className="text-gray-600">{label}</dt>
            <dd className={`font-medium tabular-nums ${accent ? 'text-emerald-700' : 'text-gray-950'}`}>{value}</dd>
        </div>
    );
}

function Welcome({ store, connected }: { store: Store; connected: boolean }) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 30000);
        return () => window.clearInterval(timer);
    }, []);

    return (
        <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
            <img src="/brand/fb-profile-black.png" alt="" className="h-[12vh] w-[12vh] rounded-xl" />
            <h1 className="mt-[4vh] text-[clamp(2rem,4.5vw,4.5rem)] font-bold tracking-tight">Welcome to {store.name}</h1>
            {store.address && <p className="mt-2 text-[clamp(1rem,1.5vw,1.5rem)] text-gray-500">{store.address}</p>}
            {store.receipt_footer && <p className="mt-[3vh] max-w-2xl text-[clamp(1rem,1.4vw,1.4rem)] text-gray-600">{store.receipt_footer}</p>}
            <p className="mt-[4vh] text-[clamp(1rem,1.4vw,1.3rem)] tabular-nums text-gray-400">
                {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
                {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </p>

            {/* For staff setting the screen up; customers just see the welcome. */}
            {!connected && (
                <p className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500">
                    <Icon name={displaySupported() ? 'wifiOff' : 'warning'} className="h-3.5 w-3.5" />
                    {displaySupported()
                        ? 'Waiting for the register. Open it on this computer in the same browser.'
                        : 'This browser cannot link to the register. Use a current Chrome, Edge, or Firefox.'}
                </p>
            )}
        </div>
    );
}
