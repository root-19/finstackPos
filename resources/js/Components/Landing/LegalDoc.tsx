import MarketingLayout from '@/Components/Landing/MarketingLayout';
import { Head } from '@inertiajs/react';
import { ReactNode } from 'react';

/** A legal page in the landing page's style, with a visible draft notice. */
export default function LegalDoc({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
    return (
        <>
            <Head title={`${title} (draft)`} />
            <MarketingLayout>
                <article className="mk-container max-w-3xl py-16 lg:py-24">
                    <header>
                        <p className="mk-eyebrow">Legal</p>
                        <h1 className="mk-h2 mt-3">{title}</h1>
                        <p className="mt-3 text-[15px] text-gray-600">Last updated: {updated}</p>
                        <div role="note" className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-[15px] text-amber-900">
                            <p className="font-bold">Draft — for legal review</p>
                            <p className="mt-1">This text has not been reviewed by a lawyer yet and is not legal advice. Items in [brackets] still need to be filled in.</p>
                        </div>
                    </header>
                    <div className="mt-10 space-y-10 text-[17px] leading-[1.6] text-gray-700 [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:tracking-[-0.02em] [&_h2]:text-ink-900 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6">
                        {children}
                    </div>
                </article>
            </MarketingLayout>
        </>
    );
}
