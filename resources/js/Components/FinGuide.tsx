import Checkbox from '@/Components/Checkbox';
import { Badge } from '@/Components/ui';
import { formatMoney } from '@/lib/money';
import { Onboarding } from '@/types';
import { router } from '@inertiajs/react';
import { ReactNode, useMemo, useState } from 'react';

/*
 * The setup guide with Fin, FinstackPOS's guide, for a new store's owner.
 * Fin introduces himself and the system, asks a few questions about the
 * business ("simulation"), turns that into the store's modules (the same
 * list as Settings → Customize), explains Free vs Pro, and finishes.
 * Skip is always there. It's part of the web app, so the desktop app shows
 * it too. Only describes what FinstackPOS actually does today.
 */

type Pose = 'wave' | 'point' | 'think' | 'explain' | 'back';

const POSES: Record<Pose, string> = {
    wave: '/fin/fin-wave.webp',
    point: '/fin/fin-point.webp',
    think: '/fin/fin-think.webp',
    explain: '/fin/fin-explain.webp',
    back: '/fin/fin-back.webp',
};

type Business = 'cafe' | 'retail' | 'salon' | 'optical' | 'clinic' | 'other';

type Answers = {
    business: Business | null;
    counter: boolean;
    tables: boolean;
    stock: boolean;
    team: 'none' | 'schedule' | 'payroll';
    branches: boolean;
};

const BUSINESSES: { value: Business; label: string; hint: string }[] = [
    { value: 'cafe', label: 'Café or restaurant', hint: 'Coffee, milk tea, food stalls, bakeries' },
    { value: 'retail', label: 'Retail or sari-sari store', hint: 'Groceries, shops, specialty stores' },
    { value: 'salon', label: 'Salon, nail spa or barbershop', hint: 'Services and products' },
    { value: 'optical', label: 'Optical shop', hint: 'Eye exams, frames and lenses' },
    { value: 'clinic', label: 'Clinic or dental', hint: 'Consultations and procedures' },
    { value: 'other', label: 'Something else', hint: 'I’ll pick what I need' },
];

/** Sensible starting answers per business type; the owner changes any of them next. */
const PRESETS: Record<Business, Omit<Answers, 'business'>> = {
    cafe: { counter: true, tables: true, stock: true, team: 'schedule', branches: false },
    retail: { counter: true, tables: false, stock: true, team: 'none', branches: false },
    salon: { counter: true, tables: false, stock: true, team: 'schedule', branches: false },
    optical: { counter: true, tables: false, stock: true, team: 'none', branches: false },
    clinic: { counter: true, tables: false, stock: false, team: 'none', branches: false },
    other: { counter: true, tables: false, stock: false, team: 'none', branches: false },
};

/** For service businesses: say honestly what exists today. */
const SERVICE_NOTE: Partial<Record<Business, string>> = {
    salon: 'Appointments, customer records and staff commissions are being built for salons. For now, add your services as items (e.g. "Gel manicure ₱350") and sell them at the register.',
    optical: 'Job orders and eye prescriptions are being built for optical shops. For now, sell frames, lenses and exams at the register and track frames in Inventory.',
    clinic: 'Appointments and patient records are being built for clinics. For now, bill consultations and procedures at the register.',
};

function modulesFor(a: Answers): string[] {
    const on = new Set<string>(['reports']);
    if (a.counter) ['pos', 'products', 'sales'].forEach((m) => on.add(m));
    if (a.tables) ['table_orders', 'pos', 'products'].forEach((m) => on.add(m));
    if (a.stock) ['inventory', 'products'].forEach((m) => on.add(m));
    if (a.team !== 'none') ['employees', 'scheduling', 'attendance'].forEach((m) => on.add(m));
    if (a.team === 'payroll') on.add('payroll');
    if (a.branches) on.add('branches');
    if (on.has('pos')) on.add('sales');
    return [...on];
}

type Step = 'hello' | 'about' | 'business' | 'counter' | 'tables' | 'stock' | 'team' | 'branches' | 'plan' | 'subscription' | 'done';

