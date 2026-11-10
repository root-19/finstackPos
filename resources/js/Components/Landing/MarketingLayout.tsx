import { contactLinks } from '@/Components/Landing/contact';
import LineIcon from '@/Components/Landing/LineIcon';
import { PageProps } from '@/types';
import { usePage } from '@inertiajs/react';
import { ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Who is looking: drives the nav and every call to action. Links into the
 * app are plain <a> (full page load): the marketing pages load their own
 * fonts and skip the app's boot splash, and the POS needs a real load so the
 * service worker caches it.
 */
export function useVisitor() {
    const { auth } = usePage<PageProps>().props;
    const signedIn = Boolean(auth?.user);
    const canSell = Boolean(auth?.merchant && auth?.can?.['pos.sell']);

    return {
        signedIn,
        startHref: signedIn ? (canSell ? route('pos.index') : route('dashboard')) : route('register'),
        startLabel: signedIn ? (canSell ? 'Open POS' : 'Go to dashboard') : 'Start free',
        account: signedIn ? { href: route('dashboard'), label: 'Dashboard' } : { href: route('login'), label: 'Log in' },
    };
}

type NavLink = { href: string; num: string; label: string };

/** The landing/legal page frame: status strip, sticky nav, page content, footer. `home` is true on "/". */
export default function MarketingLayout({ children, home = false }: { children: ReactNode; home?: boolean }) {
    const prefix = home ? '' : '/';
    const links: NavLink[] = [
        { href: `${prefix}#features`, num: '01', label: 'Features' },
        { href: `${prefix}#how`, num: '02', label: 'How it works' },
        { href: `${prefix}#pricing`, num: '03', label: 'Pricing' },
        { href: `${prefix}#book-demo`, num: '04', label: 'Book a demo' },
    ];

    return (
        <div className="min-h-screen overflow-x-clip bg-shop-ink font-archivo text-[17px] leading-[1.6] text-shop-paper antialiased selection:bg-brand-700 selection:text-white">
            <a href="#main" className="mk-btn-red sr-only z-[70] focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
                Skip to content
            </a>
            <StatusStrip />
            <Nav links={links} home={home} />
            <main id="main">{children}</main>
            <Footer links={links} />
        </div>
    );
}

/** The thin "open for business" line above the nav. */
function StatusStrip() {
    return (
        <div className="border-b border-shop-paper/10 bg-shop-ink-2">
            <p className="mk-container flex h-9 items-center justify-center gap-2.5 font-plex text-[12px] uppercase tracking-[0.18em] text-shop-paper/75 sm:justify-start">
                <span aria-hidden className="relative flex h-2 w-2">
                    <span className="absolute inset-0 animate-ping rounded-full bg-brand-500 opacity-60" />
                    <span className="relative h-2 w-2 rounded-full bg-brand-500" />
                </span>
                Register open: sells even offline
            </p>
        </div>
    );
}

function Nav({ links, home }: { links: NavLink[]; home: boolean }) {
    const { startHref, startLabel, account } = useVisitor();
    const [open, setOpen] = useState(false);
    const toggle = useRef<HTMLButtonElement>(null);
    const firstLink = useRef<HTMLAnchorElement>(null);

    // Full-screen menu: lock the page behind it, Esc closes, focus moves in and back out.
    useEffect(() => {
        if (!open) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        firstLink.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
                toggle.current?.focus();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <header className="sticky top-0 z-50 border-b border-shop-paper/10 bg-shop-ink/90 backdrop-blur-md">
            <div className="mk-container flex h-16 items-center justify-between gap-4 lg:h-[72px]">
                <a href={home ? '#main' : '/'} className="flex min-h-[44px] items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="FinstackPOS home">
                    <img src="/logo-white.png" alt="FinstackPOS" width={1320} height={288} className="h-8 w-auto sm:h-9" />
                </a>

                <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
                    {links.map((link) => (
                        <a key={link.href} href={link.href} className="mk-link inline-flex min-h-[44px] items-center gap-2 px-3 text-shop-paper/75 hover:text-shop-paper">
                            <span className="text-brand-500">{link.num}</span>
                            {link.label}
                        </a>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    <a href={account.href} className="mk-link hidden min-h-[44px] items-center px-3 text-shop-paper/75 hover:text-shop-paper sm:inline-flex">
                        {account.label}
                    </a>
                    <a href={startHref} className="mk-btn-red hidden min-h-[44px] px-5 sm:inline-flex">
                        {startLabel}
                        <LineIcon name="arrow" className="h-4 w-4" strokeWidth={2} />
                    </a>
                    <button
                        ref={toggle}
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        aria-controls="mobile-menu"
                        aria-label={open ? 'Close menu' : 'Open menu'}
                        className="flex h-11 w-11 items-center justify-center text-shop-paper hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
                    >
                        <LineIcon name={open ? 'close' : 'menu'} className="h-6 w-6" />
                    </button>
                </div>
            </div>

            {/* Mobile/tablet: a full-screen numbered menu under the bar. */}
            <div id="mobile-menu" hidden={!open} className="absolute inset-x-0 top-full h-[calc(100dvh-4rem)] overflow-y-auto border-t border-shop-paper/10 bg-shop-ink motion-safe:animate-[menu-down_200ms_ease-out] lg:hidden">
                <nav aria-label="Menu" className="mk-container flex flex-col py-4">
                    {[...links, { href: account.href, num: '→', label: account.label }].map((link, i) => (
                        <a
                            key={link.href}
                            ref={i === 0 ? firstLink : undefined}
                            href={link.href}
                            onClick={() => setOpen(false)}
                            className="flex min-h-[64px] items-baseline gap-4 border-b border-shop-paper/10 py-3 font-display text-3xl uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                            <span className="font-plex text-[13px] text-brand-500">{link.num}</span>
                            {link.label}
                        </a>
                    ))}
                    <a href={startHref} className="mk-btn-red mt-8 w-full">
                        {startLabel}
                    </a>
                </nav>
            </div>
        </header>
    );
}

function Footer({ links }: { links: NavLink[] }) {
    const contacts = contactLinks();
    const linkClass = 'mk-link inline-flex min-h-[44px] min-w-[44px] items-center text-shop-paper/75 hover:text-shop-paper';

    return (
        <footer className="border-t border-shop-paper/10 bg-shop-ink">
            <div className="mk-container grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-12">
                <div className="sm:col-span-2 lg:col-span-5">
                    <img src="/logo-white.png" alt="FinstackPOS" width={1320} height={288} loading="lazy" className="h-9 w-auto" />
                    <p className="mt-4 max-w-sm text-[15px] text-shop-paper/70">POS, inventory and payroll in one app. Built for Philippine small businesses.</p>
                </div>
                <nav aria-labelledby="footer-product" className="lg:col-span-3">
                    <h2 id="footer-product" className="mk-label text-brand-500">
                        Product
                    </h2>
                    <ul className="mt-3">
                        {links.map((link) => (
                            <li key={link.href}>
                                <a href={link.href} className={linkClass}>
                                    {link.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>
                <div id="contact" className="scroll-mt-24 lg:col-span-2">
                    <h2 className="mk-label text-brand-500">Contact</h2>
                    <ul className="mt-3">
                        {contacts.length > 0 ? (
                            contacts.map((link) => (
                                <li key={link.href}>
                                    <a href={link.href} className={linkClass} {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                                        {link.label}
                                    </a>
                                </li>
                            ))
                        ) : (
                            <li>
                                <a href={links[3].href} className={linkClass}>
                                    Book a demo
                                </a>
                            </li>
                        )}
                    </ul>
                </div>
                <nav aria-labelledby="footer-legal" className="lg:col-span-2">
                    <h2 id="footer-legal" className="mk-label text-brand-500">
                        Legal
                    </h2>
                    <ul className="mt-3">
                        <li>
                            <a href={route('privacy')} className={linkClass}>
                                Privacy
                            </a>
                        </li>
                        <li>
                            <a href={route('terms')} className={linkClass}>
                                Terms
                            </a>
                        </li>
                    </ul>
                </nav>
            </div>
            <div className="border-t border-shop-paper/10">
                <p className="mk-container flex flex-col gap-1 py-6 font-plex text-[12px] uppercase tracking-[0.16em] text-shop-paper/60 sm:flex-row sm:justify-between">
                    <span>© {new Date().getFullYear()} FinstackPOS</span>
                    <span>Sell · Track · Pay</span>
                </p>
            </div>
        </footer>
    );
}
