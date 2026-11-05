import { useState } from 'react';

export type Bar = { key: string; label: string; value: number; tooltip: string };

/**
 * A single-series column chart: one hue (no legend; the title names it),
 * thin bars with rounded tops on a recessive grid, and a tooltip on hover
 * or keyboard focus. The table below each chart is the accessible view.
 */
export default function BarChart({
    bars,
    format,
    height = 220,
    labelEvery,
    title,
}: {
    bars: Bar[];
    /** Formats axis ticks. */
    format: (value: number) => string;
    height?: number;
    /** Show every nth x label (auto by default). */
    labelEvery?: number;
    title: string;
}) {
    const [active, setActive] = useState<number | null>(null);
    const width = 720;
    const pad = { top: 12, right: 8, bottom: 28, left: 64 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const max = Math.max(...bars.map((b) => b.value), 0);
    const top = niceMax(max);
    const ticks = [0, top / 2, top];
    const band = bars.length ? plotW / bars.length : plotW;
    const barW = Math.max(2, Math.min(28, band - 2)); // 2px surface gap between neighbours
    const every = labelEvery ?? Math.max(1, Math.ceil(bars.length / 12));
    const y = (v: number) => pad.top + plotH - (top ? (v / top) * plotH : 0);
    /** A bar's centre as a percentage of the chart width. */
    const tipAt = (i: number) => ((pad.left + i * band + band / 2) / width) * 100;

    if (max === 0) {
        return <p className="py-10 text-center text-sm text-gray-500">Nothing recorded in this range.</p>;
    }

    return (
        <div className="relative">
            <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={title}>
                {ticks.map((t) => (
                    <g key={t}>
                        <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#D1D5DB' : '#EDEFF2'} strokeWidth={1} />
                        <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-500 text-xs">
                            {format(t)}
                        </text>
                    </g>
                ))}

                {bars.map((b, i) => {
                    const x = pad.left + i * band + (band - barW) / 2;
                    const h = Math.max(0, pad.top + plotH - y(b.value));
                    const r = Math.min(4, barW / 2, h);

                    return (
                        <g key={b.key}>
                            {h > 0 && (
                                <path
                                    d={roundedTop(x, y(b.value), barW, h, r)}
                                    className={active === null || active === i ? 'fill-brand-600' : 'fill-brand-600/35'}
                                />
                            )}
                            {/* Hit target: the whole column, bigger than the bar. */}
                            <rect
                                x={pad.left + i * band}
                                y={pad.top}
                                width={band}
                                height={plotH}
                                fill="transparent"
                                tabIndex={0}
                                aria-label={b.tooltip}
                                onMouseEnter={() => setActive(i)}
                                onMouseLeave={() => setActive(null)}
                                onFocus={() => setActive(i)}
                                onBlur={() => setActive(null)}
                                className="cursor-default outline-none"
                            />
                            {i % every === 0 && (
                                <text x={pad.left + i * band + band / 2} y={height - 8} textAnchor="middle" className="fill-gray-500 text-xs">
                                    {b.label}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            {active !== null && (
                <div
                    role="status"
                    className={`pointer-events-none absolute top-0 z-10 w-max max-w-[min(16rem,100%)] rounded-md bg-gray-950 px-2.5 py-1.5 text-xs font-medium text-white shadow-pop ${
                        // Keep the tooltip inside the chart near either edge.
                        tipAt(active) < 30 ? '' : tipAt(active) > 70 ? '-translate-x-full' : '-translate-x-1/2'
                    }`}
                    style={{ left: `${tipAt(active)}%` }}
                >
                    {bars[active].tooltip}
                </div>
            )}
        </div>
    );
}

/** A bar anchored to the baseline with only its top corners rounded. */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/** Round the axis top up to 1, 2, or 5 × a power of ten. */
function niceMax(v: number): number {
    if (v <= 0) {
        return 0;
    }
    const power = 10 ** Math.floor(Math.log10(v));
    const step = [1, 2, 5, 10].find((m) => m * power >= v) ?? 10;

    return step * power;
}
