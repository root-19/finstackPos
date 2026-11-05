import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import { Alert, Badge, Card, CardHeader, DialogLayout, EmptyState } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatMoney } from '@/lib/money';
import { PageProps } from '@/types';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import axios, { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';

type Payment = {
    id: number;
    created_at: string;
    months: number;
    amount_cents: number;
    provider: 'paymongo' | 'manual' | 'trial';
    status: 'paid' | 'pending' | 'expired';
    period_start: string | null;
    period_end: string | null;
    by: string | null;
};

type Props = {
    plan: { active: boolean; trial: boolean; until: string | null; days_left: number; trial_ended: boolean };
    trial: { available: boolean; days: number };
    pricing: { price_cents: number; max_months: number; free_product_limit: number };
    usage: { products: number };
    canPay: boolean;
    paymentsReady: boolean;
    payments: Payment[];
};

const peso = (cents: number) => formatMoney(cents, 'PHP');
const longDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

/** Adds calendar months like the server (no overflow: Jan 31 + 1 month = Feb 28/29). */
function addMonths(from: Date, months: number): Date {
    const d = new Date(from);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));

    return d;
}

const FREE_FEATURES = [
    'Point of Sale, offline-ready',
    'Products and categories',
    'Sales history and receipts',
    'Inventory and recipes',
    'Sales and inventory reports',
    'Table QR codes with your menu',
];
const PRO_FEATURES = [
    'Everything in Free',
    'Unlimited products',
    'Scan-to-order: customers order from their table',
    'Employee List with staff logins and roles',
    'Employee Scheduling and auto-schedule',
    'Attendance & Timesheets',
    'Salary & Payroll with payslips',
    'Deduction Settings',
    'Payroll and schedule reports',
];

