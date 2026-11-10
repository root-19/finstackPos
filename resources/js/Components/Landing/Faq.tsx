import LineIcon from '@/Components/Landing/LineIcon';
import { ReactNode, useId, useState } from 'react';

export interface FaqItem {
    q: string;
    a: ReactNode;
}

/**
 * FAQ accordion, one answer open at a time. Each question is a real button
 * inside an h3 (Enter/Space toggle it) with aria-expanded/aria-controls.
 */
export default function Faq({ items }: { items: FaqItem[] }) {
    const [open, setOpen] = useState<number | null>(0);
    const base = useId();

    return (
        <div className="divide-y divide-gray-200 border-y border-gray-200">
            {items.map((item, i) => {
                const isOpen = open === i;
                const buttonId = `${base}-q${i}`;
                const panelId = `${base}-a${i}`;

                return (
                    <div key={item.q}>
                        <h3>
                            <button
                                id={buttonId}
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={panelId}
                                onClick={() => setOpen(isOpen ? null : i)}
                                className="flex min-h-[56px] w-full items-center justify-between gap-6 rounded-lg py-4 text-left text-base font-bold text-ink-900 transition-colors duration-150 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 sm:text-lg"
                            >
                                {item.q}
                                <span
                                    aria-hidden
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                                        isOpen ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-300 text-gray-600'
                                    }`}
                                >
                                    <LineIcon name={isOpen ? 'minus' : 'plus'} className="h-4 w-4" strokeWidth={2} />
                                </span>
                            </button>
                        </h3>
                        <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!isOpen} className="pb-6 pr-12 text-[17px] leading-[1.6] text-gray-600">
                            {item.a}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
