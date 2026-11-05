import InstallAppButton from '@/Components/InstallAppButton';
import LineIcon, { IconName } from '@/Components/Landing/LineIcon';
import Reveal from '@/Components/Landing/Reveal';
import Showcase from '@/Components/Landing/Showcase';
import Transaction3D from '@/Components/Landing/Transaction3D';
import useParallax from '@/hooks/useParallax';
import { PageProps } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { ReactNode, useEffect, useRef, useState } from 'react';

/** Optional sales inbox for the Custom plan (VITE_SALES_EMAIL in .env). */
const SALES_EMAIL = (import.meta.env.VITE_SALES_EMAIL as string | undefined) || null;

const NAV_LINKS = [
    { href: '#features', label: 'Features' },
    { href: '#live-sale', label: 'See it in action' },
    { href: '#how-it-works', label: 'How it works' },
    { href: '#pricing', label: 'Pricing' },
    { href: '#faq', label: 'FAQ' },
];

const PROBLEMS: { icon: IconName; problem: string; solution: string }[] = [
    {
        icon: 'offline',
        problem: 'The internet drops in the middle of a rush.',
        solution: 'The register keeps selling offline and uploads every sale the moment you reconnect.',
    },
    {
        icon: 'calculator',
        problem: 'Totals, VAT, and senior discounts are worked out by hand.',
        solution: 'Every total, VAT line, service charge, and Senior/PWD discount is computed for you.',
    },
    {
        icon: 'stock',
        problem: 'You find out an item is gone when a customer asks for it.',
        solution: 'Stock goes down with each sale, and low items stand out before they run out.',
    },
    {
        icon: 'chart',
        problem: 'End-of-day sales live in a notebook or a pile of receipts.',
        solution: 'Every sale is recorded with its cashier, payment, and time, ready to filter and review.',
    },
];

const FEATURES: { icon: IconName; title: string; body: string }[] = [
    { icon: 'card', title: 'Fast checkout', body: 'Tap products or scan barcodes, adjust quantities, and charge in a few taps.' },
    { icon: 'cloud', title: 'Offline-first register', body: 'Sales are saved on the device first and sync automatically when online.' },
    { icon: 'cube', title: 'Products, sizes & photos', body: 'Give each product its own sizes and prices, a photo, SKU, and barcode.' },
    { icon: 'stock', title: 'Inventory tracking', body: 'Track stock per product; it updates with every sale, even across devices.' },
    { icon: 'qr', title: 'Cash & QR payments', body: 'Cash with automatic change, your own GCash or Maya QR, or QR Ph through PayMongo.' },
    { icon: 'discount', title: 'Senior & PWD ready', body: 'VAT-exempt discounts with the ID number and name recorded on the receipt.' },
    { icon: 'printer', title: 'Thermal receipts', body: 'Print itemized receipts on 58 or 80 mm printers, automatically if you like.' },
    { icon: 'chart', title: 'Sales reports', body: "See today's totals, filter by date or payment, and reprint any receipt." },
    { icon: 'users', title: 'Staff & roles', body: 'Create roles like Barista or Supervisor and choose which pages each can open.' },
];

const BUSINESSES: { icon: IconName; name: string; note: string }[] = [
    { icon: 'bag', name: 'Retail stores', note: 'Barcodes, stock, and quick checkout.' },
    { icon: 'cart', name: 'Groceries & sari-sari', note: 'Many items, small baskets, fast lines.' },
    { icon: 'cup', name: 'Cafés & milk tea', note: 'Sizes with their own prices.' },
    { icon: 'utensils', name: 'Restaurants & food stalls', note: 'Service charge and senior discounts.' },
    { icon: 'cake', name: 'Bakeries', note: 'Busy mornings, even offline.' },
    { icon: 'store', name: 'Specialty shops', note: 'Photos, categories, and staff roles.' },
];

const STEPS = [
    { title: 'Create your store', body: 'Sign up with your business name. You become the owner.' },
    { title: 'Add your products', body: 'Set prices, sizes, photos, barcodes, and stock.' },
    { title: 'Invite your team', body: 'Give each person a role with just the access they need.' },
    { title: 'Start selling', body: 'Open the register on any device and take your first order.' },
];

