import { ReactNode, useId, useState } from 'react';

export interface FaqItem {
    q: string;
    a: ReactNode;
}

/**
 * FAQ accordion on paper, one answer open at a time. Each question is a real
 * button inside an h3 (Enter/Space toggle it) with aria-expanded/aria-controls.
 */
export default function Faq({ items }: { items: FaqItem[] }) {
    const [open, setOpen] = useState<number | null>(0);
    const base = useId();

    return (
        <div className="border-t border-shop-ink/20">
            {items.map((item, i) => {
                const isOpen = open === i;
                const buttonId = `${base}-q${i}`;
                const panelId = `${base}-a${i}`;

                return (
                    <div key={item.q} className="border-b border-shop-ink/20">
                        <h3>
                            <button
                                id={buttonId}
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={panelId}
                                onClick={() => setOpen(isOpen ? null : i)}
                                className="flex min-h-[64px] w-full items-baseline gap-4 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
                            >
                                <span className="font-plex text-[13px] text-brand-700">Q.{String(i + 1).padStart(2, '0')}</span>
                                <span className="flex-1 text-lg font-bold leading-snug sm:text-xl">{item.q}</span>
                                <span aria-hidden className="w-6 shrink-0 text-center font-plex text-xl font-semibold">
                                    {isOpen ? '−' : '+'}
                                </span>
                            </button>
                        </h3>
                        <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!isOpen} className="pb-6 pl-12 pr-10 text-[17px] leading-[1.6] text-shop-ink/75">
                            {item.a}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
