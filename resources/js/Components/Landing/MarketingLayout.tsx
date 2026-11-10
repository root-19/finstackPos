import { contactLinks } from '@/Components/Landing/contact';
import LineIcon from '@/Components/Landing/LineIcon';
import { PageProps } from '@/types';
import { usePage } from '@inertiajs/react';
import { ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Who is looking: drives the nav and every call to action. Links into the
 * app are plain <a> (full page load): the marketing pages load their own
 * font and skip the app's boot splash, and the POS needs a real load so the
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

/** The landing/legal page frame: sticky nav, page content, footer. `home` is true on "/". */
export default function MarketingLayout({ children, home = false }: { children: ReactNode; home?: boolean }) {
    const prefix = home ? '' : '/';
    const links = [
        { href: `${prefix}#features`, label: 'Features' },
        { href: `${prefix}#pricing`, label: 'Pricing' },
        { href: `${prefix}#faq`, label: 'FAQ' },
        { href: '#contact', label: 'Contact' },
    ];

    return (
        <div className="min-h-screen overflow-x-clip bg-white font-jakarta text-[17px] leading-[1.6] text-ink-900 antialiased selection:bg-brand-700 selection:text-white">
            <a
                href="#main"
                className="sr-only z-[70] rounded-xl bg-white px-4 py-3 font-semibold shadow-soft focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-brand-700"
            >
                Skip to content
            </a>
            <Nav links={links} home={home} />
            <main id="main">{children}</main>
            <Footer links={links} />
        </div>
    );
}

function Nav({ links, home }: { links: { href: string; label: string }[]; home: boolean }) {
    const { startHref, startLabel, account } = useVisitor();
    const [scrolled, setScrolled] = useState(false);
    const [open, setOpen] = useState(false);
    const toggle = useRef<HTMLButtonElement>(null);
    const firstLink = useRef<HTMLAnchorElement>(null);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

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

    const solid = scrolled || open;

    return (
        <header
            className={`sticky top-0 z-50 transition-colors duration-200 ${
                solid ? 'border-b border-gray-200/80 bg-white/85 backdrop-blur-xl' : 'border-b border-transparent bg-white'
            }`}
        >
            <div className="mk-container flex h-16 items-center justify-between gap-4 lg:h-[72px]">
                <a href={home ? '#main' : '/'} className="flex min-h-[44px] items-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700" aria-label="FinstackPOS home">
                    <img src="/logo.png" alt="FinstackPOS" width={1320} height={288} className="h-8 w-auto sm:h-9" />
                </a>

                <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
                    {links.map((link) => (
                        <a key={link.href} href={link.href} className="mk-link px-3.5 py-2 text-[15px]">
                            {link.label}
                        </a>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    <a href={account.href} className="mk-link hidden px-3 py-2 text-[15px] sm:inline-flex">
                        {account.label}
                    </a>
                    <a href={startHref} className="mk-btn-primary hidden min-h-[44px] px-5 text-[15px] sm:inline-flex">
                        {startLabel}
                    </a>
                    <button
                        ref={toggle}
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        aria-controls="mobile-menu"
                        aria-label={open ? 'Close menu' : 'Open menu'}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-900 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 md:hidden"
                    >
                        <LineIcon name={open ? 'close' : 'menu'} className="h-6 w-6" />
                    </button>
                </div>
            </div>

            {/* Mobile: a full-screen menu that slides down under the bar. */}
            <div
                id="mobile-menu"
                hidden={!open}
                className="fixed inset-x-0 bottom-0 top-16 overflow-y-auto bg-white motion-safe:animate-[menu-down_200ms_ease-out] md:hidden"
            >
                <nav aria-label="Menu" className="mk-container flex flex-col py-4">
                    {[...links, account].map((link, i) => (
                        <a
                            key={link.href}
                            ref={i === 0 ? firstLink : undefined}
                            href={link.href}
                            onClick={() => setOpen(false)}
                            className="flex min-h-[56px] items-center border-b border-gray-100 text-xl font-bold text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
                        >
                            {link.label}
                        </a>
                    ))}
                    <a href={startHref} className="mk-btn-primary mt-6 w-full text-lg">
                        {startLabel}
                    </a>
                </nav>
            </div>
        </header>
    );
}

function Footer({ links }: { links: { href: string; label: string }[] }) {
    const contacts = contactLinks();
    const linkClass = 'mk-link inline-flex min-h-[44px] items-center text-[15px]';

    return (
        <footer className="border-t border-gray-200 bg-gray-50">
            <div className="mk-container grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-12">
                <div className="sm:col-span-2 lg:col-span-5">
                    <img src="/logo.png" alt="FinstackPOS" width={1320} height={288} loading="lazy" className="h-9 w-auto" />
                    <p className="mt-4 max-w-sm text-[15px] text-gray-600">POS, inventory and payroll in one app, made for Philippine small businesses.</p>
                </div>
                <nav aria-labelledby="footer-product" className="lg:col-span-2">
                    <h2 id="footer-product" className="text-sm font-bold text-ink-900">
                        Product
                    </h2>
                    <ul className="mt-3">
                        {links
                            .filter((l) => l.label !== 'Contact')
                            .map((link) => (
                                <li key={link.href}>
                                    <a href={link.href} className={linkClass}>
                                        {link.label}
                                    </a>
                                </li>
                            ))}
                    </ul>
                </nav>
                <div id="contact" className="scroll-mt-24 lg:col-span-3">
                    <h2 className="text-sm font-bold text-ink-900">Contact</h2>
                    {contacts.length > 0 ? (
                        <ul className="mt-3">
                            {contacts.map((link) => (
                                <li key={link.href}>
                                    <a href={link.href} className={linkClass} {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                                        {link.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-3 max-w-xs text-[15px] text-gray-600">Already have a store? Use the Support chat inside the app.</p>
                    )}
                </div>
                <nav aria-labelledby="footer-legal" className="lg:col-span-2">
                    <h2 id="footer-legal" className="text-sm font-bold text-ink-900">
                        Legal
                    </h2>
                    <ul className="mt-3">
                        <li>
                            <a href={route('privacy')} className={linkClass}>
                                Privacy Policy
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
            <div className="border-t border-gray-200">
                <p className="mk-container py-6 text-sm text-gray-600">© {new Date().getFullYear()} FinstackPOS. All rights reserved.</p>
            </div>
        </footer>
    );
}