interface Plan {
    name: string;
    price: string;
    period?: string;
    description: string;
    features: string[];
    featured?: boolean;
}

const PLANS: Plan[] = [
    {
        name: 'Free',
        price: '₱0',
        period: 'forever',
        description: 'For new and small stores getting started.',
        features: ['1 store and 1 register', 'Up to 100 products', 'Offline selling with auto sync', 'Cash & QR payments', 'Barcode scanning'],
    },
    {
        name: 'Monthly',
        price: '₱199',
        period: '/month',
        description: 'For growing stores that need more room.',
        features: ['Everything in Free', 'Unlimited products', 'Unlimited registers and devices', 'Staff accounts with custom roles', 'Priority support'],
        featured: true,
    },
    {
        name: 'Custom',
        price: "Let's talk",
        description: 'For chains and businesses with special needs.',
        features: ['Everything in Monthly', 'Multiple branches', 'Custom integrations', 'Dedicated onboarding', 'Volume pricing'],
    },
];

const FAQS = [
    {
        q: 'Does it work without internet?',
        a: 'Yes. Open the register once while online so your products download. After that you can keep selling offline; sales are stored on the device and upload automatically when the connection returns. Only QR Ph through PayMongo needs internet at checkout.',
    },
    {
        q: 'What devices can I use?',
        a: 'Any device with a modern browser: a Windows or Mac computer, an Android tablet, an iPad, or a phone. You can also install it like an app from the browser.',
    },
    {
        q: 'Can I print receipts?',
        a: 'Yes. Receipts print through any printer installed on the device, including 58 mm and 80 mm thermal printers. You can turn on automatic printing after every sale and reprint past receipts from Sales.',
    },
    {
        q: 'Which payment methods are supported?',
        a: 'Cash with automatic change, plus one QR of your choice: your own GCash, Maya, or bank QR (the cashier confirms it and it works offline), or QR Ph through your own PayMongo account, which confirms the payment by itself. The QR also shows on the customer display.',
    },
    {
        q: 'How do Senior Citizen and PWD discounts work?',
        a: 'The cashier applies the discount and records the ID number and name. By default VAT is removed first and 20% is taken off, as in the Philippines; you can change the rate and VAT exemption in Settings.',
    },
    {
        q: 'Can I control what my staff can see?',
        a: 'Yes. Create roles and choose which pages each one can open: Point of Sale, Products, Categories, and Sales. Staff management and store settings stay with the owner.',
    },
    {
        q: 'Are the receipts BIR official receipts?',
        a: 'FinstackPOS prints itemized sales receipts with your TIN and VAT breakdown. It is not yet BIR-accredited, so check with your RDO before using its receipts as official receipts.',
    },
];

