import { KeyboardEvent, useId, useRef, useState } from 'react';
import LineIcon, { IconName } from './LineIcon';

type Step = 'register' | 'checkout' | 'receipt';

const STEPS: { id: Step; icon: IconName; title: string; body: string }[] = [
    {
        id: 'register',
        icon: 'cube',
        title: 'Ring up the order',
        body: 'Tap products or scan a barcode. Pick the size and its price is applied, then adjust quantities in the cart.',
    },
    {
        id: 'checkout',
        icon: 'qr',
        title: 'Take any payment',
        body: 'Cash with automatic change, your own GCash or Maya QR, or a QR Ph code that confirms itself.',
    },
    {
        id: 'receipt',
        icon: 'printer',
        title: 'Print the receipt',
        body: 'Itemized receipts with your TIN and VAT breakdown print on 58 or 80 mm thermal printers.',
    },
];

/**
 * How a sale works on the register, as accessible tabs (arrow keys move
 * between them). The panels are designed previews of the real screens.
 */
export default function Showcase() {
    const [active, setActive] = useState<Step>('register');
    const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
    const baseId = useId();

    const onKeyDown = (e: KeyboardEvent, index: number) => {
        const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
        if (!delta) {
            return;
        }
        e.preventDefault();
        const next = (index + delta + STEPS.length) % STEPS.length;
        setActive(STEPS[next].id);
        tabsRef.current[next]?.focus();
    };

    return (
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16">
            <div role="tablist" aria-orientation="vertical" aria-label="How a sale works" className="space-y-3">
                {STEPS.map((step, i) => {
                    const selected = active === step.id;

                    return (
                        <button
                            key={step.id}
                            ref={(el) => {
                                tabsRef.current[i] = el;
                            }}
                            role="tab"
                            id={`${baseId}-tab-${step.id}`}
                            aria-selected={selected}
                            aria-controls={`${baseId}-panel`}
                            tabIndex={selected ? 0 : -1}
                            onClick={() => setActive(step.id)}
                            onKeyDown={(e) => onKeyDown(e, i)}
                            className={`group relative flex w-full gap-4 rounded-2xl p-5 text-left transition duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                                selected ? 'bg-white/[0.06] ring-1 ring-white/10' : 'hover:bg-white/[0.03]'
                            }`}
                        >
                            <span
                                className={`absolute left-0 top-5 h-[calc(100%-2.5rem)] w-0.5 rounded-full transition ${
                                    selected ? 'bg-gradient-to-b from-brand-500 to-brand-700' : 'bg-transparent'
                                }`}
                            />
                            <span
                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
                                    selected
                                        ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-700/40'
                                        : 'bg-white/5 text-white/60 group-hover:text-white'
                                }`}
                            >
                                <LineIcon name={step.icon} className="h-5 w-5" />
                            </span>
                            <span>
                                <span className="text-xs font-semibold text-white/40">Step {i + 1}</span>
                                <span className={`block text-lg font-bold ${selected ? 'text-white' : 'text-white/70'}`}>{step.title}</span>
                                <span
                                    className={`grid transition-all duration-300 ${selected ? 'mt-1 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                                >
                                    <span className="overflow-hidden text-sm leading-6 text-white/60">{step.body}</span>
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>

            <div
                role="tabpanel"
                id={`${baseId}-panel`}
                aria-labelledby={`${baseId}-tab-${active}`}
                className="relative"
            >
                <div aria-hidden className="pointer-events-none absolute -inset-x-10 -bottom-20 top-10 bg-[radial-gradient(ellipse_at_center,rgba(255,48,48,0.28),transparent_65%)] blur-2xl" />
                <div key={active} className="relative animate-rise" aria-hidden>
                    {active === 'register' && <RegisterPanel />}
                    {active === 'checkout' && <CheckoutPanel />}
                    {active === 'receipt' && <ReceiptPanel />}
                </div>
                <p className="sr-only">{STEPS.find((s) => s.id === active)?.body}</p>
            </div>
        </div>
    );
}

function Frame({ children }: { children: React.ReactNode }) {
    return (
        <div className="overflow-hidden rounded-2xl bg-white text-ink-900 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
            {children}
        </div>
    );
}

const PRODUCTS = [
    { name: 'Iced Latte', price: '₱120 – ₱160', sizes: true, tone: 'from-amber-200 to-amber-400' },
    { name: 'Ube Pandesal', price: '₱15', tone: 'from-purple-200 to-purple-400' },
    { name: 'Chicken Rice', price: '₱185', tone: 'from-orange-200 to-orange-400' },
    { name: 'Matcha Latte', price: '₱140 – ₱180', sizes: true, tone: 'from-lime-200 to-lime-400' },
    { name: 'Bottled Water', price: '₱15', tone: 'from-sky-200 to-sky-400' },
    { name: 'Cheese Roll', price: '₱35', tone: 'from-yellow-100 to-yellow-300' },
];

function RegisterPanel() {
    return (
        <Frame>
            <div className="grid sm:grid-cols-[1fr_13rem]">
                <div className="p-4">
                    <div className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-400">Search or scan barcode</div>
                    <div className="mt-3 flex gap-1.5 text-[11px] font-semibold">
                        <span className="rounded-full bg-ink-900 px-3 py-1 text-white">All</span>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">Drinks</span>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">Bakery</span>
                        <span className="hidden rounded-full bg-gray-100 px-3 py-1 text-gray-600 sm:inline">Meals</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-3">
                        {PRODUCTS.map((p, i) => (
                            <div key={p.name} className={`overflow-hidden rounded-xl ring-1 ${i === 0 ? 'ring-2 ring-brand-500' : 'ring-gray-200'}`}>
                                <div className={`relative h-14 bg-gradient-to-br ${p.tone}`}>
                                    {p.sizes && (
                                        <span className="absolute left-1.5 top-1.5 rounded-full bg-ink-900/80 px-1.5 py-0.5 text-[8px] font-semibold text-white">
                                            3 sizes
                                        </span>
                                    )}
                                </div>
                                <div className="p-2">
                                    <p className="truncate text-[11px] font-semibold">{p.name}</p>
                                    <p className="text-[10px] font-bold text-gray-700">{p.price}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex flex-col border-t border-gray-100 bg-gray-50 p-4 sm:border-l sm:border-t-0">
                    <p className="text-xs font-bold">Current sale</p>
                    <ul className="mt-3 space-y-2.5 text-[11px]">
                        <li className="flex justify-between gap-2"><span>Iced Latte <span className="text-brand-600">· Large</span><br /><span className="text-gray-400">2 × ₱160</span></span><span className="font-semibold">₱320</span></li>
                        <li className="flex justify-between gap-2"><span>Ube Pandesal<br /><span className="text-gray-400">6 × ₱15</span></span><span className="font-semibold">₱90</span></li>
                    </ul>
                    <div className="mt-auto space-y-1 border-t border-gray-200 pt-3 text-[11px]">
                        <p className="flex justify-between text-gray-500"><span>VAT 12% (incl.)</span><span>₱43.93</span></p>
                        <p className="flex justify-between text-sm font-extrabold"><span>Total</span><span>₱410.00</span></p>
                    </div>
                    <div className="mt-3 rounded-lg bg-gradient-to-r from-brand-500 to-brand-700 py-2 text-center text-xs font-bold text-white">
                        Charge ₱410.00
                    </div>
                </div>
            </div>
        </Frame>
    );
}

/** A deterministic, QR-looking pattern (not a scannable code). */
export function QrPattern() {
    const size = 21;
    const cells: [number, number][] = [];
    const finder = (x: number, y: number) =>
        [[0, 0], [14, 0], [0, 14]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!finder(x, y) && ((x * 7 + y * 13 + x * y) % 5 < 2)) {
                cells.push([x, y]);
            }
        }
    }

    return (
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" shapeRendering="crispEdges">
            {[[0, 0], [14, 0], [0, 14]].map(([x, y]) => (
                <g key={`${x}-${y}`}>
                    <rect x={x} y={y} width={7} height={7} fill="#111" />
                    <rect x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />
                    <rect x={x + 2} y={y + 2} width={3} height={3} fill="#111" />
                </g>
            ))}
            {cells.map(([x, y]) => (
                <rect key={`${x}:${y}`} x={x} y={y} width={1} height={1} fill="#111" />
            ))}
        </svg>
    );
}

function CheckoutPanel() {
    return (
        <Frame>
            <div className="p-6 sm:p-8">
                <p className="text-xs text-gray-500">Amount due</p>
                <p className="text-3xl font-extrabold tabular-nums">₱410.00</p>
                <div className="mt-5 grid grid-cols-2 gap-2 text-center text-[11px] font-semibold">
                    {['Cash', 'QR Ph'].map((m) => (
                        <span
                            key={m}
                            className={`rounded-lg px-2 py-2 ${m === 'QR Ph' ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-500' : 'text-gray-600 ring-1 ring-gray-200'}`}
                        >
                            {m}
                        </span>
                    ))}
                </div>
                <div className="mt-6 flex flex-col items-center gap-5 sm:flex-row">
                    <div className="h-40 w-40 shrink-0 rounded-xl bg-white p-3 ring-1 ring-gray-200">
                        <QrPattern />
                    </div>
                    <div className="text-center sm:text-left">
                        <p className="text-sm font-semibold">Scan with any banking or e-wallet app</p>
                        <p className="mt-1 text-xs text-gray-500">The QR is for the exact amount and works once.</p>
                        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
                            </span>
                            Waiting for payment…
                        </p>
                    </div>
                </div>
            </div>
        </Frame>
    );
}

function ReceiptPanel() {
    return (
        <div className="flex justify-center">
            <div className="w-72 rotate-[-1.5deg] bg-white px-5 py-6 font-mono text-[11px] leading-relaxed text-ink-900 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8)]">
                <p className="text-center text-sm font-bold uppercase">Kape &amp; Co.</p>
                <p className="text-center text-gray-600">Quezon City · TIN 123-456-789-000</p>
                <div className="my-2 border-t border-dashed border-gray-400" />
                <p className="flex justify-between"><span>Iced Latte (Large)</span></p>
                <p className="flex justify-between text-gray-600"><span>  2 x 160.00</span><span>320.00</span></p>
                <p className="flex justify-between"><span>Ube Pandesal</span></p>
                <p className="flex justify-between text-gray-600"><span>  6 x 15.00</span><span>90.00</span></p>
                <div className="my-2 border-t border-dashed border-gray-400" />
                <p className="flex justify-between"><span>Subtotal</span><span>410.00</span></p>
                <p className="my-1 flex justify-between border-y border-dashed border-gray-400 py-1 text-sm font-bold"><span>TOTAL</span><span>₱410.00</span></p>
                <p className="flex justify-between"><span>QR Ph</span><span>410.00</span></p>
                <div className="my-2 border-t border-dashed border-gray-400" />
                <p className="flex justify-between"><span>VATable sale</span><span>366.07</span></p>
                <p className="flex justify-between"><span>VAT (12%)</span><span>43.93</span></p>
                <div className="my-2 border-t border-dashed border-gray-400" />
                <p className="text-center">Salamat po! Come again.</p>
            </div>
        </div>
    );
}
