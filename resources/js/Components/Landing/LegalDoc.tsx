import MarketingLayout from '@/Components/Landing/MarketingLayout';
import { Head } from '@inertiajs/react';
import { ReactNode } from 'react';

/** A legal page in the landing page's style (paper sheet on the dark floor), with a visible draft notice. */
export default function LegalDoc({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
    return (
        <>
            <Head title={`${title} (draft)`} />
            <MarketingLayout>
                <div className="mk-container py-12 lg:py-20">
                    <article className="mx-auto max-w-3xl bg-shop-paper px-6 py-10 text-shop-ink sm:px-12 sm:py-14">
                        <header>
                            <p className="mk-label text-brand-700">Legal</p>
                            <h1 className="mk-h2 mt-3">{title}</h1>
                            <p className="mk-label mt-4 text-shop-ink/65">Last updated: {updated}</p>
                            <div role="note" className="mt-6 border-2 border-dashed border-brand-700 p-5 text-[15px]">
                                <p className="mk-label text-brand-800">Draft — for legal review</p>
                                <p className="mt-1">This text has not been reviewed by a lawyer yet and is not legal advice. Items in [brackets] still need to be filled in.</p>
                            </div>
                        </header>
                        <div className="mt-10 space-y-10 text-[17px] leading-[1.6] text-shop-ink/80 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:uppercase [&_h2]:tracking-[0.01em] [&_h2]:text-shop-ink [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6">
                            {children}
                        </div>
                    </article>
                </div>
            </MarketingLayout>
        </>
    );
}
