import { CSSProperties, PointerEvent, ReactNode, useEffect, useRef, useState } from 'react';
import LineIcon, { IconName } from './LineIcon';
import { QrPattern } from './Showcase';

/*
 * A sale playing out on the register, in 3D: products are rung up on the
 * tablet, the customer scans the QR on their phone, the payment confirms,
 * and the receipt prints. Built with CSS 3D transforms (no WebGL), so it
 * stays light and works offline. The scene tilts toward the pointer, only
 * plays while on screen, and holds still for reduced-motion users.
 */

const STAGES: { icon: IconName; title: string; body: string; ms: number }[] = [
    { icon: 'cube', title: 'Ring up', body: 'Tap products or scan barcodes.', ms: 2600 },
    { icon: 'qr', title: 'Scan to pay', body: 'QR Ph or your own GCash / Maya QR.', ms: 2800 },
    { icon: 'check', title: 'Confirmed', body: 'The payment confirms itself.', ms: 1900 },
    { icon: 'printer', title: 'Receipt & sync', body: 'Prints, then syncs to the cloud.', ms: 2900 },
];

/** Sub-steps of the first stage: the cart fills one item at a time. */
const ITEMS = [
    { name: 'Iced Latte', detail: 'Large · 2 × ₱160', total: 320, tile: 0 },
    { name: 'Ube Pandesal', detail: '6 × ₱15', total: 90, tile: 1 },
];

