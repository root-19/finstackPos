import { PhoneFrame, TabletFrame } from '@/Components/Landing/DeviceFrames';
import Faq, { FaqItem } from '@/Components/Landing/Faq';
import LineIcon, { IconName } from '@/Components/Landing/LineIcon';
import MarketingLayout, { useVisitor } from '@/Components/Landing/MarketingLayout';
import Reveal from '@/Components/Landing/Reveal';
import { contactLinks } from '@/Components/Landing/contact';
import { formatMoney } from '@/lib/money';
import { PRO_MODULES } from '@/lib/proModules';
import { PageProps } from '@/types';
import { Head } from '@inertiajs/react';
import { lazy, ReactNode, Suspense, useEffect, useRef, useState } from 'react';

/**
 * The public landing page. Every claim is checked against the code: Free vs
 * Pro labels follow the routes' `subscribed` middleware and
 * Merchant::tableOrderingActive; prices come from Admin → Pricing. Don't add
 * a claim the app can't back up.
 */

// The 3D sale is below the fold: load its code only when it's about to be seen.
const Transaction3D = lazy(() => import('@/Components/Landing/Transaction3D'));

type Props = PageProps<{
    canLogin: boolean;
    canRegister: boolean;
    /** From Admin → Pricing (App\Support\Platform). */
    pricing: { price_cents: number; max_months: number; free_product_limit: number };
    trial: { days: number };
}>;

/** Screenshots of the real app (demo store), see database/seeders/LandingDemoSeeder.php. */
const SHOTS = {
    register: { src: '/landing/register.webp', width: 1180, height: 820 },
    checkout: { src: '/landing/checkout-gcash.webp', width: 390, height: 844 },
    orders: { src: '/landing/orders.webp', width: 1180, height: 820 },
    inventory: { src: '/landing/inventory.webp', width: 1180, height: 820 },
    payslip: { src: '/landing/payslip.webp', width: 1180, height: 820 },
};

const PROBLEMS = [
    {
        problem: 'The internet drops in the middle of a rush.',
        solution: 'The register keeps selling offline and uploads every sale when you reconnect.',
    },
    {
        problem: 'VAT and Senior/PWD discounts are worked out by hand.',
        solution: 'Every total, VAT line and Senior/PWD discount is computed and printed for you.',
    },
    {
        problem: 'You find out an item is gone when a customer asks for it.',
        solution: 'Stock goes down with each sale, and low items stand out before they run out.',
    },
    {
        problem: 'Payroll means a calculator, a notebook and a long night.',
        solution: 'Attendance turns into payroll with SSS, PhilHealth and Pag-IBIG deductions and payslips (Pro).',
    },
];

const BUSINESSES: { icon: IconName; name: string; note: string }[] = [
    { icon: 'bag', name: 'Retail', note: 'Barcodes, stock and quick checkout.' },
    { icon: 'cart', name: 'Groceries & sari-sari', note: 'Many items, small baskets, fast lines.' },
    { icon: 'cup', name: 'Cafés & milk tea', note: 'Sizes with their own prices.' },
    { icon: 'utensils', name: 'Restaurants & food stalls', note: 'Table QR menus and Senior/PWD discounts.' },
    { icon: 'cake', name: 'Bakeries', note: 'Busy mornings, even offline.' },
    { icon: 'store', name: 'Specialty shops', note: 'Photos, categories and staff roles.' },
];

/** Only what the code supports: printing goes through the device's print dialog; scanners type like a keyboard. */
const WORKS_WITH: { icon: IconName; label: string }[] = [
    { icon: 'printer', label: '58 / 80 mm thermal printers' },
    { icon: 'barcode', label: 'USB & Bluetooth barcode scanners' },
    { icon: 'tablet', label: 'Android tablets' },
    { icon: 'tablet', label: 'iPad' },
    { icon: 'computer', label: 'Windows & Mac' },
    { icon: 'device', label: 'Phones' },
];

