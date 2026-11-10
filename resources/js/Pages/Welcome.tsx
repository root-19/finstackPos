import BookDemo, { DemoOptions } from '@/Components/Landing/BookDemo';
import { PhoneFrame } from '@/Components/Landing/DeviceFrames';
import Faq, { FaqItem } from '@/Components/Landing/Faq';
import LineIcon from '@/Components/Landing/LineIcon';
import MarketingLayout, { useVisitor } from '@/Components/Landing/MarketingLayout';
import { formatMoney } from '@/lib/money';
import { PRO_MODULES } from '@/lib/proModules';
import { PageProps } from '@/types';
import { Head } from '@inertiajs/react';
import { ReactNode } from 'react';

/**
 * The public landing page: a dark "shop floor" with paper sections, numbered
 * like a work order. Every claim is checked against the code: Free vs Pro
 * follows the routes' `subscribed` middleware and Merchant::tableOrderingActive;
 * prices come from Admin → Pricing. Don't add a claim the app can't back up.
 */

type Props = PageProps<{
    canLogin: boolean;
    canRegister: boolean;
    /** From Admin → Pricing (App\Support\Platform). */
    pricing: { price_cents: number; max_months: number; free_product_limit: number };
    trial: { days: number };
    /** "Book a demo" slots and dates (same as the server's validation). */
    demo: DemoOptions;
}>;

/** Screenshots of the real app (demo store), see database/seeders/LandingDemoSeeder.php. */
const SHOTS = {
    register: { src: '/landing/register.webp', width: 1180, height: 820 },
    checkout: { src: '/landing/checkout-gcash.webp', width: 390, height: 844 },
    orders: { src: '/landing/orders.webp', width: 1180, height: 820 },
    inventory: { src: '/landing/inventory.webp', width: 1180, height: 820 },
    payslip: { src: '/landing/payslip.webp', width: 1180, height: 820 },
};

const FEATURES: { title: string; body: string; tags: string[]; pro?: boolean }[] = [
    { title: 'Sell', body: 'Fast checkout with barcode scanning that keeps working when the internet drops.', tags: ['Cash · GCash · Maya · QR Ph', 'Senior & PWD', '58 / 80 mm receipts'] },
    { title: 'Serve', body: 'Table QR menus and a customer display. On Pro, tables order and pay from their phones and orders land on a kitchen board.', tags: ['QR menus', 'Customer display', 'Orders board · Pro'] },
    { title: 'Stock', body: 'Inventory, recipes and suppliers. Stock goes down with every sale and low items stand out.', tags: ['Recipes', 'Low stock', 'CSV export'] },
    { title: 'Team & payroll', body: 'Schedules, attendance and payroll with SSS, PhilHealth and Pag-IBIG deductions, plus payslips.', tags: ['Time clock', 'Payslips'], pro: true },
    { title: 'Branches', body: 'Run more than one location, with sales and stock per branch and staff tied to a branch.', tags: ['Per-branch stock'], pro: true },
    { title: 'Sales & reports', body: "Every sale with its cashier, payment and time. Filter by day and reprint any receipt.", tags: ['Daily totals', 'Reprints'] },
];

const STEPS: { title: string; body: string; pro?: boolean }[] = [
    { title: 'Create your store', body: 'Sign up with your business name. You become the owner.' },
    { title: 'Add your products', body: 'Prices, sizes, photos, barcodes and stock.' },
    { title: 'Invite your team', body: 'Give each person a role with just the access they need.', pro: true },
    { title: 'Start selling', body: 'Open the register on any device and ring up your first sale.' },
];

/** Only what the code supports: printing goes through the device's print dialog; scanners type like a keyboard. */
const WORKS_WITH = ['58 / 80 mm thermal printers', 'USB & Bluetooth barcode scanners', 'Android tablets', 'iPad', 'Windows & Mac', 'Phones', 'Second-screen customer display'];

const FREE_FEATURES = ['POS that works offline', 'Cash, GCash / Maya QR and QR Ph', 'Senior & PWD discounts', 'Thermal receipts, 58 or 80 mm', 'Inventory, recipes and suppliers', 'Sales history and reports', 'Table QR menus (view only)'];

/** Pro is built from PRO_MODULES, the same list as the app's sidebar, so new modules show up here too. */
const PRO_FEATURES = ['Everything in Free', 'Unlimited products', 'Order & pay from the table, with an orders board', ...PRO_MODULES.map((m) => m.feature), 'Payroll and schedule reports'];