const TILES = [
    { name: 'Iced Latte', tone: 'from-amber-200 to-amber-400' },
    { name: 'Ube Pandesal', tone: 'from-purple-200 to-purple-400' },
    { name: 'Chicken Rice', tone: 'from-orange-200 to-orange-400' },
    { name: 'Matcha', tone: 'from-lime-200 to-lime-400' },
    { name: 'Water', tone: 'from-sky-200 to-sky-400' },
    { name: 'Cheese Roll', tone: 'from-yellow-100 to-yellow-300' },
    { name: 'Ensaymada', tone: 'from-rose-200 to-rose-400' },
    { name: 'Iced Tea', tone: 'from-orange-100 to-amber-300' },
    { name: 'Spanish Bread', tone: 'from-stone-200 to-stone-400' },
];

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function Transaction3D() {
    const [stage, setStage] = useState(0);
    const [items, setItems] = useState(0);
    const [playing, setPlaying] = useState(true);
    const [onScreen, setOnScreen] = useState(false);
    const [reduced, setReduced] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReduced(media.matches);
        update();
        media.addEventListener('change', update);

        return () => media.removeEventListener('change', update);
    }, []);

    // Only animate while the scene is visible.
    useEffect(() => {
        const el = rootRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') {
            setOnScreen(true);
            return;
        }
        const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.2 });
        observer.observe(el);

        return () => observer.disconnect();
    }, []);

    // Reduced motion: a still of the paid sale, no loop.
    useEffect(() => {
        if (reduced) {
            setStage(2);
            setItems(ITEMS.length);
        }
    }, [reduced]);

    // The cart fills during "Ring up".
    useEffect(() => {
        if (reduced || stage !== 0) {
            if (stage !== 0) {
                setItems(ITEMS.length);
            }
            return;
        }
        setItems(0);
        const timers = ITEMS.map((_, i) => window.setTimeout(() => setItems(i + 1), 500 + i * 900));

        return () => timers.forEach((t) => window.clearTimeout(t));
    }, [stage, reduced]);

    // Advance through the stages, then start the next sale.
    useEffect(() => {
        if (reduced || !playing || !onScreen) {
            return;
        }
        const timer = window.setTimeout(() => setStage((s) => (s + 1) % STAGES.length), STAGES[stage].ms);

        return () => window.clearTimeout(timer);
    }, [stage, playing, onScreen, reduced]);

    const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
        const scene = sceneRef.current;
        if (!scene || reduced || e.pointerType === 'touch') {
            return;
        }
        const box = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - box.left) / box.width - 0.5;
        const y = (e.clientY - box.top) / box.height - 0.5;
        scene.style.setProperty('--tilt-x', `${(-y * 10).toFixed(2)}deg`);
        scene.style.setProperty('--tilt-y', `${(x * 14).toFixed(2)}deg`);
    };
    const onPointerLeave = () => {
        sceneRef.current?.style.setProperty('--tilt-x', '0deg');
        sceneRef.current?.style.setProperty('--tilt-y', '0deg');
    };

    const total = ITEMS.slice(0, items).reduce((sum, i) => sum + i.total, 0);
    const paying = stage === 1;
    const paid = stage >= 2;
    const printing = stage === 3;

    return (
        <div ref={rootRef} className="grid items-center gap-12 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-10">
            {/* Stages: click one to jump there and hold. */}
            <div>
                <ol className="space-y-2" aria-label="Steps of a sale">
                    {STAGES.map((s, i) => {
                        const active = stage === i;
                        const done = stage > i;

                        return (
                            <li key={s.title}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStage(i);
                                        setPlaying(false);
                                    }}
                                    aria-current={active ? 'step' : undefined}
                                    className={`group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl p-4 text-left transition duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                                        active ? 'bg-white shadow-[0_12px_40px_-12px_rgba(17,17,17,0.25)] ring-1 ring-gray-200' : 'hover:bg-white/60'
                                    }`}
                                >
                                    <span
                                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition duration-300 ${
                                            active
                                                ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30'
                                                : done
                                                  ? 'bg-ink-900 text-white'
                                                  : 'bg-white text-gray-400 ring-1 ring-gray-200'
                                        }`}
                                    >
                                        <LineIcon name={done ? 'check' : s.icon} className="h-5 w-5" />
                                    </span>
                                    <span className="min-w-0">
                                        <span className={`block font-bold ${active ? 'text-ink-900' : 'text-gray-500'}`}>{s.title}</span>
                                        <span className="block text-sm text-gray-500">{s.body}</span>
                                    </span>
                                    {/* Progress of the current stage. */}
                                    {active && playing && !reduced && (
                                        <span
                                            key={stage}
                                            aria-hidden
                                            className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gradient-to-r from-brand-500 to-brand-700"
                                            style={{ animation: `stage-progress ${s.ms}ms linear both`, animationPlayState: onScreen ? 'running' : 'paused' }}
                                        />
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ol>
                {!reduced && (
                    <button
                        type="button"
                        onClick={() => setPlaying((p) => !p)}
                        className="ml-4 mt-4 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-ink-900"
                    >
                        <span className="relative flex h-2 w-2">
                            {playing && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />}
                            <span className={`relative inline-flex h-2 w-2 rounded-full ${playing ? 'bg-brand-600' : 'bg-gray-400'}`} />
                        </span>
                        {playing ? 'Playing · click a step to pause' : 'Paused · play the sale'}
                    </button>
                )}
            </div>

            {/* The 3D scene (decorative; the steps above describe it). */}
            <div
                aria-hidden
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
                className="relative order-first mx-auto w-full max-w-[640px] [perspective:1800px] lg:order-none"
            >
                <div
                    ref={sceneRef}
                    className="relative aspect-[5/4] w-full transition-transform duration-700 ease-out [transform-style:preserve-3d] motion-reduce:transition-none"
                    style={{
                        transform: 'rotateX(calc(18deg + var(--tilt-x, 0deg))) rotateY(calc(-20deg + var(--tilt-y, 0deg))) rotateZ(2deg)',
                    }}
                >
                    {/* Floor glow and shadow */}
                    <div
                        className="absolute inset-x-[4%] bottom-[2%] top-[18%] rounded-[40%] bg-[radial-gradient(closest-side,rgba(228,30,46,0.28),rgba(17,17,17,0.10)_60%,transparent)] blur-2xl"
                        style={{ transform: 'translateZ(-80px)' }}
                    />

                    {/* Tablet register */}
                    <Layer z={0} className="left-[3%] top-[6%] h-[70%] w-[74%]">
                        <div className="h-full w-full rounded-[22px] bg-ink-900 p-[1.6%] shadow-[0_50px_90px_-30px_rgba(17,17,17,0.65)] ring-1 ring-black/40">
                            <div className="relative grid h-full grid-cols-[1fr_38%] overflow-hidden rounded-[15px] bg-white text-ink-900">
                                <div className="p-[4%]">
                                    <div className="rounded-md bg-gray-100 px-2 py-1 text-[clamp(6px,1.1vw,9px)] text-gray-400">Search or scan barcode</div>
                                    <div className="mt-[5%] grid grid-cols-3 gap-[5%]">
                                        {TILES.map((t, i) => {
                                            const tapped = stage === 0 && ITEMS[items - 1]?.tile === i;

                                            return (
                                                <div
                                                    key={t.name}
                                                    className={`overflow-hidden rounded-lg ring-1 transition duration-300 ${
                                                        tapped ? 'scale-[0.92] ring-2 ring-brand-500' : 'ring-gray-200'
                                                    }`}
                                                >
                                                    <div className={`aspect-[16/10] bg-gradient-to-br ${t.tone}`} />
                                                    <p className="truncate px-1 py-0.5 text-[clamp(5px,0.95vw,8px)] font-semibold">{t.name}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex flex-col border-l border-gray-100 bg-gray-50 p-[6%]">
                                    <p className="text-[clamp(6px,1.1vw,9px)] font-bold">Current sale</p>
                                    <ul className="mt-[8%] space-y-[8%]">
                                        {ITEMS.map((item, i) => (
                                            <li
                                                key={item.name}
                                                className={`flex justify-between gap-1 text-[clamp(5px,0.95vw,8px)] transition-all duration-500 ${
                                                    i < items ? 'translate-x-0 opacity-100' : 'translate-x-3 opacity-0'
                                                }`}
                                            >
                                                <span>
                                                    {item.name}
                                                    <br />
                                                    <span className="text-gray-400">{item.detail}</span>
                                                </span>
                                                <span className="font-semibold">₱{item.total}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-auto border-t border-gray-200 pt-[6%]">
                                        <p className="flex justify-between text-[clamp(6px,1.15vw,10px)] font-extrabold tabular-nums">
                                            <span>Total</span>
                                            <span>{peso(total)}</span>
                                        </p>
                                        <div
                                            className={`mt-[6%] rounded-md py-[5%] text-center text-[clamp(5px,1vw,8px)] font-bold text-white transition duration-300 ${
                                                paid ? 'bg-emerald-600' : paying ? 'scale-95 bg-brand-700' : 'bg-gradient-to-r from-brand-500 to-brand-700'
                                            }`}
                                        >
                                            {paid ? 'Paid · QR Ph' : paying ? 'Waiting for QR…' : `Charge ${peso(total)}`}
                                        </div>
                                    </div>
                                </div>

                                {/* Paid overlay */}
                                <div
                                    className={`absolute inset-0 flex flex-col items-center justify-center bg-white/85 backdrop-blur-[2px] transition duration-500 ${
                                        stage === 2 ? 'opacity-100' : 'pointer-events-none opacity-0'
                                    }`}
                                >
                                    <span
                                        className={`flex h-[18%] aspect-square items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/40 transition duration-500 ${
                                            stage === 2 ? 'scale-100' : 'scale-50'
                                        }`}
                                    >
                                        <LineIcon name="check" className="h-1/2 w-1/2" strokeWidth={3} />
                                    </span>
                                    <p className="mt-[3%] text-[clamp(8px,1.6vw,14px)] font-extrabold">Payment received</p>
                                    <p className="text-[clamp(6px,1.1vw,9px)] text-gray-500">Change ₱0.00 · Receipt #8F2A61C0</p>
                                </div>
                            </div>
                        </div>
                    </Layer>

                    {/* Customer's phone */}
                    <Layer z={80} className="-right-[4%] top-[22%] w-[20%]">
                        <div
                            className={`aspect-[9/18] rounded-[18%/9%] bg-ink-800 p-[5%] shadow-[0_40px_70px_-20px_rgba(17,17,17,0.7)] ring-1 ring-white/10 transition-all duration-700 ease-out ${
                                paying || stage === 2 ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                            }`}
                        >
                            <div className="relative flex h-full flex-col items-center overflow-hidden rounded-[14%/7%] bg-white px-[8%] pt-[14%] text-center">
                                <p className="text-[clamp(5px,0.95vw,8px)] font-semibold text-gray-500">Pay with QR Ph</p>
                                <p className="text-[clamp(7px,1.4vw,12px)] font-extrabold tabular-nums text-ink-900">{peso(410)}</p>
                                <div className="relative mt-[10%] w-full overflow-hidden rounded-md bg-white p-[6%] ring-1 ring-gray-200">
                                    <QrPattern />
                                    {paying && (
                                        <span className="absolute inset-x-0 top-0 h-[3px] bg-brand-500 shadow-[0_0_12px_3px_rgba(255,48,48,0.6)] [animation:scan-line_1.4s_ease-in-out_infinite_alternate]" />
                                    )}
                                </div>
                                <div
                                    className={`absolute inset-0 flex flex-col items-center justify-center bg-emerald-500 text-white transition duration-500 ${
                                        stage === 2 ? 'opacity-100' : 'opacity-0'
                                    }`}
                                >
                                    <LineIcon name="check" className="h-[22%] w-[22%]" strokeWidth={3} />
                                    <p className="mt-1 text-[clamp(6px,1.1vw,9px)] font-bold">Sent {peso(410)}</p>
                                </div>
                            </div>
                        </div>
                    </Layer>

                    {/* Receipt printer */}
                    <Layer z={70} className="bottom-[2%] left-[8%] w-[34%]">
                        <div className="relative">
                            {/* Paper feeding out of the slot */}
                            <div className="absolute bottom-[78%] left-[12%] right-[12%] flex h-[260%] items-end overflow-hidden">
                                <div
                                    className={`w-full bg-white px-[8%] pb-[6%] pt-[8%] font-mono text-[clamp(4px,0.8vw,7px)] leading-[1.5] text-ink-900 shadow-md transition-transform ease-out ${
                                        printing ? 'translate-y-0 duration-[1800ms]' : 'translate-y-full duration-300'
                                    }`}
                                    style={{ clipPath: 'polygon(0 4%, 6% 0, 12% 4%, 18% 0, 24% 4%, 30% 0, 36% 4%, 42% 0, 48% 4%, 54% 0, 60% 4%, 66% 0, 72% 4%, 78% 0, 84% 4%, 90% 0, 96% 4%, 100% 0, 100% 100%, 0 100%)' }}
                                >
                                    <p className="text-center font-bold uppercase">Kape &amp; Co.</p>
                                    <p className="border-b border-dashed border-gray-400 pb-[4%] text-center text-gray-500">TIN 123-456-789-000</p>
                                    <p className="mt-[4%] flex justify-between"><span>Iced Latte L ×2</span><span>320.00</span></p>
                                    <p className="flex justify-between"><span>Ube Pandesal ×6</span><span>90.00</span></p>
                                    <p className="mt-[4%] flex justify-between border-y border-dashed border-gray-400 py-[3%] font-bold"><span>TOTAL</span><span>410.00</span></p>
                                    <p className="flex justify-between"><span>QR Ph</span><span>410.00</span></p>
                                    <p className="flex justify-between text-gray-500"><span>VAT 12%</span><span>43.93</span></p>
                                    <p className="mt-[4%] text-center">Salamat po!</p>
                                </div>
                            </div>
                            <div className="relative rounded-[18%/30%] bg-gradient-to-b from-gray-700 to-ink-900 px-[10%] pb-[12%] pt-[10%] shadow-[0_30px_50px_-18px_rgba(17,17,17,0.7)] ring-1 ring-white/10">
                                <div className="h-[5px] rounded-full bg-black/70" />
                                <div className="mt-[10%] flex items-center justify-between">
                                    <span className="text-[clamp(5px,0.9vw,8px)] font-semibold tracking-wide text-white/50">58 MM</span>
                                    <span className={`h-[6px] w-[6px] rounded-full ${printing ? 'animate-pulse bg-emerald-400' : 'bg-white/30'}`} />
                                </div>
                            </div>
                        </div>
                    </Layer>

                    {/* Floating badges, closest to the viewer */}
                    <Badge show={stage === 0 && items > 0} z={160} className="left-[-2%] top-[0%]" icon="cube">
                        + {ITEMS[Math.max(0, items - 1)].name}
                    </Badge>
                    <Badge show={stage === 0 && items === ITEMS.length} z={140} className="left-[44%] top-[2%]" icon="calculator">
                        VAT 12% computed
                    </Badge>
                    <Badge show={stage === 2} z={190} className="-right-[2%] top-[8%]" icon="check" tone="green">
                        + {peso(410)}
                    </Badge>
                    <Badge show={printing} z={170} className="right-[6%] bottom-[16%]" icon="cloud" tone="dark">
                        Synced to cloud
                    </Badge>
                    <Badge show={printing} z={130} className="left-[46%] bottom-[6%]" icon="stock">
                        Stock updated
                    </Badge>
                </div>
            </div>
        </div>
    );
}

/** A plane placed at a depth in the scene. */
function Layer({ z, className, children }: { z: number; className: string; children: ReactNode }) {
    return (
        <div className={`absolute [transform-style:preserve-3d] ${className}`} style={{ transform: `translateZ(${z}px)` }}>
            {children}
        </div>
    );
}

function Badge({
    show,
    z,
    className,
    icon,
    tone = 'light',
    children,
}: {
    show: boolean;
    z: number;
    className: string;
    icon: IconName;
    tone?: 'light' | 'green' | 'dark';
    children: ReactNode;
}) {
    const tones = {
        light: 'bg-white/95 text-ink-900 ring-gray-200',
        green: 'bg-emerald-500 text-white ring-emerald-400 shadow-emerald-500/30',
        dark: 'bg-ink-900 text-white ring-white/10',
    }[tone];
    const style: CSSProperties = {
        transform: `translateZ(${z}px) translateY(${show ? 0 : 14}px) scale(${show ? 1 : 0.9})`,
        opacity: show ? 1 : 0,
    };

    return (
        <div
            className={`absolute inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[clamp(9px,1.3vw,13px)] font-bold shadow-xl ring-1 backdrop-blur transition-all duration-500 ease-out ${tones} ${className}`}
            style={style}
        >
            <LineIcon name={icon} className="h-[1.2em] w-[1.2em]" />
            {children}
        </div>
    );
}
