import { PropsWithChildren, ReactNode } from 'react';

/**
 * Sign-in, sign-up and password pages, in the landing page's "shop floor"
 * style: a big headline on the dark floor and the form on a paper slip.
 * `footer` sits under the slip (e.g. a link to the other auth page).
 *
 * These pages are served with the landing shell (ServeAsMarketingPage):
 * links back to the site are plain <a> so they load the landing fonts too.
 */
export default function Guest({
    title,
    description,
    footer,
    slip = 'Account slip',
    headline,
    children,
}: PropsWithChildren<{
    title?: string;
    description?: ReactNode;
    footer?: ReactNode;
    /** Label on the slip's header, e.g. "Sign-in slip". */
    slip?: string;
    /** The big text on the floor (decorative; the slip's title is the page's h1). */
    headline?: ReactNode;
}>) {
    return (
        <div className="mk-heat relative flex min-h-screen flex-col overflow-x-clip font-archivo text-[17px] leading-[1.6] text-shop-paper antialiased selection:bg-brand-700 selection:text-white">
            <div aria-hidden className="mk-halftone pointer-events-none absolute inset-y-0 left-0 w-1/2 text-shop-paper/[0.05] [mask-image:linear-gradient(to_right,black,transparent)]" />

            <header className="relative border-b border-shop-paper/10">
                <div className="mk-container flex h-16 items-center justify-between gap-4">
                    <a href="/" className="flex min-h-[44px] items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="FinstackPOS home">
                        <img src="/logo-white.png" alt="FinstackPOS" width={1320} height={288} className="h-8 w-auto" />
                    </a>
                    <a href="/" className="mk-link inline-flex min-h-[44px] items-center text-shop-paper/75 hover:text-shop-paper">
                        ← Back to site
                    </a>
                </div>
            </header>

            <main className="mk-container relative grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:gap-16 lg:py-16">
                <div>
                    <p className="mk-label text-shop-paper/70">[ Register 01 / Point of sale ]</p>
                    <p aria-hidden className="mt-5 font-display text-[clamp(2.8rem,7vw,6rem)] uppercase leading-[0.9]">
                        {headline ?? (
                            <>
                                Run your store
                                <br />
                                <span className="text-brand-500">from any device.</span>
                            </>
                        )}
                    </p>
                    <ul className="mt-8 hidden flex-wrap gap-2 sm:flex">
                        {['Works offline', 'GCash / Maya / QR Ph', 'Senior & PWD ready', 'Free plan'].map((chip) => (
                            <li key={chip} className="mk-chip border-shop-paper/25 text-shop-paper/85">
                                {chip}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="w-full">
                    <div className="mk-ticket px-6 pb-8 pt-6 sm:px-9">
                        <div className="flex items-baseline justify-between gap-4">
                            <p className="mk-label">FinstackPOS · {slip}</p>
                            <p aria-hidden className="mk-label text-shop-ink/60">
                                No. — — —
                            </p>
                        </div>
                        <div aria-hidden className="mk-perf mt-4 text-shop-ink/40" />

                        {title && (
                            <div className="mb-6 mt-6">
                                <h1 className="font-display text-4xl uppercase leading-none">{title}</h1>
                                {description && <p className="mt-2 text-[15px] text-shop-ink/75">{description}</p>}
                            </div>
                        )}
                        {children}
                    </div>

                    {footer && <div className="mt-6 text-center text-[15px] text-shop-paper/75">{footer}</div>}
                </div>
            </main>

            <footer className="relative border-t border-shop-paper/10">
                <p className="mk-container flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-5 font-plex text-[12px] uppercase tracking-[0.16em] text-shop-paper/60">
                    <span>© {new Date().getFullYear()} FinstackPOS</span>
                    <span className="flex gap-5">
                        <a href={route('privacy')} className="inline-flex min-h-[44px] items-center hover:text-shop-paper">
                            Privacy
                        </a>
                        <a href={route('terms')} className="inline-flex min-h-[44px] items-center hover:text-shop-paper">
                            Terms
                        </a>
                    </span>
                </p>
            </footer>
        </div>
    );
}