/** Real customer quotes only. Empty until a customer agrees to be quoted; never invent one. */
const TESTIMONIALS: { quote: string; name: string; business: string }[] = [];

export default function Welcome({ pricing, trial, demo }: Props) {
    const { signedIn, startHref, startLabel } = useVisitor();
    const trialDays = signedIn ? 0 : trial.days;

    return (
        <>
            <Head title="POS, inventory and payroll for PH small businesses" />

            <MarketingLayout home>
                <Hero trialDays={trialDays} startHref={startHref} startLabel={startLabel} />
                <Marquee items={['Free plan', 'Works offline', 'GCash', 'Maya', 'QR Ph', 'Senior & PWD', 'Thermal receipts', 'Payroll']} tone="red" />
                <Marquee items={['Sari-sari', 'Groceries', 'Cafés', 'Milk tea', 'Bakeries', 'Restaurants', 'Food stalls', 'Retail', 'Specialty shops']} tone="paper" reverse />
                <Features />
                <HowItWorks maxMonths={pricing.max_months} />
                <Pricing pricing={pricing} trialDays={trial.days} signedIn={signedIn} />
                <BookDemo options={demo} />
                {TESTIMONIALS.length > 0 && <Testimonials />}
                <FaqSection trialDays={trial.days} maxMonths={pricing.max_months} />
                <FinalCta startHref={startHref} startLabel={startLabel} />
            </MarketingLayout>
        </>
    );
}

/* ---------------------------------------------------------------- Hero */