export default function FinGuide({ onboarding }: { onboarding: Onboarding }) {
    const { modules, plan, store } = onboarding;
    const byKey = useMemo(() => Object.fromEntries(modules.map((m) => [m.key, m])), [modules]);
    const [answers, setAnswers] = useState<Answers>({ business: null, ...PRESETS.other });
    const [chosen, setChosen] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);

    const steps: Step[] = [
        'hello',
        'about',
        'business',
        'counter',
        ...(answers.counter ? (['tables'] as Step[]) : []),
        'stock',
        'team',
        'branches',
        'plan',
        'subscription',
        'done',
    ];
    const [step, setStep] = useState<Step>('hello');
    const index = steps.indexOf(step);
    const questions = steps.filter((s) => ['business', 'counter', 'tables', 'stock', 'team', 'branches'].includes(s));
    const questionNo = questions.indexOf(step);

    const go = (to: Step) => {
        if (to === 'plan') setChosen(modulesFor(answers));
        setStep(to);
    };
    const next = () => go(steps[Math.min(index + 1, steps.length - 1)]);
    const back = () => setStep(steps[Math.max(index - 1, 0)]);
    const answer = (patch: Partial<Answers>) => {
        setAnswers((a) => ({ ...a, ...patch }));
        // Let the state settle so "tables" appears/disappears before moving on.
        setTimeout(() => setStep((s) => s), 0);
    };

    const end = (withModules: boolean, then?: string) => {
        setBusy(true);
        router.post(
            route('onboarding.finish'),
            withModules ? { modules: chosen } : {},
            {
                preserveScroll: true,
                onFinish: () => setBusy(false),
                onSuccess: () => {
                    if (then) router.visit(then);
                },
            },
        );
    };

    const toggle = (key: string, checked: boolean) => {
        const next = new Set(chosen);
        const withReq = (k: string, into: Set<string>) => {
            if (into.has(k)) return;
            into.add(k);
            byKey[k]?.requires.forEach((r) => withReq(r, into));
        };
        if (checked) withReq(key, next);
        else {
            next.delete(key);
            modules.filter((m) => m.requires.includes(key)).forEach((m) => next.delete(m.key));
        }
        setChosen(modules.map((m) => m.key).filter((k) => next.has(k)));
    };

    const price = formatMoney(plan.price_cents, 'PHP');
    const proChosen = chosen.filter((k) => byKey[k]?.pro).map((k) => byKey[k].label);

    let pose: Pose = 'point';
    let title: ReactNode = '';
    let body: ReactNode = null;
    let actions: ReactNode = null;

    const nextBtn = (label = 'Next') => (
        <button type="button" className="btn btn-primary" onClick={next}>
            {label}
        </button>
    );
    const choice = (label: string, hint: string | null, selected: boolean, onClick: () => void) => (
        <button
            type="button"
            onClick={onClick}
            className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${selected ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500/30' : 'border-gray-200 hover:bg-gray-50'}`}
        >
            <span className="block font-semibold text-gray-900">{label}</span>
            {hint && <span className="block text-sm text-gray-600">{hint}</span>}
        </button>
    );
    const yesNo = (value: boolean, set: (v: boolean) => void, yes: string, no: string) => (
        <div className="grid gap-2 sm:grid-cols-2">
            {choice(yes, null, value, () => set(true))}
            {choice(no, null, !value, () => set(false))}
        </div>
    );

    switch (step) {
        case 'hello':
            pose = 'wave';
            title = 'Hi, I’m Fin!';
            body = (
                <p>
                    I’m your FinstackPOS guide. In about a minute I’ll get <strong>{store}</strong> set up: a few quick questions about your
                    business, then I’ll turn on just what you need.
                </p>
            );
            actions = nextBtn('Let’s go');
            break;
        case 'about':
            pose = 'point';
            title = 'FinstackPOS in a nutshell';
            body = (
                <ul className="space-y-2">
                    {[
                        ['Sell', 'A register for cash, GCash, Maya and QR Ph, with Senior & PWD discounts and thermal receipts.'],
                        ['Works offline', 'Sales save on the device when the internet drops and upload by themselves.'],
                        ['Stock', 'Inventory, recipes and suppliers; stock goes down with every sale.'],
                        ['Team', 'Schedules, time clock and payroll with SSS, PhilHealth and Pag-IBIG (Pro).'],
                        ['Any device', 'Phone, tablet, computer, or the Windows app for direct printing.'],
                    ].map(([h, t]) => (
                        <li key={h}>
                            <span className="font-semibold text-gray-900">{h}:</span> {t}
                        </li>
                    ))}
                </ul>
            );
            actions = nextBtn('Sounds good');
            break;
        case 'business':
            pose = 'think';
            title = 'What kind of business do you run?';
            body = (
                <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                        {BUSINESSES.map((b) =>
                            choice(b.label, b.hint, answers.business === b.value, () => answer({ business: b.value, ...PRESETS[b.value] })),
                        )}
                    </div>
                    {answers.business && SERVICE_NOTE[answers.business] && (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{SERVICE_NOTE[answers.business]}</p>
                    )}
                </div>
            );
            actions = (
                <button type="button" className="btn btn-primary" onClick={next} disabled={!answers.business}>
                    Next
                </button>
            );
            break;
        case 'counter':
            pose = 'think';
            title = 'Do you take payments at a counter?';
            body = yesNo(answers.counter, (v) => answer({ counter: v, tables: v && answers.tables }), 'Yes, I need a register', 'No, not here');
            actions = nextBtn();
            break;
        case 'tables':
            pose = 'think';
            title = 'Do customers sit at tables?';
            body = (
                <>
                    {yesNo(answers.tables, (v) => answer({ tables: v }), 'Yes, give each table a QR menu', 'No tables')}
                    <p className="mt-3 text-sm text-gray-600">Customers scan the table’s QR to see the menu. On Pro, they can also order and pay from their phone.</p>
                </>
            );
            actions = nextBtn();
            break;
        case 'stock':
            pose = 'think';
            title = 'Do you want to track supplies or ingredients?';
            body = yesNo(answers.stock, (v) => answer({ stock: v }), 'Yes, track my stock', 'Not now');
            actions = nextBtn();
            break;
        case 'team':
            pose = 'think';
            title = 'Do you have a team?';
            body = (
                <div className="grid gap-2">
                    {choice('Just me', null, answers.team === 'none', () => answer({ team: 'none' }))}
                    {choice('Yes, I need schedules and a time clock', null, answers.team === 'schedule', () => answer({ team: 'schedule' }))}
                    {choice('Yes, and I run payroll too', 'Payslips with SSS, PhilHealth and Pag-IBIG', answers.team === 'payroll', () => answer({ team: 'payroll' }))}
                </div>
            );
            actions = nextBtn();
            break;
        case 'branches':
            pose = 'think';
            title = 'More than one location?';
            body = yesNo(answers.branches, (v) => answer({ branches: v }), 'Yes, I have branches', 'Just one store');
            actions = nextBtn('See my setup');
            break;
        case 'plan':
            pose = 'explain';
            title = 'Here’s your setup';
            body = (
                <div className="space-y-3">
                    <p>Based on your answers, I’ll turn these on. Change anything you like; the rest stays hidden from your sidebar.</p>
                    <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
                        {modules.map((m) => (
                            <li key={m.key}>
                                <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-gray-50">
                                    <Checkbox className="mt-0.5" checked={chosen.includes(m.key)} onChange={(e) => toggle(m.key, e.target.checked)} />
                                    <span className="min-w-0">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                            {m.label}
                                            {m.pro && <Badge tone="brand">Pro</Badge>}
                                        </span>
                                        <span className="block text-xs text-gray-600">{m.description}</span>
                                    </span>
                                </label>
                            </li>
                        ))}
                    </ul>
                    <p className="text-xs text-gray-500">You can change this anytime in Settings → Customize.</p>
                </div>
            );
            actions = nextBtn('Looks good');
            break;
        case 'subscription':
            pose = 'explain';
            title = 'Free and Pro';
            body = (
                <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-gray-200 p-3">
                            <p className="font-semibold text-gray-900">Free</p>
                            <p className="text-sm text-gray-600">
                                The register (works offline), up to {plan.free_product_limit} products, inventory, sales and reports. No time limit.
                            </p>
                        </div>
                        <div className="rounded-xl border border-brand-300 bg-brand-50 p-3">
                            <p className="font-semibold text-gray-900">Pro · {price}/month</p>
                            <p className="text-sm text-gray-600">
                                Unlimited products, table ordering, branches, team and payroll. Prepaid with QR Ph, 1 to {plan.max_months} months, no
                                auto-renewal.
                            </p>
                        </div>
                    </div>
                    {plan.on_trial && plan.until ? (
                        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
                            Good news: you’re on a free Pro trial until <strong>{new Date(plan.until).toLocaleDateString()}</strong>. After that you
                            stay on Free and keep all your data.
                        </p>
                    ) : plan.can_start_trial ? (
                        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">You can try Pro free for {plan.trial_days} days from the Subscription page.</p>
                    ) : null}
                    {proChosen.length > 0 && !plan.pro && (
                        <p className="text-sm text-gray-600">
                            In your setup, these need Pro: {proChosen.join(', ')}. They’ll show with a lock until you get Pro.
                        </p>
                    )}
                    <p className="text-sm text-gray-600">You’ll find your plan anytime under Subscription in the sidebar.</p>
                </div>
            );
            actions = nextBtn('Got it');
            break;
        case 'done':
            pose = 'wave';
            title = 'You’re all set!';
            body = (
                <p>
                    I’ll save your setup now.{' '}
                    {chosen.includes('products') ? 'A good first step is adding your products; then open the register and ring up your first sale.' : 'Your sidebar now shows just what you picked.'} If you need me again, it’s
                    in Settings → Customize.
                </p>
            );
            actions = (
                <>
                    {chosen.includes('products') && (
                        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => end(true, route('products.index'))}>
                            Add my products
                        </button>
                    )}
                    <button type="button" className={chosen.includes('products') ? 'btn btn-secondary' : 'btn btn-primary'} disabled={busy} onClick={() => end(true)}>
                        Finish
                    </button>
                </>
            );
            break;
    }

    return (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="fin-title">
            <div className="relative flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl">
                {/* Progress + skip */}
                <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-brand-600 transition-all duration-300" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
                    </div>
                    {step !== 'done' && (
                        <button type="button" className="text-sm font-semibold text-gray-500 hover:text-gray-900" disabled={busy} onClick={() => end(false)}>
                            Skip setup
                        </button>
                    )}
                </div>

                <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
                    {/* Fin */}
                    <div className="flex shrink-0 items-end justify-center bg-gradient-to-b from-brand-50 to-white px-4 pt-4 sm:w-56 sm:bg-gradient-to-br sm:pt-8">
                        <img key={pose} src={POSES[pose]} alt="" aria-hidden className="h-32 w-auto object-contain sm:h-72" />
                    </div>

                    {/* Speech */}
                    <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-7 sm:py-7">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                            Fin{questionNo >= 0 ? ` · Question ${questionNo + 1} of ${questions.length}` : ''}
                        </p>
                        <h2 id="fin-title" className="mt-1 text-2xl font-extrabold text-gray-900">
                            {title}
                        </h2>
                        <div className="mt-3 min-h-0 flex-1 overflow-y-auto text-[15px] leading-relaxed text-gray-700">{body}</div>

                        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
                            {index > 0 && step !== 'done' && (
                                <button type="button" className="btn btn-ghost mr-auto" onClick={back}>
                                    Back
                                </button>
                            )}
                            {step === 'done' && (
                                <button type="button" className="btn btn-ghost mr-auto" onClick={back}>
                                    Back
                                </button>
                            )}
                            {actions}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