const STEPS: { title: string; body: string; pro?: boolean }[] = [
    { title: 'Create your store', body: 'Sign up with your business name. You become the owner.' },
    { title: 'Add your products', body: 'Prices, sizes, photos, barcodes and stock.' },
    { title: 'Invite your team', body: 'Give each person a role with just the access they need.', pro: true },
    { title: 'Start selling', body: 'Open the register on any device and take your first order.' },
];

const FREE_FEATURES = [
    'POS that works offline',
    'Cash, GCash / Maya QR and QR Ph',
    'Senior & PWD discounts',
    'Thermal receipts, 58 or 80 mm',
    'Inventory, recipes and suppliers',
    'Sales history and reports',
    'Table QR menus (view only)',
];

/** Pro is built from PRO_MODULES, the same list as the app's sidebar, so new modules show up here too. */
const PRO_FEATURES = [
    'Everything in Free',
    'Unlimited products',
    'Order & pay from the table, with an orders board',
    ...PRO_MODULES.map((m) => m.feature),
    'Payroll and schedule reports',
];

/** Real customer quotes only. Empty until a customer agrees to be quoted; never invent one. */
const TESTIMONIALS: { quote: string; name: string; business: string }[] = [];

export default function Welcome({ pricing, trial }: Props) {
    const { signedIn, startHref, startLabel } = useVisitor();
    const hasContact = contactLinks().length > 0;

    return (
        <>
            <Head title="POS, inventory and payroll for PH small businesses" />

            <MarketingLayout home>
                <Hero trialDays={signedIn ? 0 : trial.days} startHref={startHref} startLabel={startLabel} />
                <PaymentsStrip />
                <Problems />
                <SeeItInAction />
                <Features />
                <WhoItsFor />
                <WorksWith />
                <HowItWorks />
                <Pricing pricing={pricing} trialDays={trial.days} signedIn={signedIn} hasContact={hasContact} />
                <DataSafe />
                {TESTIMONIALS.length > 0 && <Testimonials />}
                <FaqSection trialDays={trial.days} maxMonths={pricing.max_months} />
                <FinalCta startHref={startHref} startLabel={startLabel} hasContact={hasContact} />
            </MarketingLayout>
        </>
    );
}

/* ---------------------------------------------------------------- Hero */

