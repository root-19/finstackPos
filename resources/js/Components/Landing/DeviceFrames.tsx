import { ImgHTMLAttributes } from 'react';

/**
 * CSS-only device frames for the real app screenshots in public/landing.
 * Every image keeps its width/height attributes so nothing shifts on load.
 */
type Shot = ImgHTMLAttributes<HTMLImageElement> & { src: string; alt: string; width: number; height: number };

function Screen({ className = '', ...img }: Shot) {
    return <img {...img} decoding="async" className={`block h-auto w-full ${className}`} />;
}

/** A landscape tablet: dark bezel, rounded corners, a tiny camera dot. */
export function TabletFrame({ className = '', ...img }: Shot & { className?: string }) {
    return (
        <div className={`relative rounded-[1.75rem] bg-ink-900 p-2.5 shadow-soft-lg ring-1 ring-black/10 sm:p-3 ${className}`}>
            <span aria-hidden className="absolute left-1/2 top-1 h-1 w-1 -translate-x-1/2 rounded-full bg-white/25 sm:top-1.5" />
            <div className="overflow-hidden rounded-[1.1rem] bg-white">
                <Screen {...img} />
            </div>
        </div>
    );
}

/** A phone: thicker rounded bezel and a notch. */
export function PhoneFrame({ className = '', ...img }: Shot & { className?: string }) {
    return (
        <div className={`relative rounded-[2rem] bg-ink-900 p-2 shadow-soft-lg ring-1 ring-black/10 ${className}`}>
            <span aria-hidden className="absolute left-1/2 top-2 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-ink-900" />
            <div className="overflow-hidden rounded-[1.5rem] bg-white">
                <Screen {...img} />
            </div>
        </div>
    );
}

/** A laptop: screen in a thin bezel over a flat base. */
export function LaptopFrame({ className = '', ...img }: Shot & { className?: string }) {
    return (
        <div className={className}>
            <div className="rounded-t-2xl bg-ink-900 p-2 pb-3 shadow-soft-lg ring-1 ring-black/10">
                <div className="overflow-hidden rounded-lg bg-white">
                    <Screen {...img} />
                </div>
            </div>
            <div aria-hidden className="mx-[-4%] h-3 rounded-b-xl bg-gradient-to-b from-gray-300 to-gray-400 shadow-soft" />
        </div>
    );
}
