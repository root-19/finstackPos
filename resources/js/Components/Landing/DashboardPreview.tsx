import LineIcon, { IconName } from './LineIcon';

// Illustrative sample figures for the marketing preview only.
const HOURLY = [18, 26, 34, 47, 62, 71, 55, 44, 52, 68, 80, 46];
const HOURS = ['8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p'];

const STATS = [
    { label: "Today's sales", value: '₱24,580', delta: '+12.4%' },
    { label: 'Transactions', value: '186', delta: '+8.1%' },
    { label: 'Average sale', value: '₱132', delta: '+3.9%' },
];

const TRANSACTIONS = [
    { ref: 'A41F2C', items: 'Iced Latte (L) × 2', method: 'QR Ph', amount: '₱260.00' },
    { ref: '9B07E1', items: 'Ube Pandesal × 6', method: 'Cash', amount: '₱90.00' },
    { ref: 'C3D9A4', items: 'Chicken Rice Meal', method: 'Card', amount: '₱185.00' },
    { ref: '7E21B8', items: 'Bottled Water × 3', method: 'GCash', amount: '₱45.00' },
];

const STOCK = [
    { name: 'Iced Latte cups', left: 18, of: 120 },
    { name: 'Ube Pandesal', left: 42, of: 80 },
    { name: 'Bottled Water', left: 96, of: 120 },
];

const NAV: IconName[] = ['chart', 'card', 'cube', 'tag', 'users'];

/**
 * A designed preview of the FinstackPOS back office for the landing page
 * hero. Decorative: screen readers get a one-line description instead.
 */