export default function Welcome({
    auth,
    canLogin,
    canRegister,
}: PageProps<{ canLogin: boolean; canRegister: boolean }>) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const heroVisual = useRef<HTMLDivElement>(null);
    useParallax(heroVisual, 0.06);

    const signedIn = Boolean(auth.user);
    const canSell = Boolean(auth.merchant && auth.can?.['pos.sell']);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 12);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <>
            <Head title="Point of Sale for Every Business" />

            <div className="min-h-screen overflow-x-clip bg-white text-ink-900 antialiased selection:bg-brand-600 selection:text-white">
                {/* Navbar */}
                <header
                    className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
                        scrolled || menuOpen
                            ? 'border-b border-gray-200/80 bg-white/85 shadow-[0_1px_0_rgba(17,17,17,0.02)] backdrop-blur-xl'
                            : 'border-b border-transparent bg-transparent'
                    }`}
                >
                    <Container className="flex h-16 items-center justify-between lg:h-[4.5rem]">
                        <a href="#top" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="FinstackPOS home">
                            <Logo />
                        </a>

                        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
                            {NAV_LINKS.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    className="relative rounded-lg px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                                >
                                    {link.label}
                                </a>
                            ))}
                        </nav>

                        <div className="flex items-center gap-2">
                            <InstallAppButton compact className="hidden md:inline-flex" />
                            {canLogin && (
                                <div className="hidden items-center gap-2 sm:flex">
                                    <AuthActions signedIn={signedIn} canSell={canSell} canRegister={canRegister} />
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => setMenuOpen((open) => !open)}
                                aria-expanded={menuOpen}
                                aria-controls="mobile-menu"
                                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                                className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-900 hover:bg-gray-100 md:hidden"
                            >
                                <LineIcon name={menuOpen ? 'close' : 'menu'} className="h-6 w-6" />
                            </button>
                        </div>
                    </Container>

                    {menuOpen && (
                        <div id="mobile-menu" className="border-t border-gray-100 bg-white md:hidden">
                            <Container className="space-y-1 py-4">
                                {NAV_LINKS.map((link) => (
                                    <a
                                        key={link.href}
                                        href={link.href}
                                        onClick={() => setMenuOpen(false)}
                                        className="block rounded-lg px-3 py-2.5 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-ink-900"
                                    >
                                        {link.label}
                                    </a>
                                ))}
                                <div className="grid gap-2 pt-3">
                                    <InstallAppButton variant="menu" />
                                    {canLogin && (
                                        <div className="grid gap-2 sm:hidden">
                                            <AuthActions signedIn={signedIn} canSell={canSell} canRegister={canRegister} stacked />
                                        </div>
                                    )}
                                </div>
                            </Container>
                        </div>
                    )}
                </header>

                <main id="top">
                    {/* Hero */}
                    <section className="relative isolate overflow-hidden pt-28 sm:pt-32 lg:pt-40">
                        {/* Fine grid that fades out: structure, not decoration */}
                        <div
                            aria-hidden
                            className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(17,17,17,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,17,17,0.045)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,black,transparent)]"
                        />

                        <Container className="text-center">
                            <p className="mx-auto inline-flex animate-rise items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm sm:text-sm">
                                <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-brand-500 to-brand-700" />
                                Point of sale for small businesses in the Philippines
                            </p>

                            <h1 className="mx-auto mt-7 max-w-4xl animate-rise text-[2.6rem] font-extrabold leading-[1.04] tracking-[-0.035em] [text-wrap:balance] [animation-delay:80ms] sm:text-6xl lg:text-7xl">
                                Run your business.{' '}
                                <span className="animate-gradient-x bg-gradient-to-r from-brand-500 via-brand-700 to-brand-500 bg-[length:200%_auto] bg-clip-text text-transparent">
                                    Smarter
                                </span>{' '}
                                with one POS.
                            </h1>

                            <p className="mx-auto mt-6 max-w-2xl animate-rise text-base leading-7 text-gray-600 [animation-delay:160ms] sm:text-lg sm:leading-8">
                                Sell, track inventory, and see every sale from one register,
                                built for retail stores, groceries, cafés, restaurants, and
                                growing small businesses. It keeps working even when the
                                internet doesn't.
                            </p>

                            <div className="mt-9 flex animate-rise flex-col justify-center gap-3 [animation-delay:240ms] sm:flex-row">
                                {signedIn ? (
                                    canSell ? (
                                        <PrimaryCta href={route('pos.index')} fullReload>Open POS</PrimaryCta>
                                    ) : (
                                        <PrimaryCta href={route('dashboard')}>Go to dashboard</PrimaryCta>
                                    )
                                ) : (
                                    canRegister && <PrimaryCta href={route('register')}>Get started free</PrimaryCta>
                                )}
                                <a
                                    href="#features"
                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-6 py-3.5 text-[15px] font-semibold text-ink-900 transition hover:border-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                                >
                                    Explore features
                                </a>
                            </div>

                            <ul className="mt-8 flex animate-rise flex-wrap justify-center gap-x-7 gap-y-2 text-sm text-gray-500 [animation-delay:320ms]">
                                {['Free plan available', 'Works offline', 'QR Ph & GCash ready'].map((item) => (
                                    <li key={item} className="flex items-center gap-2">
                                        <LineIcon name="check" className="h-4 w-4 text-brand-600" strokeWidth={2.5} />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </Container>

                        {/* Dashboard visual with soft red lighting beneath it */}
                        <Container className="relative mt-16 sm:mt-20">
                            <div
                                aria-hidden
                                className="absolute inset-x-[8%] bottom-[-6%] top-[30%] -z-10 rounded-[50%] bg-[radial-gradient(closest-side,rgba(255,48,48,0.35),rgba(200,16,46,0.12)_55%,transparent)] blur-2xl"
                            />
                            <div ref={heroVisual} className="mx-auto max-w-5xl [transform:translateY(var(--parallax,0px))]">
                                <div className="animate-rise [animation-delay:420ms]">
                                    <video
                                        className="w-full rounded-2xl bg-gray-950 shadow-2xl shadow-red-900/20 ring-1 ring-black/10"
                                        src="/FinstackPOS-Promo-v2.mp4"
                                        autoPlay
                                        muted
                                        loop
                                        playsInline
                                        preload="metadata"
                                        aria-label="FinstackPOS promo video"
                                    />
                                </div>
                            </div>
                        </Container>
                        <div aria-hidden className="h-24 bg-gradient-to-b from-transparent to-white sm:h-32" />
                    </section>

                    {/* Problems we solve */}
                    <section className="border-y border-gray-100 bg-gray-50/70 py-24 sm:py-28 lg:py-32">
                        <Container className="grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
                            <Reveal>
                                <Eyebrow>Why FinstackPOS</Eyebrow>
                                <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-0.025em] [text-wrap:balance] sm:text-4xl lg:text-[2.75rem]">
                                    Built for the realities of running a store.
                                </h2>
                                <p className="mt-5 max-w-md text-base leading-7 text-gray-600 sm:text-lg">
                                    Busy lunch hours, patchy connections, and a team that changes
                                    shifts. FinstackPOS handles the everyday problems so you can
                                    focus on customers.
                                </p>
                            </Reveal>

                            <ul className="divide-y divide-gray-200 border-y border-gray-200">
                                {PROBLEMS.map((item, i) => (
                                    <Reveal as="li" key={item.problem} delay={i * 90} className="flex gap-5 py-7">
                                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm ring-1 ring-gray-200">
                                            <LineIcon name={item.icon} className="h-5 w-5" />
                                        </span>
                                        <div>
                                            <p className="font-semibold text-gray-500">{item.problem}</p>
                                            <p className="mt-1.5 text-lg font-bold leading-snug text-ink-900">{item.solution}</p>
                                        </div>
                                    </Reveal>
                                ))}
                            </ul>
                        </Container>
                    </section>

                    {/* A sale in 3D */}
                    <section id="live-sale" className="relative isolate scroll-mt-20 overflow-hidden py-24 sm:py-28 lg:py-32">
                        <div
                            aria-hidden
                            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_75%_45%,rgba(255,48,48,0.10),transparent_70%),linear-gradient(to_bottom,#fff,#F7F8FA_40%,#fff)]"
                        />
                        <div
                            aria-hidden
                            className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(17,17,17,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,17,17,0.04)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_55%_60%_at_70%_50%,black,transparent)]"
                        />
                        <Container>
                            <Reveal className="max-w-2xl">
                                <Eyebrow>See it in action</Eyebrow>
                                <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-0.025em] [text-wrap:balance] sm:text-4xl lg:text-[2.75rem]">
                                    One sale, from tap to receipt.
                                </h2>
                                <p className="mt-5 text-base leading-7 text-gray-600 sm:text-lg">
                                    Ring up the order, let the customer scan to pay, and the
                                    receipt prints while stock and sales sync on their own.
                                    On a computer, move your mouse over the register to look around.
                                </p>
                            </Reveal>
                            <Reveal delay={120} className="mt-14">
                                <Transaction3D />
                            </Reveal>
                        </Container>
                    </section>

                    {/* Features */}
                    <section id="features" className="scroll-mt-20 py-24 sm:py-28 lg:py-32">
                        <Container>
                            <Reveal className="max-w-2xl">
                                <Eyebrow>Features</Eyebrow>
                                <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-0.025em] [text-wrap:balance] sm:text-4xl lg:text-[2.75rem]">
                                    Everything the counter needs. Nothing it doesn't.
                                </h2>
                                <p className="mt-5 text-base leading-7 text-gray-600 sm:text-lg">
                                    From the first tap to the printed receipt and the end-of-day
                                    total, every step lives in one place.
                                </p>
                            </Reveal>

                            <div className="mt-16 grid overflow-hidden rounded-3xl border border-gray-200 bg-gray-200 [gap:1px] sm:grid-cols-2 lg:grid-cols-3">
                                {FEATURES.map((feature, i) => (
                                    <Reveal
                                        key={feature.title}
                                        delay={(i % 3) * 80}
                                        className="group relative bg-white p-7 transition-colors duration-300 hover:bg-gray-50/80 lg:p-9"
                                    >
                                        <span
                                            aria-hidden
                                            className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-brand-500 to-brand-700 transition-transform duration-500 group-hover:scale-x-100"
                                        />
                                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-900 text-white transition duration-300 group-hover:bg-gradient-to-br group-hover:from-brand-500 group-hover:to-brand-700 group-hover:shadow-lg group-hover:shadow-brand-600/30">
                                            <LineIcon name={feature.icon} className="h-5 w-5" />
                                        </span>
                                        <h3 className="mt-6 text-lg font-bold">{feature.title}</h3>
                                        <p className="mt-2 text-[15px] leading-6 text-gray-600">{feature.body}</p>
                                    </Reveal>
                                ))}
                            </div>
                        </Container>
                    </section>

                    {/* Product showcase */}
                    <section className="relative overflow-hidden bg-ink-900 py-24 text-white sm:py-28 lg:py-32">
                        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/70 to-transparent" />
                        <Container>
                            <Reveal className="max-w-2xl">
                                <Eyebrow dark>The register</Eyebrow>
                                <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-0.025em] [text-wrap:balance] sm:text-4xl lg:text-[2.75rem]">
                                    A sale in three steps.
                                </h2>
                                <p className="mt-5 text-base leading-7 text-white/60 sm:text-lg">
                                    Designed for speed at the counter, with large touch targets
                                    for tablets and keyboard and scanner support on desktops.
                                </p>
                            </Reveal>
                            <Reveal delay={120} className="mt-14">
                                <Showcase />
                            </Reveal>
                        </Container>
                    </section>

                    {/* Business types */}
                    <section className="py-24 sm:py-28 lg:py-32">
                        <Container>
                            <Reveal className="mx-auto max-w-2xl text-center">
                                <Eyebrow>Who it's for</Eyebrow>
                                <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-0.025em] [text-wrap:balance] sm:text-4xl lg:text-[2.75rem]">
                                    Made for businesses that serve people all day.
                                </h2>
                            </Reveal>

                            <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-6">
                                {BUSINESSES.map((b, i) => (
                                    <Reveal key={b.name} delay={i * 60} className="group text-center">
                                        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-200 bg-white text-ink-900 transition duration-300 group-hover:-translate-y-1 group-hover:border-brand-500/40 group-hover:text-brand-600 group-hover:shadow-[0_18px_40px_-18px_rgba(200,16,46,0.45)]">
                                            <LineIcon name={b.icon} className="h-7 w-7" />
                                        </span>
                                        <h3 className="mt-4 font-bold">{b.name}</h3>
                                        <p className="mt-1 text-sm text-gray-500">{b.note}</p>
                                    </Reveal>
                                ))}
                            </div>
                        </Container>
                    </section>

                    {/* How it works */}
                    <section id="how-it-works" className="scroll-mt-20 border-y border-gray-100 bg-gray-50/70 py-24 sm:py-28 lg:py-32">
                        <Container>
                            <Reveal className="max-w-2xl">
                                <Eyebrow>How it works</Eyebrow>
                                <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-0.025em] [text-wrap:balance] sm:text-4xl lg:text-[2.75rem]">
                                    Set up in an afternoon.
                                </h2>
                            </Reveal>

                            <ol className="relative mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
                                <div aria-hidden className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-brand-500 via-gray-300 to-gray-200 lg:block" />
                                {STEPS.map((step, i) => (
                                    <Reveal as="li" key={step.title} delay={i * 110} className="relative">
                                        <span
                                            className={`relative flex h-12 w-12 items-center justify-center rounded-full text-base font-extrabold ring-8 ring-gray-50 ${
                                                i === 0
                                                    ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30'
                                                    : 'bg-ink-900 text-white'
                                            }`}
                                        >
                                            {i + 1}
                                        </span>
                                        <h3 className="mt-6 text-lg font-bold">{step.title}</h3>
                                        <p className="mt-2 text-[15px] leading-6 text-gray-600">{step.body}</p>
                                    </Reveal>
                                ))}
                            </ol>
                        </Container>
                    </section>

                    {/* Pricing */}
                    <section id="pricing" className="scroll-mt-20 py-24 sm:py-28 lg:py-32">
                        <Container>
                            <Reveal className="mx-auto max-w-2xl text-center">
                                <Eyebrow>Pricing</Eyebrow>
                                <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-0.025em] [text-wrap:balance] sm:text-4xl lg:text-[2.75rem]">
                                    Start free. Upgrade when you grow.
                                </h2>
                                <p className="mt-5 text-base leading-7 text-gray-600 sm:text-lg">No hidden fees.</p>
                            </Reveal>

                            <div className="mx-auto mt-16 grid max-w-6xl items-stretch gap-6 lg:grid-cols-3">
                                {PLANS.map((plan, i) => (
                                    <Reveal key={plan.name} delay={i * 100} className="flex">
                                        <PlanCard plan={plan} signedIn={signedIn} canRegister={canRegister} />
                                    </Reveal>
                                ))}
                            </div>
                        </Container>
                    </section>

                    {/* FAQ */}
                    <section id="faq" className="scroll-mt-20 border-t border-gray-100 bg-gray-50/70 py-24 sm:py-28 lg:py-32">
                        <Container className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
                            <Reveal>
                                <Eyebrow>FAQ</Eyebrow>
                                <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-0.025em] [text-wrap:balance] sm:text-4xl lg:text-[2.75rem]">
                                    Questions, answered.
                                </h2>
                                <p className="mt-5 max-w-sm text-base leading-7 text-gray-600">
                                    Everything you need to know before opening your first
                                    register.
                                </p>
                            </Reveal>

                            <Reveal delay={100} className="divide-y divide-gray-200 border-y border-gray-200">
                                {FAQS.map((faq) => (
                                    <details key={faq.q} className="group py-1 [&_summary::-webkit-details-marker]:hidden">
                                        <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-lg py-5 text-left text-base font-bold text-ink-900 transition-colors hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:text-lg">
                                            {faq.q}
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-300 text-gray-500 transition duration-300 group-open:rotate-180 group-open:border-brand-600 group-open:bg-brand-600 group-open:text-white">
                                                <LineIcon name="chevron" className="h-4 w-4" strokeWidth={2} />
                                            </span>
                                        </summary>
                                        <p className="pb-6 pr-12 text-[15px] leading-7 text-gray-600">{faq.a}</p>
                                    </details>
                                ))}
                            </Reveal>
                        </Container>
                    </section>

                    {/* Final CTA */}
                    <section className="relative isolate overflow-hidden bg-ink-900 py-24 text-white sm:py-28">
                        <div
                            aria-hidden
                            className="absolute -bottom-40 left-1/2 -z-10 h-80 w-[56rem] max-w-[160%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(255,48,48,0.45),transparent)] blur-2xl"
                        />
                        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                        <Container>
                            <Reveal className="mx-auto max-w-3xl text-center">
                                <h2 className="text-4xl font-extrabold leading-tight tracking-[-0.03em] [text-wrap:balance] sm:text-5xl lg:text-6xl">
                                    Open your register{' '}
                                    <span className="animate-gradient-x bg-gradient-to-r from-brand-400 via-brand-600 to-brand-400 bg-[length:200%_auto] bg-clip-text text-transparent">
                                        today.
                                    </span>
                                </h2>
                                <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-white/60">
                                    Create your store in minutes and make your first sale on the
                                    free plan.
                                </p>
                                <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
                                    {signedIn ? (
                                        canSell ? (
                                            <PrimaryCta href={route('pos.index')} fullReload>Open POS</PrimaryCta>
                                        ) : (
                                            <PrimaryCta href={route('dashboard')}>Go to dashboard</PrimaryCta>
                                        )
                                    ) : (
                                        <>
                                            {canRegister && <PrimaryCta href={route('register')}>Get started free</PrimaryCta>}
                                            {canLogin && (
                                                <Link
                                                    href={route('login')}
                                                    className="inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3.5 text-[15px] font-semibold text-white transition hover:border-white/60 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                                                >
                                                    Log in
                                                </Link>
                                            )}
                                        </>
                                    )}
                                </div>
                            </Reveal>
                        </Container>
                    </section>
                </main>

                <Footer signedIn={signedIn} canSell={canSell} canRegister={canRegister} />
            </div>
        </>
    );
}

function Container({ className = '', children }: { className?: string; children: ReactNode }) {
    return <div className={`mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10 ${className}`}>{children}</div>;
}

/** The Finstack lockup from /public; the white version is for dark areas. */
function Logo({ inverted = false }: { inverted?: boolean }) {
    return (
        <img
            src={inverted ? '/logo-white.png' : '/logo.png'}
            alt="Finstack"
            width={1320}
            height={288}
            className="h-9 w-auto sm:h-10"
        />
    );
}

function Eyebrow({ dark = false, children }: { dark?: boolean; children: ReactNode }) {
    return (
        <p className={`inline-flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.18em] ${dark ? 'text-brand-400' : 'text-brand-700'}`}>
            <span className="h-px w-6 bg-gradient-to-r from-brand-500 to-brand-700" />
            {children}
        </p>
    );
}

/**
 * Red gradient call to action with a sheen on hover. POS links need
 * `fullReload` (a plain anchor) so the service worker caches the register.
 */
function PrimaryCta({ href, fullReload = false, children }: { href: string; fullReload?: boolean; children: ReactNode }) {
    const className =
        'group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_12px_30px_-10px_rgba(200,16,46,0.7)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-12px_rgba(200,16,46,0.8)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';
    const content = (
        <>
            <span aria-hidden className="absolute inset-y-0 left-0 w-1/3 -translate-x-[120%] bg-white/25 blur-md group-hover:animate-sheen" />
            <span className="relative">{children}</span>
            <LineIcon name="arrow" className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={2} />
        </>
    );

    return fullReload ? (
        <a href={href} className={className}>{content}</a>
    ) : (
        <Link href={href} className={className}>{content}</Link>
    );
}

function AuthActions({
    signedIn,
    canSell,
    canRegister,
    stacked = false,
}: {
    signedIn: boolean;
    canSell: boolean;
    canRegister: boolean;
    stacked?: boolean;
}) {
    const secondary = `rounded-lg px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        stacked ? 'border border-gray-300 text-center' : ''
    }`;
    const primary = `rounded-lg bg-ink-900 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-gradient-to-r hover:from-brand-500 hover:to-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2`;

    if (signedIn) {
        return (
            <>
                <Link href={route('dashboard')} className={secondary}>Dashboard</Link>
                {canSell && <a href={route('pos.index')} className={primary}>Open POS</a>}
            </>
        );
    }

    return (
        <>
            <Link href={route('login')} className={secondary}>Log in</Link>
            {canRegister && <Link href={route('register')} className={primary}>Get started</Link>}
        </>
    );
}

function PlanCard({ plan, signedIn, canRegister }: { plan: Plan; signedIn: boolean; canRegister: boolean }) {
    const dark = plan.featured;
    const isCustom = plan.name === 'Custom';

    let cta: ReactNode = null;
    const ctaClass = `mt-9 block rounded-xl px-6 py-3.5 text-center text-[15px] font-semibold transition duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
        dark
            ? 'bg-gradient-to-r from-brand-500 to-brand-700 text-white shadow-[0_12px_30px_-10px_rgba(255,48,48,0.7)] hover:-translate-y-0.5'
            : 'border border-gray-300 text-ink-900 hover:border-ink-900 hover:bg-ink-900 hover:text-white'
    }`;

    if (isCustom && SALES_EMAIL) {
        cta = <a href={`mailto:${SALES_EMAIL}`} className={ctaClass}>Contact sales</a>;
    } else if (signedIn) {
        cta = <Link href={route('dashboard')} className={ctaClass}>Go to dashboard</Link>;
    } else if (canRegister) {
        cta = (
            <Link href={route('register')} className={ctaClass}>
                {isCustom ? 'Start free, then talk to us' : plan.featured ? 'Choose Monthly' : 'Start for free'}
            </Link>
        );
    }

    return (
        <article
            className={`relative flex w-full flex-col rounded-3xl p-8 transition duration-300 lg:p-9 ${
                dark
                    ? 'bg-ink-900 text-white shadow-[0_40px_80px_-30px_rgba(17,17,17,0.6)] lg:-my-4 lg:py-12'
                    : 'bg-white ring-1 ring-gray-200 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(17,17,17,0.25)]'
            }`}
        >
            {dark && (
                <>
                    <span aria-hidden className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-brand-500 to-transparent" />
                    <span className="absolute right-6 top-6 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                        Most popular
                    </span>
                </>
            )}
            <h3 className="text-lg font-bold">{plan.name}</h3>
            <p className={`mt-1.5 text-sm ${dark ? 'text-white/60' : 'text-gray-600'}`}>{plan.description}</p>
            <p className="mt-7 flex items-baseline gap-1.5">
                <span className="text-5xl font-extrabold tracking-[-0.03em]">{plan.price}</span>
                {plan.period && <span className={`text-sm ${dark ? 'text-white/50' : 'text-gray-500'}`}>{plan.period}</span>}
            </p>
            <div className={`my-8 h-px ${dark ? 'bg-white/10' : 'bg-gray-100'}`} />
            <ul className="flex-1 space-y-3.5">
                {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3 text-[15px]">
                        <LineIcon name="check" className={`mt-0.5 h-5 w-5 shrink-0 ${dark ? 'text-brand-400' : 'text-brand-600'}`} strokeWidth={2.25} />
                        <span className={dark ? 'text-white/85' : 'text-gray-700'}>{feature}</span>
                    </li>
                ))}
            </ul>
            {cta}
        </article>
    );
}

function Footer({ signedIn, canSell, canRegister }: { signedIn: boolean; canSell: boolean; canRegister: boolean }) {
    const linkClass = 'text-sm text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:text-white';

    return (
        <footer className="border-t border-white/10 bg-ink-900 text-white">
            <Container className="grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-12">
                <div className="sm:col-span-2 lg:col-span-6">
                    <Logo inverted />
                    <p className="mt-5 max-w-sm text-sm leading-6 text-white/55">
                        A point of sale for small businesses: fast checkout, inventory,
                        and sales in one place, online or offline.
                    </p>
                </div>
                <nav aria-label="Product" className="lg:col-span-3">
                    <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white/80">Product</h3>
                    <ul className="mt-5 space-y-3">
                        {NAV_LINKS.map((link) => (
                            <li key={link.href}>
                                <a href={link.href} className={linkClass}>{link.label}</a>
                            </li>
                        ))}
                    </ul>
                </nav>
                <nav aria-label="Account" className="lg:col-span-3">
                    <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white/80">Account</h3>
                    <ul className="mt-5 space-y-3">
                        {signedIn ? (
                            <>
                                <li><Link href={route('dashboard')} className={linkClass}>Dashboard</Link></li>
                                {canSell && <li><a href={route('pos.index')} className={linkClass}>Open POS</a></li>}
                                <li><Link href={route('profile.edit')} className={linkClass}>Profile</Link></li>
                            </>
                        ) : (
                            <>
                                <li><Link href={route('login')} className={linkClass}>Log in</Link></li>
                                {canRegister && <li><Link href={route('register')} className={linkClass}>Create a store</Link></li>}
                                <li><Link href={route('password.request')} className={linkClass}>Forgot password</Link></li>
                            </>
                        )}
                    </ul>
                </nav>
            </Container>
            <div className="border-t border-white/10">
                <Container className="flex flex-col items-center justify-between gap-2 py-6 text-xs text-white/45 sm:flex-row sm:text-sm">
                    <p>&copy; {new Date().getFullYear()} FinstackPOS. All rights reserved.</p>
                    <p>Built for small businesses.</p>
                </Container>
            </div>
        </footer>
    );
}
