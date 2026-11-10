import { ImgHTMLAttributes } from 'react';

/**
 * CSS-only device frames for the real app screenshots in public/landing.
 * Every image keeps its width/height attributes so nothing shifts on load.
 */
type Shot = ImgHTMLAttributes<HTMLImageElement> & {
    src: string;
    alt: string;
    width: number;
    height: number;
    /** The LCP image: fetched first. */
    priority?: boolean;
};

function Screen({ className = '', priority = false, ...img }: Shot) {
    // React 18 doesn't know `fetchPriority`; the lowercase attribute passes straight through to the DOM.
    const hint = (priority ? { fetchpriority: 'high' } : {}) as ImgHTMLAttributes<HTMLImageElement>;

    return <img {...img} {...hint} decoding="async" className={`block h-auto w-full ${className}`} />;
}

/*
 * `className` goes on an outer wrapper (size and position, e.g. "absolute
 * bottom-0 w-[30%]"); the bezel inside is always `relative` for its camera/notch.
 */

/** A landscape tablet: dark bezel, a tiny camera dot. */
export function TabletFrame({ className = '', ...img }: Shot & { className?: string }) {
    return (
        <div className={className}>
            <div className="relative rounded-[1.5rem] bg-black p-2.5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/15 sm:p-3">
                <span aria-hidden className="absolute left-1/2 top-1 h-1 w-1 -translate-x-1/2 rounded-full bg-white/30 sm:top-1.5" />
                <div className="overflow-hidden rounded-[0.9rem] bg-white">
                    <Screen {...img} />
                </div>
            </div>
        </div>
    );
}

/** A phone: thicker bezel and a notch. */
export function PhoneFrame({ className = '', ...img }: Shot & { className?: string }) {
    return (
        <div className={className}>
            <div className="relative rounded-[1.75rem] bg-black p-1.5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/15 sm:p-2">
                <span aria-hidden className="absolute left-1/2 top-1.5 z-10 h-3.5 w-14 -translate-x-1/2 rounded-full bg-black sm:top-2" />
                <div className="overflow-hidden rounded-[1.35rem] bg-white">
                    <Screen {...img} />
                </div>
            </div>
        </div>
    );
}