export default function DashboardPreview() {
    const peak = Math.max(...HOURLY);

    return (
        <div
            role="img"
            aria-label="Preview of the FinstackPOS dashboard showing today's sales, an hourly sales chart, recent transactions, and stock levels."
            className="relative"
        >
            <div aria-hidden className="overflow-hidden rounded-2xl bg-white shadow-[0_40px_120px_-30px_rgba(17,17,17,0.45)] ring-1 ring-ink-900/10">
                {/* Window chrome */}
                <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/80 px-4 py-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                    <span className="mx-auto hidden rounded-md bg-white px-10 py-1 text-[10px] text-gray-400 ring-1 ring-gray-200 sm:block">
                        FinstackPOS · Dashboard
                    </span>
                </div>

                <div className="flex">
                    {/* Sidebar (mirrors the real app) */}
                    <div className="hidden w-14 shrink-0 flex-col items-center gap-3 bg-ink-900 py-4 sm:flex">
                        <img src="/brand/fb-profile-black.png" alt="" className="mb-2 h-8 w-8 rounded-lg ring-1 ring-white/10" />
                        {NAV.map((icon, i) => (
                            <span
                                key={icon}
                                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                                    i === 0 ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white' : 'text-white/40'
                                }`}
                            >
                                <LineIcon name={icon} className="h-[18px] w-[18px]" />
                            </span>
                        ))}
                    </div>

                    <div className="min-w-0 flex-1 bg-gray-50/70 p-4 sm:p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Kape &amp; Co. · Today</p>
                                <p className="text-sm font-bold text-ink-900 sm:text-base">Sales overview</p>
                            </div>
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                ● Online · synced
                            </span>
                        </div>

                        {/* Stats */}
                        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
                            {STATS.map((s, i) => (
                                <div
                                    key={s.label}
                                    className={`rounded-xl p-3 ${
                                        i === 0
                                            ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/25'
                                            : 'bg-white ring-1 ring-gray-200/80'
                                    }`}
                                >
                                    <p className={`truncate text-[10px] ${i === 0 ? 'text-white/75' : 'text-gray-500'}`}>{s.label}</p>
                                    <p className="mt-0.5 text-sm font-extrabold tabular-nums sm:text-lg">{s.value}</p>
                                    <p className={`text-[10px] font-semibold ${i === 0 ? 'text-white/80' : 'text-emerald-600'}`}>{s.delta}</p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-3 grid gap-3 lg:grid-cols-5">
                            {/* Hourly chart */}
                            <div className="rounded-xl bg-white p-3 ring-1 ring-gray-200/80 lg:col-span-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold text-ink-900">Sales by hour</p>
                                    <p className="text-[10px] text-gray-400">Peak 6 PM</p>
                                </div>
                                <div className="mt-3 flex h-28 items-end gap-1.5 sm:h-32">
                                    {HOURLY.map((v, i) => (
                                        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                                            <div
                                                className={`w-full origin-bottom animate-bar-grow rounded-t-[4px] ${
                                                    v === peak
                                                        ? 'bg-gradient-to-t from-brand-700 to-brand-500'
                                                        : 'bg-ink-900/10'
                                                }`}
                                                style={{ height: `${(v / peak) * 100}%`, animationDelay: `${600 + i * 60}ms` }}
                                            />
                                            <span className="text-[8px] text-gray-400">{HOURS[i]}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Stock */}
                            <div className="hidden rounded-xl bg-white p-3 ring-1 ring-gray-200/80 sm:block lg:col-span-2">
                                <p className="text-xs font-bold text-ink-900">Stock levels</p>
                                <ul className="mt-3 space-y-3">
                                    {STOCK.map((item) => {
                                        const pct = Math.round((item.left / item.of) * 100);
                                        const low = pct < 25;

                                        return (
                                            <li key={item.name}>
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="font-medium text-gray-700">{item.name}</span>
                                                    <span className={low ? 'font-semibold text-brand-600' : 'text-gray-400'}>
                                                        {item.left} left
                                                    </span>
                                                </div>
                                                <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                                                    <div
                                                        className={`h-full rounded-full ${low ? 'bg-gradient-to-r from-brand-500 to-brand-700' : 'bg-ink-900/70'}`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </div>

                        {/* Transactions */}
                        <div className="mt-3 rounded-xl bg-white ring-1 ring-gray-200/80">
                            <div className="flex items-center justify-between px-3 pt-3">
                                <p className="text-xs font-bold text-ink-900">Recent transactions</p>
                                <p className="text-[10px] text-gray-400">Live</p>
                            </div>
                            <ul className="mt-1 divide-y divide-gray-100">
                                {TRANSACTIONS.map((t, i) => (
                                    <li key={t.ref} className={`flex items-center gap-3 px-3 py-2 text-[11px] ${i > 2 ? 'hidden sm:flex' : ''}`}>
                                        <span className="font-mono font-semibold text-brand-600">{t.ref}</span>
                                        <span className="min-w-0 flex-1 truncate text-gray-600">{t.items}</span>
                                        <span className="hidden rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-semibold text-gray-600 sm:inline">
                                            {t.method}
                                        </span>
                                        <span className="font-semibold tabular-nums text-ink-900">{t.amount}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Floating details, desktop only */}
            <div
                aria-hidden
                className="absolute -bottom-10 -left-28 hidden w-44 animate-drift rounded-xl bg-white p-3 shadow-2xl shadow-ink-900/20 ring-1 ring-gray-200 xl:block"
            >
                <p className="text-center text-[10px] font-bold uppercase tracking-wider text-ink-900">Kape &amp; Co.</p>
                <div className="my-2 border-t border-dashed border-gray-300" />
                <div className="space-y-1 font-mono text-[9px] text-gray-600">
                    <p className="flex justify-between"><span>2 × Iced Latte (L)</span><span>260.00</span></p>
                    <p className="flex justify-between"><span>Less SC (20%)</span><span>-46.43</span></p>
                </div>
                <div className="my-2 border-t border-dashed border-gray-300" />
                <p className="flex justify-between font-mono text-[10px] font-bold text-ink-900"><span>TOTAL</span><span>₱185.71</span></p>
            </div>

            <div
                aria-hidden
                className="absolute -right-16 -top-7 hidden items-center gap-3 rounded-xl bg-ink-900 px-4 py-3 text-white shadow-2xl shadow-ink-900/30 [animation-delay:1.5s] animate-drift xl:flex"
            >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700">
                    <LineIcon name="check" className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <div>
                    <p className="text-xs font-semibold">QR Ph payment received</p>
                    <p className="text-[10px] text-white/50">₱260.00 · just now</p>
                </div>
            </div>
        </div>
    );
}