export default function Subscription({ plan, trial, pricing, usage, canPay, paymentsReady, payments }: PageProps<Props>) {
    const [months, setMonths] = useState(1);
    const [paying, setPaying] = useState(false);
    const total = months * pricing.price_cents;
    const base = plan.active && plan.until ? new Date(plan.until) : new Date();
    const newEnd = addMonths(base, months);
    const setClamped = (n: number) => setMonths(Math.min(pricing.max_months, Math.max(1, n)));

    return (
        <AuthenticatedLayout header={<PageHeader title="Subscription" subtitle="Your FinstackPOS plan" />}>
            <Head title="Subscription" />

            <div className="app-page max-w-5xl">
                {/* Current plan */}
                <Card>
                    <div className="card-body flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-semibold text-gray-950">
                                    {plan.trial ? 'Pro free trial' : plan.active ? 'FinstackPOS Pro' : 'Free plan'}
                                </h2>
                                {plan.trial ? (
                                    <Badge tone="blue">Trial</Badge>
                                ) : plan.active ? (
                                    <Badge tone="green">Active</Badge>
                                ) : (
                                    <Badge>Free</Badge>
                                )}
                            </div>
                            <p className="mt-0.5 text-sm text-gray-500">
                                {plan.trial && plan.until
                                    ? `Free trial until ${longDate(plan.until)} · ${plan.days_left} day${plan.days_left === 1 ? '' : 's'} left. Months you add now start when the trial ends.`
                                    : plan.active && plan.until
                                      ? `Paid until ${longDate(plan.until)} · ${plan.days_left} day${plan.days_left === 1 ? '' : 's'} left`
                                      : plan.trial_ended && plan.until
                                        ? `Your free Pro trial ended on ${longDate(plan.until)}. You're back on the Free plan; upgrade anytime to unlock Management again. Your records are kept.`
                                        : plan.until
                                          ? `Pro ended on ${longDate(plan.until)}. Management is locked until you renew; your records are kept.`
                                          : `Management modules are locked, and you can add up to ${pricing.free_product_limit} products.`}
                            </p>
                        </div>
                        {!plan.active && (
                            <p className="text-sm text-gray-600">
                                Products:{' '}
                                <strong className={usage.products >= pricing.free_product_limit ? 'text-red-600' : 'text-gray-950'}>
                                    {usage.products} / {pricing.free_product_limit}
                                </strong>
                            </p>
                        )}
                    </div>
                </Card>

                {trial.available && <TrialOffer days={trial.days} canStart={canPay} />}

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                    {/* Plans */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                        <PlanCard name="Free" price="₱0" note="forever" features={FREE_FEATURES} current={!plan.active} />
                        <PlanCard
                            name="Pro"
                            price={peso(pricing.price_cents)}
                            note="per month"
                            features={PRO_FEATURES}
                            current={plan.active}
                            highlight
                        />
                    </div>

                    {/* Buy months */}
                    <Card className="order-first self-start lg:order-none">
                        <CardHeader
                            title={plan.trial ? 'Keep Pro after your trial' : plan.active ? 'Add months' : 'Upgrade to Pro'}
                            subtitle={
                                plan.active
                                    ? 'New months are added after your current end date.'
                                    : 'Pay with any banking or e-wallet app through QR Ph.'
                            }
                        />
                        <div className="card-body space-y-5">
                            {!canPay ? (
                                <Alert tone="blue">Only the store owner can pay for the subscription. Ask them to upgrade.</Alert>
                            ) : (
                                <>
                                    <div>
                                        <p className="label">How many months?</p>
                                        <div className="mt-2 flex items-center gap-3">
                                            <div className="inline-flex items-center rounded-lg border border-gray-300 bg-white">
                                                <button
                                                    type="button"
                                                    onClick={() => setClamped(months - 1)}
                                                    disabled={months <= 1}
                                                    aria-label="One month less"
                                                    className="flex h-11 w-11 items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                                >
                                                    <Icon name="minus" />
                                                </button>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={pricing.max_months}
                                                    value={months}
                                                    onChange={(e) => setClamped(Number(e.target.value) || 1)}
                                                    aria-label="Months"
                                                    className="h-11 w-16 border-0 text-center text-lg font-semibold tabular-nums focus:ring-0"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setClamped(months + 1)}
                                                    disabled={months >= pricing.max_months}
                                                    aria-label="One month more"
                                                    className="flex h-11 w-11 items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                                >
                                                    <Icon name="plus" />
                                                </button>
                                            </div>
                                            <span className="text-sm text-gray-500">month{months === 1 ? '' : 's'}</span>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {[1, 3, 6, 12].map((n) => (
                                                <button
                                                    key={n}
                                                    type="button"
                                                    onClick={() => setClamped(n)}
                                                    aria-pressed={months === n}
                                                    className={`btn btn-sm ${months === n ? 'btn-dark' : 'btn-secondary'}`}
                                                >
                                                    {n} month{n === 1 ? '' : 's'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <dl className="space-y-2 rounded-lg bg-surface p-4 text-sm">
                                        <div className="flex justify-between gap-3">
                                            <dt className="text-gray-600">
                                                {peso(pricing.price_cents)} × {months} month{months === 1 ? '' : 's'}
                                            </dt>
                                            <dd className="tabular-nums text-gray-950">{peso(total)}</dd>
                                        </div>
                                        <div className="flex justify-between gap-3">
                                            <dt className="text-gray-600">Pro until</dt>
                                            <dd className="font-medium text-gray-950">{longDate(newEnd.toISOString())}</dd>
                                        </div>
                                        <div className="flex items-baseline justify-between gap-3 border-t border-gray-200 pt-2">
                                            <dt className="font-semibold text-gray-950">Total</dt>
                                            <dd className="text-2xl font-bold tabular-nums text-gray-950">{peso(total)}</dd>
                                        </div>
                                    </dl>

                                    {!paymentsReady && (
                                        <Alert tone="amber" title="Online payment isn't available yet">
                                            Please contact FinstackPOS to subscribe while we finish setting it up.
                                        </Alert>
                                    )}

                                    <button
                                        type="button"
                                        disabled={!paymentsReady}
                                        onClick={() => setPaying(true)}
                                        className="btn btn-primary btn-lg w-full"
                                    >
                                        <Icon name="qrCode" className="h-5 w-5" />
                                        Pay {peso(total)} with QR Ph
                                    </button>
                                    <p className="text-center text-xs text-gray-500">
                                        Scan with GCash, Maya, or any bank app. Your months are added as soon as the payment is confirmed.
                                    </p>
                                </>
                            )}
                        </div>
                    </Card>
                </div>

                {/* History */}
                <Card className="overflow-hidden">
                    <CardHeader title="Payment history" />
                    {payments.length === 0 ? (
                        <EmptyState title="No payments yet" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th className="num">Months</th>
                                        <th className="num">Amount</th>
                                        <th>Covers</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((p) => (
                                        <tr key={p.id}>
                                            <td className="whitespace-nowrap">
                                                {new Date(p.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                                            </td>
                                            <td className="num">{p.months}</td>
                                            <td className="num">
                                                {p.provider === 'trial'
                                                    ? 'Free trial'
                                                    : p.provider === 'manual'
                                                      ? 'Added by FinstackPOS'
                                                      : peso(p.amount_cents)}
                                            </td>
                                            <td className="whitespace-nowrap">
                                                {p.period_start && p.period_end
                                                    ? `${new Date(p.period_start).toLocaleDateString(undefined, { dateStyle: 'medium' })} – ${new Date(p.period_end).toLocaleDateString(undefined, { dateStyle: 'medium' })}`
                                                    : '—'}
                                            </td>
                                            <td>
                                                {p.status === 'paid' ? (
                                                    <Badge tone="green">Paid</Badge>
                                                ) : p.status === 'pending' ? (
                                                    <Badge tone="amber">Waiting for payment</Badge>
                                                ) : (
                                                    <Badge>Not paid</Badge>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>

            <PayModal show={paying} months={months} total={total} onClose={() => setPaying(false)} />
        </AuthenticatedLayout>
    );
}

/** The once-per-store free Pro trial, for stores that haven't used it. */
function TrialOffer({ days, canStart }: { days: number; canStart: boolean }) {
    const form = useForm({});
    const error = usePage().props.errors.trial;
    const ends = new Date();
    ends.setDate(ends.getDate() + days);

    return (
        <div className="card flex flex-col gap-4 border-brand-300 bg-gradient-to-br from-brand-50 to-white p-5 ring-1 ring-brand-200 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
                    <Icon name="star" className="h-5 w-5" />
                </span>
                <div>
                    <h2 className="text-base font-semibold text-gray-950">Try Pro free for {days} days</h2>
                    <p className="mt-0.5 text-sm text-gray-600">
                        Unlock unlimited products and every Management module until {longDate(ends.toISOString())}. No payment needed; when the
                        trial ends you go back to the Free plan automatically.
                    </p>
                    {error && <p className="field-error">{error}</p>}
                </div>
            </div>
            {canStart ? (
                <button
                    type="button"
                    disabled={form.processing}
                    onClick={() => form.post(route('subscription.trial'), { preserveScroll: true })}
                    className="btn btn-primary btn-lg shrink-0"
                >
                    {form.processing ? 'Starting…' : `Start ${days}-day free trial`}
                </button>
            ) : (
                <p className="shrink-0 text-sm text-gray-500">Ask the store owner to start the trial.</p>
            )}
        </div>
    );
}

function PlanCard({
    name,
    price,
    note,
    features,
    current,
    highlight = false,
}: {
    name: string;
    price: string;
    note: string;
    features: string[];
    current: boolean;
    highlight?: boolean;
}) {
    return (
        <div className={`card p-5 ${highlight ? 'border-brand-300 ring-1 ring-brand-200' : ''}`}>
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-950">{name}</h3>
                {current && <Badge tone={highlight ? 'brand' : 'gray'}>Current plan</Badge>}
            </div>
            <p className="mt-2">
                <span className="text-2xl font-bold tracking-tight text-gray-950">{price}</span> <span className="text-sm text-gray-500">{note}</span>
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-gray-700">
                {features.map((f) => (
                    <li key={f} className="flex gap-2">
                        <Icon name="check" className={`mt-0.5 h-4 w-4 ${highlight ? 'text-brand-600' : 'text-gray-400'}`} />
                        {f}
                    </li>
                ))}
            </ul>
        </div>
    );
}

type QrState =
    | { step: 'creating' }
    | { step: 'waiting'; id: string; image: string; expiresAt: number }
    | { step: 'paid'; until: string | null }
    | { step: 'error'; message: string };

const POLL_MS = 3000;
const QR_LIFETIME_MS = 10 * 60 * 1000;

/**
 * Creates a QR Ph code for the months chosen and waits for PayMongo to
 * confirm it. The server adds the months; this only shows the result.
 */
function PayModal({ show, months, total, onClose }: { show: boolean; months: number; total: number; onClose: () => void }) {
    const [state, setState] = useState<QrState>({ step: 'creating' });
    const [attempt, setAttempt] = useState(0);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!show) {
            return;
        }
        let cancelled = false;
        let timer: number | undefined;

        const poll = (id: string) => {
            timer = window.setTimeout(async () => {
                try {
                    const { data } = await axios.get<{ status: string; subscribed_until: string | null }>(route('subscription.status', id));
                    if (cancelled) {
                        return;
                    }
                    if (data.status === 'paid') {
                        setState({ step: 'paid', until: data.subscribed_until });
                        return;
                    }
                } catch {
                    // Network blip: keep asking.
                }
                if (!cancelled) {
                    poll(id);
                }
            }, POLL_MS);
        };

        setState({ step: 'creating' });
        axios
            .post<{ id: string; qr_image: string }>(route('subscription.checkout'), { months })
            .then(({ data }) => {
                if (!cancelled) {
                    setState({ step: 'waiting', id: data.id, image: data.qr_image, expiresAt: Date.now() + QR_LIFETIME_MS });
                    poll(data.id);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setState({
                        step: 'error',
                        message:
                            (isAxiosError(error) && error.response?.data?.message) || 'Could not create the QR code. Check your internet connection.',
                    });
                }
            });

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [show, months, attempt]);

    useEffect(() => {
        if (state.step !== 'waiting') {
            return;
        }
        const t = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(t);
    }, [state.step]);

    const close = () => {
        if (state.step === 'paid') {
            router.reload();
        }
        onClose();
    };

    const left = state.step === 'waiting' ? Math.max(0, state.expiresAt - now) : 0;
    const expired = state.step === 'waiting' && left === 0;

    return (
        <Modal show={show} onClose={close} maxWidth="md">
            <DialogLayout
                title={state.step === 'paid' ? 'Payment confirmed' : 'Pay with QR Ph'}
                description={`FinstackPOS Pro · ${months} month${months === 1 ? '' : 's'} · ${peso(total)}`}
                footer={
                    <button type="button" onClick={close} className={`btn ${state.step === 'paid' ? 'btn-primary' : 'btn-secondary'}`}>
                        {state.step === 'paid' ? 'Done' : 'Cancel'}
                    </button>
                }
            >
                <div className="py-2 text-center">
                    {state.step === 'creating' && (
                        <div className="mx-auto flex h-60 w-60 animate-pulse items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500">
                            Creating QR code…
                        </div>
                    )}

                    {state.step === 'waiting' && !expired && (
                        <>
                            <p className="text-sm text-gray-600">
                                Scan with any banking or e-wallet app and pay <strong className="text-gray-950">{peso(total)}</strong>.
                            </p>
                            <img src={state.image} alt="QR Ph code" className="mx-auto mt-3 h-60 w-60 rounded-lg ring-1 ring-gray-200" />
                            <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-gray-700">
                                <Icon name="refresh" className="h-4 w-4 animate-spin text-gray-400 [animation-duration:2s]" />
                                Waiting for the bank to confirm · {Math.floor(left / 60000)}:
                                {String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}
                            </p>
                        </>
                    )}

                    {expired && (
                        <div>
                            <p className="text-sm text-gray-600">This QR code has expired. If you already paid, your months will appear shortly.</p>
                            <button type="button" onClick={() => setAttempt((a) => a + 1)} className="btn btn-secondary mt-3">
                                <Icon name="refresh" />
                                New QR code
                            </button>
                        </div>
                    )}

                    {state.step === 'paid' && (
                        <div className="py-4">
                            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                                <Icon name="check" className="h-6 w-6" />
                            </span>
                            <p className="mt-3 font-semibold text-gray-950">Thank you! Pro is active.</p>
                            {state.until && <p className="mt-1 text-sm text-gray-600">Paid until {longDate(state.until)}.</p>}
                        </div>
                    )}

                    {state.step === 'error' && (
                        <Alert tone="red">
                            <p>{state.message}</p>
                            <button type="button" onClick={() => setAttempt((a) => a + 1)} className="btn btn-secondary btn-sm mt-3">
                                <Icon name="refresh" />
                                Try again
                            </button>
                        </Alert>
                    )}
                </div>
            </DialogLayout>
        </Modal>
    );
}