function Hero({ trialDays, startHref, startLabel }: { trialDays: number; startHref: string; startLabel: string }) {
    const chips = ['Free plan', 'Works offline', 'GCash / Maya / QR Ph', 'Senior & PWD ready', ...(trialDays > 0 ? [`Try Pro free for ${trialDays} days`] : [])];

    return (
        <section className="relative isolate pb-20 pt-10 sm:pt-14 lg:pb-28 lg:pt-20">
            <div className="mk-container grid items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
                <div>
                    <p className="mk-chip">
                        <span aria-hidden className="h-2 w-2 rounded-full bg-brand-700" />
                        Made for Philippine small businesses
                    </p>
                    <h1 className="mk-h1 mt-6">POS, inventory and payroll in one app.</h1>
                    <p className="mk-lead mt-6 max-w-xl">Sell, track stock and pay your team from any device, even when the internet drops.</p>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <a href={startHref} className="mk-btn-primary">
                            {startLabel}
                            <LineIcon name="arrow" className="h-5 w-5" strokeWidth={2} />
                        </a>
                        <a href="#see-it" className="mk-btn-secondary">
                            See it in action
                        </a>
                    </div>
                    <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2.5 text-[15px] text-gray-600">
                        {chips.map((chip) => (
                            <li key={chip} className="flex items-center gap-2">
                                <LineIcon name="check" className="h-5 w-5 text-brand-700" strokeWidth={2.25} />
                                {chip}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="relative mx-auto w-full max-w-[640px] pb-10 pr-6 sm:pb-12 sm:pr-10">
                    <div
                        aria-hidden
                        className="absolute inset-[-10%] -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(200,16,46,0.16),rgba(200,16,46,0.05)_60%,transparent)] blur-2xl"
                    />
                    <TabletFrame
                        {...SHOTS.register}
                        alt="The FinstackPOS register in a demo café, with product tiles like Kape Barako and Pandesal and the current order in pesos."
                        fetchPriority="high"
                    />
                    <PhoneFrame
                        {...SHOTS.checkout}
                        alt="Checkout on a phone showing the store's GCash QR code for the customer to scan."
                        className="absolute bottom-0 right-0 w-[30%] min-w-[104px]"
                        loading="lazy"
                    />
                    <div className="mk-card absolute bottom-[14%] left-[-2%] flex items-center gap-3 px-4 py-3 sm:left-[-6%]">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                            <LineIcon name="check" className="h-5 w-5" strokeWidth={2.25} />
                        </span>
                        <span className="leading-tight">
                            <span className="block text-[13px] text-gray-600">Sale synced</span>
                            <span className="block text-base font-bold">₱245.00</span>
                        </span>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ------------------------------------------------------- Payments strip */

function PaymentsStrip() {
    return (
        <section aria-labelledby="payments" className="border-y border-gray-200">
            <div className="mk-container flex flex-col items-center gap-4 py-8 text-center md:flex-row md:justify-between md:text-left">
                <h2 id="payments" className="text-[15px] font-medium text-gray-600">
                    Take the payments your customers already use
                </h2>
                <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xl font-extrabold tracking-[-0.02em] text-gray-700">
                    {['GCash', 'Maya', 'QR Ph', 'PayMongo'].map((name) => (
                        <li key={name}>{name}</li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

/* --------------------------------------------------- Problems → solutions */

function Problems() {
    return (
        <section className="mk-section">
            <div className="mk-container">
                <Reveal className="max-w-2xl">
                    <p className="mk-eyebrow">Why FinstackPOS</p>
                    <h2 className="mk-h2 mt-3">Built for the realities of running a store.</h2>
                </Reveal>
                <ul className="mt-12 grid gap-5 md:grid-cols-2">
                    {PROBLEMS.map((item, i) => (
                        <Reveal as="li" key={item.problem} delay={(i % 2) * 90} className="mk-card p-6 sm:p-8">
                            <p className="text-[15px] text-gray-600">
                                <span className="font-semibold">Problem: </span>
                                <span className="line-through decoration-gray-300 decoration-2">{item.problem}</span>
                            </p>
                            <p className="mt-4 flex gap-3 text-lg font-bold leading-snug">
                                <span className="mk-icon h-8 w-8 rounded-lg">
                                    <LineIcon name="check" className="h-5 w-5" strokeWidth={2.25} />
                                </span>
                                <span>
                                    <span className="sr-only">With FinstackPOS: </span>
                                    {item.solution}
                                </span>
                            </p>
                        </Reveal>
                    ))}
                </ul>
            </div>
        </section>
    );
}

/* ------------------------------------------------------- See it in action */

/** Mounts its children only when they're about to scroll into view (keeps the first load light). */
function WhenNear({ children, minHeight }: { children: ReactNode; minHeight: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [near, setNear] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === 'undefined') {
            setNear(true);
            return;
        }
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setNear(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '600px 0px' },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={ref} style={{ minHeight }}>
            {near && <Suspense fallback={null}>{children}</Suspense>}
        </div>
    );
}

function SeeItInAction() {
    return (
        <section id="see-it" aria-labelledby="see-it-title" className="mk-section scroll-mt-20 bg-gray-50">
            <div className="mk-container">
                <Reveal className="mx-auto max-w-2xl text-center">
                    <p className="mk-eyebrow">See it in action</p>
                    <h2 id="see-it-title" className="mk-h2 mt-3">
                        One sale, from tap to receipt.
                    </h2>
                    <p className="mk-lead mt-5">Ring up the order, let the customer scan to pay, and the receipt prints while stock and sales sync on their own.</p>
                </Reveal>
                <div className="mx-auto mt-12 max-w-5xl">
                    <WhenNear minHeight="420px">
                        <Transaction3D />
                    </WhenNear>
                </div>
            </div>
        </section>
    );
}

/* -------------------------------------------------------------- Features */

function ProBadge({ dark = false }: { dark?: boolean }) {
    return (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide ${dark ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-700'}`}>PRO</span>
    );
}

function BentoCard({
    title,
    text,
    shot,
    alt,
    icon,
    pro = false,
    dark = false,
    className = '',
}: {
    title: string;
    text: string;
    shot?: (typeof SHOTS)[keyof typeof SHOTS];
    alt?: string;
    icon?: IconName;
    pro?: boolean;
    dark?: boolean;
    className?: string;
}) {
    return (
        <Reveal as="article" className={`flex flex-col overflow-hidden rounded-2xl ${dark ? 'bg-ink-900 text-white shadow-soft-lg' : 'mk-card'} ${className}`}>
            <div className="p-6 sm:p-8">
                <div className="flex items-center gap-3">
                    {icon && (
                        <span className={dark ? 'mk-icon bg-white/10 text-brand-400' : 'mk-icon'}>
                            <LineIcon name={icon} className="h-6 w-6" />
                        </span>
                    )}
                    <h3 className="text-xl font-extrabold tracking-[-0.02em]">{title}</h3>
                    {pro && <ProBadge dark={dark} />}
                </div>
                <p className={`mt-3 text-base ${dark ? 'text-white/75' : 'text-gray-600'}`}>{text}</p>
            </div>
            {shot && (
                <div className="mt-auto pl-6 sm:pl-8">
                    <div className={`h-56 overflow-hidden rounded-tl-xl ring-1 sm:h-72 ${dark ? 'ring-white/10' : 'ring-gray-200'}`}>
                        <img {...shot} alt={alt ?? ''} loading="lazy" decoding="async" className="h-full w-full object-cover object-left-top" />
                    </div>
                </div>
            )}
        </Reveal>
    );
}

function Features() {
    return (
        <section id="features" aria-labelledby="features-title" className="mk-section scroll-mt-20">
            <div className="mk-container">
                <Reveal className="max-w-2xl">
                    <p className="mk-eyebrow">Features</p>
                    <h2 id="features-title" className="mk-h2 mt-3">
                        Everything the counter needs. Nothing it doesn't.
                    </h2>
                </Reveal>
                <div className="mt-12 grid gap-5 lg:grid-cols-12">
                    <BentoCard
                        className="lg:col-span-7"
                        icon="card"
                        title="Sell"
                        text="Fast checkout that works offline. Cash, GCash, Maya and QR Ph, Senior/PWD discounts and thermal receipts."
                        shot={SHOTS.register}
                        alt="The register with product tiles and an order total."
                    />
                    <BentoCard
                        className="lg:col-span-5"
                        icon="qr"
                        title="Serve"
                        text="Table QR menus and a customer display. On Pro, tables order and pay from their phones and orders land on a kitchen board."
                        shot={SHOTS.orders}
                        alt="The orders board with table orders waiting to be prepared."
                    />
                    <BentoCard
                        className="lg:col-span-5"
                        icon="stock"
                        title="Stock"
                        text="Inventory, recipes and suppliers. Stock goes down with every sale; per-branch stock on Pro."
                        shot={SHOTS.inventory}
                        alt="The inventory list with supplies and their stock levels."
                    />
                    <BentoCard
                        className="lg:col-span-7"
                        dark
                        pro
                        icon="users"
                        title="Team & Payroll"
                        text="Schedules, attendance and payroll with SSS, PhilHealth and Pag-IBIG deductions, plus payslips."
                        shot={SHOTS.payslip}
                        alt="A payslip with earnings and government deductions."
                    />
                    <BentoCard className="lg:col-span-4" pro icon="store" title="Branches" text="Run more than one location, with sales and stock per branch." />
                    <BentoCard className="lg:col-span-4" pro icon="lock" title="Staff roles" text="Give each person only the pages they need. Payroll stays with the owner." />
                    <BentoCard className="lg:col-span-4" icon="chart" title="Sales & reports" text="Every sale with its cashier, payment and time. Filter by day and reprint any receipt." />
                </div>
            </div>
        </section>
    );
}

/* ------------------------------------------------------------ Who it's for */

function WhoItsFor() {
    return (
        <section aria-labelledby="who-title" className="mk-section bg-gray-50">
            <div className="mk-container">
                <Reveal className="max-w-2xl">
                    <p className="mk-eyebrow">Who it's for</p>
                    <h2 id="who-title" className="mk-h2 mt-3">
                        Made for businesses that serve people all day.
                    </h2>
                </Reveal>
                {/* Mobile: a horizontal scroller (the row scrolls, never the page). Desktop: 3 × 2. */}
                <ul className="-mx-4 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0">
                    {BUSINESSES.map((b) => (
                        <li key={b.name} className="mk-card w-[240px] shrink-0 snap-start p-6 lg:w-auto">
                            <span className="mk-icon">
                                <LineIcon name={b.icon} className="h-6 w-6" />
                            </span>
                            <h3 className="mt-5 text-lg font-bold">{b.name}</h3>
                            <p className="mt-1 text-[15px] text-gray-600">{b.note}</p>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

/* -------------------------------------------------------------- Works with */

function WorksWith() {
    return (
        <section aria-labelledby="works-title" className="mk-section">
            <div className="mk-container">
                <Reveal className="mx-auto max-w-2xl text-center">
                    <p className="mk-eyebrow">Works with</p>
                    <h2 id="works-title" className="mk-h2 mt-3">
                        Use the hardware you already have.
                    </h2>
                </Reveal>
                <ul className="mt-12 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
                    {WORKS_WITH.map((item) => (
                        <li key={item.label} className="flex flex-col items-center text-center">
                            <span className="mk-icon h-14 w-14 rounded-2xl">
                                <LineIcon name={item.icon} className="h-6 w-6" />
                            </span>
                            <span className="mt-3 text-[15px] font-semibold">{item.label}</span>
                        </li>
                    ))}
                </ul>
                <p className="mx-auto mt-10 max-w-2xl text-center text-[15px] text-gray-600">
                    Runs in any modern browser and installs like an app. Receipts print through your device's print dialog; scanners work like a keyboard.
                </p>
            </div>
        </section>
    );
}

/* ------------------------------------------------------------ How it works */

function HowItWorks() {
    return (
        <section aria-labelledby="how-title" className="mk-section bg-gray-50">
            <div className="mk-container">
                <Reveal className="max-w-2xl">
                    <p className="mk-eyebrow">How it works</p>
                    <h2 id="how-title" className="mk-h2 mt-3">
                        Set up in an afternoon.
                    </h2>
                </Reveal>
                <ol className="relative mt-12 grid gap-10 lg:grid-cols-4 lg:gap-8">
                    {/* The connecting line: vertical on mobile, horizontal on desktop. */}
                    <span aria-hidden className="absolute bottom-6 left-6 top-6 w-px bg-gray-300 lg:hidden" />
                    <span aria-hidden className="absolute left-6 right-6 top-6 hidden h-px bg-gray-300 lg:block" />
                    {STEPS.map((step, i) => (
                        <Reveal as="li" key={step.title} delay={i * 90} className="relative flex gap-5 lg:block">
                            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-lg font-extrabold text-brand-700 shadow-soft ring-1 ring-gray-200">
                                {i + 1}
                            </span>
                            <div className="lg:mt-6">
                                <h3 className="flex items-center gap-2 text-lg font-bold">
                                    {step.title}
                                    {step.pro && <ProBadge />}
                                </h3>
                                <p className="mt-1.5 text-[15px] text-gray-600">{step.body}</p>
                            </div>
                        </Reveal>
                    ))}
                </ol>
            </div>
        </section>
    );
}

/* ------------------------------------------------------------------ Pricing */

function PlanCard({
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
        <article className={`relative flex flex-col rounded-2xl bg-white p-7 sm:p-8 ${featured ? 'shadow-soft-lg ring-2 ring-brand-700 lg:-my-4 lg:py-12' : 'shadow-soft ring-1 ring-gray-200'}`}>
            {featured && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand-700 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white">
                    Most popular
                </span>
            )}
            <h3 className="text-xl font-extrabold">{name}</h3>
            <p className="mt-1.5 text-[15px] text-gray-600">{description}</p>
            <p className="mt-6 flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">{price}</span>
                {period && <span className="text-[15px] text-gray-600">{period}</span>}
            </p>
            <div className="mt-6">{cta}</div>
            {features.length > 0 && (
                <ul className="mt-8 space-y-3 border-t border-gray-100 pt-8">
                    {features.map((feature) => (
                        <li key={feature} className="flex gap-3 text-[15px] text-gray-700">
                            <LineIcon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" strokeWidth={2.25} />
                            {feature}
                        </li>
                    ))}
                </ul>
            )}
        </article>
    );
}

function Pricing({
    pricing,
    trialDays,
    signedIn,
    hasContact,
}: {
    pricing: Props['pricing'];
    trialDays: number;
    signedIn: boolean;
    hasContact: boolean;
}) {
    const proCta = signedIn ? 'Get Pro' : trialDays > 0 ? `Start ${trialDays}-day free trial` : 'Get Pro';

    return (
        <section id="pricing" aria-labelledby="pricing-title" className="mk-section scroll-mt-20">
            <div className="mk-container">
                <Reveal className="mx-auto max-w-2xl text-center">
                    <p className="mk-eyebrow">Pricing</p>
                    <h2 id="pricing-title" className="mk-h2 mt-3">
                        Start free. Upgrade when you grow.
                    </h2>
                </Reveal>
                <div className="mx-auto mt-14 grid max-w-6xl items-stretch gap-6 lg:grid-cols-3">
                    <PlanCard
                        name="Free"
                        price={formatMoney(0, 'PHP')}
                        period="forever"
                        description="For new and small stores getting started."
                        features={[`Up to ${pricing.free_product_limit.toLocaleString()} products`, ...FREE_FEATURES]}
                        cta={
                            <a href={signedIn ? route('dashboard') : route('register')} className="mk-btn-secondary w-full">
                                {signedIn ? 'Go to dashboard' : 'Start free'}
                            </a>
                        }
                    />
                    <PlanCard
                        featured
                        name="Pro"
                        price={formatMoney(pricing.price_cents, 'PHP')}
                        period="/ month"
                        description="For stores with a team, tables or more than one branch."
                        features={PRO_FEATURES}
                        cta={
                            <a href={signedIn ? route('subscription.index') : route('register')} className="mk-btn-primary w-full">
                                {proCta}
                            </a>
                        }
                    />
                    <PlanCard
                        name="Custom"
                        price="Let's talk"
                        description="Need something FinstackPOS doesn't do yet? Tell us what your business needs."
                        features={[]}
                        cta={
                            hasContact ? (
                                <a href="#contact" className="mk-btn-secondary w-full">
                                    Talk to us
                                </a>
                            ) : (
                                <p className="text-[15px] text-gray-600">Message us from the Support chat inside the app.</p>
                            )
                        }
                    />
                </div>
                <p className="mt-10 text-center text-[15px] text-gray-600">
                    Prices in PHP. Pro is prepaid with QR Ph, 1 to {pricing.max_months} months at a time, with no auto-renewal and no hidden fees.
                </p>
            </div>
        </section>
    );
}

/* ---------------------------------------------------------- Your data is safe */

function DataSafe() {
    const points: { icon: IconName; title: string; body: string }[] = [
        { icon: 'lock', title: 'Kept separate', body: "Each store's data is walled off from every other store. Employees' government IDs are encrypted, owner only." },
        { icon: 'download', title: 'Yours to export', body: 'Download your inventory and stock history as CSV any time.' },
        { icon: 'sync', title: 'Safe offline', body: 'Sales made offline stay on your device until they sync.' },
        { icon: 'document', title: 'Honest about BIR', body: 'Receipts show your TIN and VAT, but FinstackPOS is not yet BIR-accredited. Check with your RDO.' },
    ];

    return (
        <section aria-labelledby="data-title" className="mk-section bg-ink-900 text-white">
            <div className="mk-container">
                <Reveal className="max-w-2xl">
                    <p className="text-sm font-bold uppercase tracking-[0.12em] text-brand-400">Your data</p>
                    <h2 id="data-title" className="mk-h2 mt-3 text-white">
                        Your data is safe with us.
                    </h2>
                </Reveal>
                <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                    {points.map((p) => (
                        <li key={p.title}>
                            <span className="mk-icon bg-white/10 text-brand-400">
                                <LineIcon name={p.icon} className="h-6 w-6" />
                            </span>
                            <h3 className="mt-5 text-lg font-bold">{p.title}</h3>
                            <p className="mt-2 text-[15px] text-white/75">{p.body}</p>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

/* -------------------------------------------------------------- Testimonials */

function Testimonials() {
    return (
        <section aria-labelledby="testimonials-title" className="mk-section">
            <div className="mk-container">
                <h2 id="testimonials-title" className="mk-h2">
                    From store owners
                </h2>
                <ul className="mt-12 grid gap-5 md:grid-cols-3">
                    {TESTIMONIALS.map((t) => (
                        <li key={t.name} className="mk-card p-6">
                            <figure>
                                <blockquote className="text-lg">“{t.quote}”</blockquote>
                                <figcaption className="mt-4 text-[15px] text-gray-600">
                                    <span className="font-bold text-ink-900">{t.name}</span>, {t.business}
                                </figcaption>
                            </figure>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

/* ---------------------------------------------------------------------- FAQ */

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
        <section id="faq" aria-labelledby="faq-title" className="mk-section scroll-mt-20 bg-gray-50">
            <div className="mk-container grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
                <Reveal>
                    <p className="mk-eyebrow">FAQ</p>
                    <h2 id="faq-title" className="mk-h2 mt-3">
                        Questions, answered.
                    </h2>
                </Reveal>
                <Faq items={items} />
            </div>
        </section>
    );
}

/* ---------------------------------------------------------------- Final CTA */

function FinalCta({ startHref, startLabel, hasContact }: { startHref: string; startLabel: string; hasContact: boolean }) {
    return (
        <section className="mk-section">
            <div className="mk-container">
                <Reveal className="rounded-3xl bg-gradient-to-br from-brand-700 to-brand-800 px-6 py-16 text-center text-white shadow-soft-lg sm:px-12 lg:py-20">
                    <h2 className="mk-h2 text-white">Open your register today.</h2>
                    <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">Create your store in minutes. No card, no contract.</p>
                    <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                        <a
                            href={startHref}
                            className="mk-btn bg-white text-brand-800 shadow-soft hover:-translate-y-0.5 hover:bg-gray-50 focus-visible:ring-white focus-visible:ring-offset-brand-700"
                        >
                            {startLabel}
                        </a>
                        {hasContact && (
                            <a href="#contact" className="mk-btn border border-white/40 text-white hover:-translate-y-0.5 hover:bg-white/10 focus-visible:ring-white focus-visible:ring-offset-brand-700">
                                Talk to us
                            </a>
                        )}
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