function Hero({ trialDays, startHref, startLabel }: { trialDays: number; startHref: string; startLabel: string }) {
    const chips = ['Free plan', 'Works offline', 'GCash / Maya / QR Ph', 'Senior & PWD ready', ...(trialDays > 0 ? [`Pro free for ${trialDays} days`] : [])];

    return (
        <section className="mk-heat relative overflow-hidden">
            <div aria-hidden className="mk-halftone pointer-events-none absolute inset-y-0 right-0 w-1/2 text-shop-paper/[0.06] [mask-image:linear-gradient(to_left,black,transparent)]" />
            <div className="mk-container relative grid items-center gap-14 pb-20 pt-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12 lg:pb-28 lg:pt-20">
                <div>
                    <p className="mk-label text-shop-paper/70">[ Register 01 / Point of sale ]</p>
                    <h1 className="mk-h1 mt-6">
                        POS, inventory
                        <br />
                        and payroll
                        <br />
                        <span className="text-brand-500">in one app.</span>
                    </h1>
                    <p className="mt-7 max-w-xl text-lg text-shop-paper/75 sm:text-xl">Sell, track stock and pay your team from any device, even when the internet drops.</p>
                    <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                        <a href={startHref} className="mk-btn-red">
                            {startLabel}
                            <LineIcon name="arrow" className="h-4 w-4" strokeWidth={2} />
                        </a>
                        <a href="#features" className="mk-btn-line text-shop-paper">
                            See what's included
                        </a>
                    </div>
                    <ul className="mt-9 flex flex-wrap gap-2">
                        {chips.map((chip) => (
                            <li key={chip} className="mk-chip border-shop-paper/25 text-shop-paper/85">
                                {chip}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* The live register, as a ticket from the counter. */}
                <div className="relative mx-auto w-full max-w-[600px] pb-8 pr-6 sm:pr-12">
                    <div className="mk-ticket px-4 pb-5 pt-4 sm:px-6">
                        <div className="flex items-center justify-between gap-3">
                            <p className="mk-label">Register · live</p>
                            <p className="mk-label flex items-center gap-2 text-shop-ink/70">
                                <span aria-hidden className="h-2 w-2 rounded-full bg-brand-700" />
                                Online
                            </p>
                        </div>
                        <div className="mt-3 overflow-hidden border border-shop-ink/80 bg-white">
                            <img
                                {...SHOTS.register}
                                {...({ fetchpriority: 'high' } as object)}
                                decoding="async"
                                alt="The FinstackPOS register in a demo café: product tiles like Ensaymada ₱45.00 and Iced Americano ₱110.00, and a current sale of Milk Tea Large, 2 Ensaymada and Turon totaling ₱245.00."
                                className="block h-auto w-full"
                            />
                        </div>
                        <div aria-hidden className="mk-perf mt-4 text-shop-ink/40" />
                        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 font-plex text-[13px]">
                            {[
                                ['Payments', 'Cash · QR'],
                                ['Offline', 'Sells & syncs'],
                                ['Receipts', '58 / 80 mm'],
                                ['Total', '₱245.00'],
                            ].map(([term, value]) => (
                                <div key={term} className="flex justify-between gap-2 border-b border-shop-ink/15 py-1">
                                    <dt className="uppercase tracking-[0.12em] text-shop-ink/65">{term}</dt>
                                    <dd className="font-semibold">{value}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                    <PhoneFrame
                        {...SHOTS.checkout}
                        alt="Checkout on a phone: amount due ₱245.00, QR · GCash selected, and the store's QR code for the customer to scan."
                        className="absolute bottom-0 right-0 w-[28%] min-w-[96px] rotate-[4deg]"
                        loading="lazy"
                    />
                </div>
            </div>
        </section>
    );
}

/* ------------------------------------------------------------- Marquee */

/** A looping strip of words. The first copy is the readable list; the second (for the seamless loop) is hidden from screen readers. */
function Marquee({ items, tone, reverse = false }: { items: string[]; tone: 'red' | 'paper'; reverse?: boolean }) {
    const colors = tone === 'red' ? 'bg-brand-700 text-white' : 'bg-shop-paper text-shop-ink';
    const track = (hidden: boolean) => (
        <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
            {items.map((item) => (
                <li key={item} className="flex items-center whitespace-nowrap px-5 font-display text-2xl uppercase sm:text-3xl">
                    {item}
                    <span aria-hidden className="pl-10 text-xl">
                        ✶
                    </span>
                </li>
            ))}
        </ul>
    );

    return (
        <div className={`overflow-hidden py-4 ${colors}`}>
            <div className={`mk-marquee flex w-max ${reverse ? '[animation-direction:reverse]' : ''}`}>
                {track(false)}
                {track(true)}
            </div>
        </div>
    );
}

/* ---------------------------------------------------- 01 — Features */

function ProTag({ inverted = false }: { inverted?: boolean }) {
    return <span className={`inline-block px-2 py-0.5 font-plex text-[12px] font-semibold uppercase tracking-[0.16em] ${inverted ? 'bg-shop-paper text-brand-800' : 'bg-brand-700 text-white'}`}>Pro</span>;
}

function SectionHead({ id, num, label, title, sub, dark = false }: { id: string; num: string; label: string; title: ReactNode; sub?: string; dark?: boolean }) {
    return (
        <div className="max-w-3xl">
            <p className={`mk-label ${dark ? 'text-brand-500' : 'text-brand-700'}`}>
                {num} — {label}
            </p>
            <h2 id={id} className="mk-h2 mt-4">
                {title}
            </h2>
            {sub && <p className={`mt-6 max-w-xl text-lg ${dark ? 'text-shop-paper/75' : 'text-shop-ink/75'}`}>{sub}</p>}
        </div>
    );
}

function Features() {
    return (
        <section id="features" aria-labelledby="features-title" className="mk-section scroll-mt-16 bg-shop-paper text-shop-ink">
            <div className="mk-container">
                <SectionHead
                    id="features-title"
                        num="01"
                        label="Features"
                        title={
                            <>
                                Everything the counter needs.{' '}
                                <span className="underline decoration-brand-700 decoration-dashed decoration-[3px] underline-offset-[10px]">Nothing it doesn't.</span>
                            </>
                        }
                        sub="One app for the register, the stockroom and the team. Free to start; Pro when you grow."
                    />

                <ul className="mt-14 border-t border-shop-ink/20">
                    {FEATURES.map((f, i) => (
                        <li key={f.title} className="mk-row group border-b border-shop-ink/20">
                            <div className="grid gap-3 px-2 py-7 transition-colors duration-300 group-hover:text-white sm:px-4 lg:grid-cols-[80px_minmax(0,1fr)_minmax(0,1.3fr)_auto] lg:items-center lg:gap-8">
                                <span className="font-plex text-[13px] text-brand-700 transition-colors group-hover:text-white/85">{String(i + 1).padStart(2, '0')}</span>
                                <h3 className="flex items-center gap-3 font-display text-4xl uppercase leading-none sm:text-5xl">
                                    {f.title}
                                    {f.pro && <span className="group-hover:hidden"><ProTag /></span>}
                                    {f.pro && <span className="hidden group-hover:inline"><ProTag inverted /></span>}
                                </h3>
                                <p className="max-w-xl text-shop-ink/75 transition-colors group-hover:text-white/85">{f.body}</p>
                                <ul className="flex flex-wrap gap-2 lg:justify-end">
                                    {f.tags.map((tag) => (
                                        <li key={tag} className="mk-chip border-shop-ink/25 text-shop-ink/80 transition-colors group-hover:border-white/40 group-hover:text-white">
                                            {tag}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </li>
                    ))}
                </ul>

                {/* Straight from the app. */}
                <div className="mt-16 grid gap-6 md:grid-cols-3">
                    {[
                        { shot: SHOTS.orders, fig: '02', caption: 'Orders board (Pro)', alt: 'The table orders board with New, Preparing and Ready to serve columns, showing orders from Tables 1 to 4.' },
                        { shot: SHOTS.inventory, fig: '03', caption: 'Inventory', alt: 'The inventory page: 7 supplies, 3 low on stock, with flour, brown sugar and coffee beans listed.' },
                        { shot: SHOTS.payslip, fig: '04', caption: 'Payslip (Pro)', alt: 'A payslip for a cook: gross ₱10,004.35, SSS, PhilHealth and Pag-IBIG deductions, net pay ₱9,185.38.' },
                    ].map(({ shot, fig, caption, alt }) => (
                        <figure key={fig}>
                            <div className="h-56 overflow-hidden border border-shop-ink bg-white sm:h-64">
                                <img {...shot} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover object-left-top" />
                            </div>
                            <figcaption className="mk-label mt-3 text-shop-ink/70">
                                fig. {fig} — {caption}
                            </figcaption>
                        </figure>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ----------------------------------------------------- 02 — How it works */

function HowItWorks({ maxMonths }: { maxMonths: number }) {
    const rules = [
        { title: 'Your data stays yours', body: "Each store's data is kept separate. Employees' government IDs are encrypted, owner only. Export inventory and stock history to CSV." },
        { title: 'The register keeps selling', body: 'Offline sales are saved on the device and sync by themselves when the internet is back.' },
        { title: 'No hidden fees', body: `Pro is prepaid with QR Ph, 1 to ${maxMonths} months at a time, with no auto-renewal.` },
        { title: 'Honest about BIR', body: 'Receipts show your TIN and VAT, but FinstackPOS is not yet BIR-accredited. Check with your RDO.' },
    ];

    return (
        <section id="how" aria-labelledby="how-title" className="mk-section scroll-mt-16 bg-shop-ink">
            <div className="mk-container">
                <SectionHead
                    id="how-title"
                        dark
                        num="02"
                        label="How it works"
                        title={
                            <>
                                From sign-up
                                <br />
                                to first sale.
                            </>
                        }
                        sub="Most stores are ready in an afternoon."
                    />

                <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {STEPS.map((step, i) => (
                        <li key={step.title} className="mk-ticket flex flex-col px-7 pb-8 pt-6">
                            <p className="mk-label text-shop-ink/65">
                                Stub {String(i + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
                            </p>
                            <span aria-hidden className="mt-4 font-display text-7xl leading-none text-brand-700">
                                {String(i + 1).padStart(2, '0')}
                            </span>
                            <div aria-hidden className="mk-perf my-5 text-shop-ink/40" />
                            <h3 className="flex flex-wrap items-center gap-2 text-xl font-extrabold">
                                {step.title}
                                {step.pro && <ProTag />}
                            </h3>
                            <p className="mt-2 text-[15px] text-shop-ink/75">{step.body}</p>
                        </li>
                    ))}
                </ol>

                <div className="mt-20">
                    <p className="mk-label text-brand-500">Store rules</p>
                    <ul className="mt-6 grid gap-x-8 gap-y-8 border-t border-shop-paper/15 pt-8 sm:grid-cols-2 lg:grid-cols-4">
                        {rules.map((rule, i) => (
                            <li key={rule.title}>
                                <p className="font-plex text-[13px] text-brand-500">R{i + 1}</p>
                                <h3 className="mt-2 text-lg font-extrabold">{rule.title}</h3>
                                <p className="mt-2 text-[15px] text-shop-paper/70">{rule.body}</p>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="mt-20">
                    <p className="mk-label text-brand-500">Works with</p>
                    <ul className="mt-5 flex flex-wrap gap-2">
                        {WORKS_WITH.map((item) => (
                            <li key={item} className="mk-chip border-shop-paper/25 text-shop-paper/85">
                                {item}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-5 max-w-2xl text-[15px] text-shop-paper/70">
                        Runs in any modern browser and installs like an app. Receipts print through your device's print dialog; scanners work like a keyboard.
                    </p>
                </div>
            </div>
        </section>
    );
}

/* ---------------------------------------------------------- 03 — Pricing */

function PlanTicket({
    name,
    price,
    period,
    description,
    features,
    cta,
    featured = false,
}: {
    name: string;
    price: string;
    period?: string;
    description: string;
    features: string[];
    cta: ReactNode;
    featured?: boolean;
}) {
    return (
        <article className={`relative flex flex-col px-7 pb-9 pt-7 sm:px-8 ${featured ? 'mk-ticket lg:-my-6 lg:py-12' : 'mk-ticket bg-shop-paper-2'}`}>
            {featured && <span aria-hidden className="absolute inset-x-0 top-0 h-2 bg-brand-700" />}
            <div className="flex items-start justify-between gap-3">
                <h3 className="mk-label">{name}</h3>
                {featured && (
                    <p className="rotate-[4deg] border-[3px] border-double border-brand-700 px-2.5 py-1 font-plex text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Most popular</p>
                )}
            </div>
            <p className="mt-5 flex items-baseline gap-2">
                <span className="font-display text-6xl leading-none">{price}</span>
                {period && <span className="font-plex text-[13px] uppercase tracking-[0.12em] text-shop-ink/65">{period}</span>}
            </p>
            <p className="mt-4 text-[15px] text-shop-ink/75">{description}</p>
            <div className="mt-6">{cta}</div>
            {features.length > 0 && (
                <>
                    <div aria-hidden className="mk-perf my-7 text-shop-ink/40" />
                    <ul className="space-y-2.5">
                        {features.map((feature) => (
                            <li key={feature} className="flex gap-3 text-[15px]">
                                <span aria-hidden className="text-brand-700">
                                    ✶
                                </span>
                                {feature}
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </article>
    );
}

function Pricing({ pricing, trialDays, signedIn }: { pricing: Props['pricing']; trialDays: number; signedIn: boolean }) {
    const proCta = signedIn ? 'Get Pro' : trialDays > 0 ? `Start ${trialDays}-day free trial` : 'Get Pro';

    return (
        <section id="pricing" aria-labelledby="pricing-title" className="mk-heat mk-section scroll-mt-16 border-t border-shop-paper/10">
            <div className="mk-container">
                <SectionHead
                    id="pricing-title"
                        dark
                        num="03"
                        label="Pricing"
                        title={
                            <>
                                Start free.
                                <br />
                                Upgrade when you grow.
                            </>
                        }
                    />
                <div className="mt-16 grid items-stretch gap-6 lg:grid-cols-3">
                    <PlanTicket
                        name="Free"
                        price={formatMoney(0, 'PHP')}
                        period="forever"
                        description="For new and small stores getting started."
                        features={[`Up to ${pricing.free_product_limit.toLocaleString()} products`, ...FREE_FEATURES]}
                        cta={
                            <a href={signedIn ? route('dashboard') : route('register')} className="mk-btn-ink w-full">
                                {signedIn ? 'Go to dashboard' : 'Start free'}
                            </a>
                        }
                    />
                    <PlanTicket
                        featured
                        name="Pro"
                        price={formatMoney(pricing.price_cents, 'PHP')}
                        period="/ month"
                        description="For stores with a team, tables or more than one branch."
                        features={PRO_FEATURES}
                        cta={
                            <a href={signedIn ? route('subscription.index') : route('register')} className="mk-btn-red w-full">
                                {proCta}
                            </a>
                        }
                    />
                    <PlanTicket
                        name="Custom"
                        price="Let's talk"
                        description="Need something FinstackPOS doesn't do yet? Tell us what your business needs."
                        features={[]}
                        cta={
                            <a href="#book-demo" className="mk-btn-ink w-full">
                                Book a demo
                            </a>
                        }
                    />
                </div>
                <p className="mk-label mt-12 text-center leading-relaxed text-shop-paper/70">
                    Prices in PHP · Pro is prepaid with QR Ph, 1 to {pricing.max_months} months · No auto-renewal · No hidden fees
                </p>
            </div>
        </section>
    );
}

/* -------------------------------------------------------------- Testimonials */

function Testimonials() {
    return (
        <section aria-labelledby="testimonials-title" className="mk-section border-t border-shop-paper/10 bg-shop-ink">
            <div className="mk-container">
                <p className="mk-label text-brand-500">From store owners</p>
                <h2 id="testimonials-title" className="mk-h2 mt-4">
                    Heard at the counter.
                </h2>
                <ul className="mt-12 grid gap-5 md:grid-cols-3">
                    {TESTIMONIALS.map((t) => (
                        <li key={t.name} className="mk-ticket px-7 py-7">
                            <figure>
                                <blockquote className="text-lg">“{t.quote}”</blockquote>
                                <figcaption className="mk-label mt-5 text-shop-ink/70">
                                    {t.name} · {t.business}
                                </figcaption>
                            </figure>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

/* ------------------------------------------------------------------- FAQ */

function FaqSection({ trialDays, maxMonths }: { trialDays: number; maxMonths: number }) {
    const items: FaqItem[] = [
        {
            q: 'Is there a free trial?',
            a:
                trialDays > 0
                    ? `Yes. Every new store gets Pro free for ${trialDays} days, with no payment needed. When it ends you're on the Free plan and your products and sales are kept. To keep Pro, buy 1 to ${maxMonths} months at a time with QR Ph.`
                    : 'Not right now. The Free plan has no time limit, and you can buy Pro by the month with QR Ph whenever you need it.',
        },
        {
            q: 'Does it work without internet?',
            a: 'Yes. Open the register once while online so your products download. After that you can keep selling offline; sales are saved on the device and upload by themselves when the connection returns. Only QR Ph through PayMongo needs internet at checkout.',
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
            a: "Cash with automatic change, plus one QR of your choice: your own GCash, Maya or bank QR (the cashier confirms it, and it works offline), or QR Ph through your own PayMongo account, which confirms the payment by itself. PayMongo's own fees apply to QR Ph.",
        },
        {
            q: 'How do Senior Citizen and PWD discounts work?',
            a: 'The cashier applies the discount and records the ID number and name. By default VAT is removed first and 20% is taken off, as in the Philippines; you can change the rate and VAT exemption in Settings.',
        },
        {
            q: 'Can I control what my staff can see?',
            a: 'Yes, on Pro. Create roles and choose what each one can do: Point of Sale, Products, Categories, Sales, Void & refund sales, Inventory, Employee Scheduling, and Attendance & Timesheets. Staff accounts, Settings, the Employee List and Salary & Payroll always stay with the owner.',
        },
        {
            q: 'Are the receipts BIR official receipts?',
            a: 'FinstackPOS prints itemized sales receipts with your TIN and VAT breakdown. It is not yet BIR-accredited, so check with your RDO before using its receipts as official receipts.',
        },
    ];

    return (
        <section id="faq" aria-labelledby="faq-title" className="mk-section scroll-mt-16 bg-shop-paper text-shop-ink">
            <div className="mk-container grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
                <SectionHead
                    id="faq-title"
                        num="05"
                        label="Questions"
                        title={
                            <>
                                Asked at
                                <br />
                                the counter.
                            </>
                        }
                    />
                <Faq items={items} />
            </div>
        </section>
    );
}

/* ---------------------------------------------------------------- Final CTA */

function FinalCta({ startHref, startLabel }: { startHref: string; startLabel: string }) {
    return (
        <section className="mk-heat relative overflow-hidden border-t border-shop-paper/10">
            <div aria-hidden className="mk-halftone pointer-events-none absolute inset-0 text-shop-paper/[0.05] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
            <div className="mk-container relative py-24 text-center lg:py-32">
                <p className="mk-label text-shop-paper/70">[ Last call ]</p>
                <h2 className="mk-h1 mt-6">
                    Open your register
                    <br />
                    <span className="text-brand-500">today.</span>
                </h2>
                <p className="mx-auto mt-6 max-w-xl text-lg text-shop-paper/75">Create your store in minutes. No card, no contract.</p>
                <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
                    <a href={startHref} className="mk-btn-red">
                        {startLabel}
                        <LineIcon name="arrow" className="h-4 w-4" strokeWidth={2} />
                    </a>
                    <a href="#book-demo" className="mk-btn-line text-shop-paper">
                        Book a demo
                    </a>
                </div>
            </div>
        </section>
    );
}
