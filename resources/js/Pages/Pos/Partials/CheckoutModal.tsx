import InputLabel from '@/Components/InputLabel';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';
import { PaymentMethod } from '@/lib/db';
import { formatMoney, parseMoney } from '@/lib/money';
import { MerchantSettings } from '@/types';
import { Icon, ICONS } from '@/Components/NavIcons';
import { isAxiosError } from 'axios';
import { FormEventHandler, useEffect, useRef, useState } from 'react';

export interface PaymentResult {
    method: PaymentMethod;
    amountPaid: number;
    reference: string | null;
}

/** Exact amount plus the next round bills above it (₱100, ₱500, ₱1000). */
function quickAmounts(total: number): number[] {
    const amounts = [10000, 50000, 100000].map((step) => Math.ceil(total / step) * step);

    return [...new Set([total, ...amounts])].filter((a) => a >= total);
}

export default function CheckoutModal({
    show,
    total,
    merchant,
    online,
    onClose,
    onConfirm,
    onPaymentStage,
}: {
    show: boolean;
    total: number;
    merchant: MerchantSettings;
    online: boolean;
    onClose: () => void;
    onConfirm: (payment: PaymentResult) => Promise<void>;
    /** The chosen method and the QR to show the customer (for the customer display). */
    onPaymentStage?: (stage: { method: PaymentMethod; label: string; qrImage: string | null }) => void;
}) {
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [tendered, setTendered] = useState('');
    const [reference, setReference] = useState('');
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (show) {
            setMethod('cash');
            setTendered('');
            setReference('');
        }
    }, [show]);

    // Cash, and one QR: the QR picked in Settings (the store's own QR picture
    // or PayMongo QR Ph). PayMongo needs internet, so offline the store's own
    // QR picture is used if there is one. Not set up: shown, but disabled.
    type Choice = { value: PaymentMethod; label: string; detail?: string; icon: keyof typeof ICONS; disabled?: string };
    const ownQr: Choice | null = merchant.manual_qr_image_url
        ? { value: 'ewallet', label: 'QR', detail: merchant.manual_qr_label || 'Own QR', icon: 'qrCode' }
        : null;
    const qrPh: Choice = { value: 'qrph', label: 'QR', detail: 'QR Ph', icon: 'qrCode' };
    const qr: Choice = merchant.paymongo_ready
        ? online
            ? qrPh
            : (ownQr ?? { ...qrPh, disabled: 'Needs internet' })
        : merchant.paymongo_enabled
          ? { ...qrPh, disabled: 'Add PayMongo key in Settings' }
          : merchant.manual_qr_enabled
            ? (ownQr ?? { value: 'ewallet', label: 'QR', icon: 'qrCode', disabled: 'Upload QR in Settings' })
            : { value: 'ewallet', label: 'QR', icon: 'qrCode', disabled: 'Turn on in Settings' };
    const methods: Choice[] = [{ value: 'cash', label: 'Cash', icon: 'cash' }, qr];

    // Going offline can take away the chosen method (QR Ph): fall back to cash.
    const available = methods.some((m) => m.value === method && !m.disabled);
    useEffect(() => {
        if (show && !available && !processing) {
            setMethod('cash');
        }
    }, [show, available, processing]);

    const [qrImage, setQrImage] = useState<string | null>(null);
    const stageRef = useRef(onPaymentStage);
    stageRef.current = onPaymentStage;
    const chosen = methods.find((m) => m.value === method);
    const methodLabel = chosen?.detail ?? chosen?.label ?? method;

    // Tell the customer display how they're paying (and which QR to scan).
    useEffect(() => {
        if (show) {
            const image = method === 'ewallet' ? (merchant.manual_qr_image_url ?? null) : method === 'qrph' ? qrImage : null;
            stageRef.current?.({ method, label: methodLabel, qrImage: image });
        }
    }, [show, method, methodLabel, qrImage, merchant.manual_qr_image_url]);

    useEffect(() => {
        if (method !== 'qrph') {
            setQrImage(null);
        }
    }, [method]);

    const amountPaid = method === 'cash' ? parseMoney(tendered) : total;
    const valid = amountPaid !== null && amountPaid >= total;
    const money = (cents: number) => formatMoney(cents, merchant.currency);

    const complete = async (payment: PaymentResult) => {
        if (processing) {
            return;
        }
        setProcessing(true);
        try {
            await onConfirm(payment);
        } finally {
            setProcessing(false);
        }
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        if (valid && method !== 'qrph') {
            void complete({ method, amountPaid, reference: reference.trim() || null });
        }
    };

    return (
        <Modal show={show} onClose={processing ? () => undefined : onClose} maxWidth="md">
            <form onSubmit={submit} className="flex max-h-[92vh] flex-col">
                <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Amount due</p>
                    <p className="mt-0.5 text-3xl font-bold tabular-nums tracking-tight text-gray-950">{money(total)}</p>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                    <p className="label">Payment method</p>
                    <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup">
                        {methods.map((m) => (
                            <button
                                key={m.value}
                                type="button"
                                role="radio"
                                aria-checked={method === m.value}
                                disabled={Boolean(m.disabled) || processing}
                                title={m.disabled}
                                onClick={() => setMethod(m.value)}
                                className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                    method === m.value
                                        ? 'border-brand-600 bg-brand-50 text-brand-700 ring-1 ring-brand-600'
                                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                <Icon name={m.icon} className="h-5 w-5" />
                                <span className="max-w-full truncate">{m.label}</span>
                                {m.detail && !m.disabled && (
                                    <span className="max-w-full truncate text-xs font-normal opacity-80">{m.detail}</span>
                                )}
                                {m.disabled && <span className="max-w-full text-xs font-normal">{m.disabled}</span>}
                            </button>
                        ))}
                    </div>

                    {method === 'cash' && (
                        <div className="mt-5">
                            <InputLabel htmlFor="tendered" value="Cash received" />
                            <TextInput
                                id="tendered"
                                inputMode="decimal"
                                autoComplete="off"
                                className="mt-1 h-12 text-xl font-semibold tabular-nums"
                                value={tendered}
                                isFocused
                                onChange={(e) => setTendered(e.target.value)}
                            />
                            <div className="mt-2 flex flex-wrap gap-2">
                                {quickAmounts(total).map((amount) => (
                                    <button
                                        key={amount}
                                        type="button"
                                        onClick={() => setTendered((amount / 100).toFixed(2))}
                                        className="btn btn-secondary btn-sm tabular-nums"
                                    >
                                        {amount === total ? 'Exact' : money(amount)}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-4 flex items-baseline justify-between rounded-lg bg-surface px-4 py-3">
                                <span className="text-sm font-medium text-gray-600">Change</span>
                                <span className="text-2xl font-bold tabular-nums text-gray-950">{valid ? money(amountPaid - total) : '—'}</span>
                            </div>
                        </div>
                    )}

                    {method === 'ewallet' && merchant.manual_qr_image_url && (
                        <div className="mt-5 text-center">
                            <p className="text-sm text-gray-600">
                                Ask the customer to scan and pay <strong className="text-gray-950">{money(total)}</strong>
                            </p>
                            <img
                                src={merchant.manual_qr_image_url}
                                alt={`${merchant.manual_qr_label || 'Payment'} QR code`}
                                className="mx-auto mt-3 max-h-64 w-auto rounded-lg ring-1 ring-gray-200"
                            />
                            <div className="text-left">
                                <ReferenceField
                                    label="Reference no. from the customer's receipt (optional)"
                                    value={reference}
                                    onChange={setReference}
                                />
                            </div>
                            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900">
                                Check that the payment arrived in your account before completing the sale.
                            </p>
                        </div>
                    )}

                    {method === 'qrph' && (
                        <QrPhPayment
                            total={total}
                            currency={merchant.currency}
                            onImage={setQrImage}
                            onPaid={(intentId) => void complete({ method: 'qrph', amountPaid: total, reference: intentId })}
                        />
                    )}
                </div>

                <div className="flex gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3 sm:px-6">
                    <SecondaryButton onClick={onClose} disabled={processing} className="btn-lg">
                        Cancel
                    </SecondaryButton>
                    {method !== 'qrph' && (
                        <PrimaryButton disabled={!valid || processing} className="btn-lg flex-1">
                            {processing ? 'Completing…' : method === 'ewallet' ? 'Payment received' : 'Complete sale'}
                        </PrimaryButton>
                    )}
                </div>
            </form>
        </Modal>
    );
}

function ReferenceField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return (
        <div className="mt-5">
            <InputLabel htmlFor="payment-reference" value={label} />
            <TextInput
                id="payment-reference"
                value={value}
                maxLength={100}
                autoComplete="off"
                onChange={(e) => onChange(e.target.value)}
                className="mt-1"
            />
        </div>
    );
}

type QrState = { step: 'creating' } | { step: 'waiting'; id: string; image: string } | { step: 'paid' } | { step: 'error'; message: string };

const POLL_MS = 2500;

/**
 * Asks the server for a PayMongo QR Ph code for exactly this amount, then
 * polls until the customer has paid and completes the sale by itself.
 */
function QrPhPayment({
    total,
    currency,
    onPaid,
    onImage,
}: {
    total: number;
    currency: string;
    onPaid: (intentId: string) => void;
    /** The QR to also show on the customer display (null when there is none). */
    onImage: (image: string | null) => void;
}) {
    const [state, setState] = useState<QrState>({ step: 'creating' });
    const [attempt, setAttempt] = useState(0);
    const onPaidRef = useRef(onPaid);
    onPaidRef.current = onPaid;
    const onImageRef = useRef(onImage);
    onImageRef.current = onImage;

    useEffect(() => {
        onImageRef.current(state.step === 'waiting' ? state.image : null);
    }, [state]);

    useEffect(() => {
        let cancelled = false;
        let timer: number | undefined;

        const poll = (id: string) => {
            timer = window.setTimeout(async () => {
                try {
                    const { data } = await window.axios.get<{ status: string }>(route('pos.payments.qrph.show', id));
                    if (cancelled) {
                        return;
                    }
                    if (data.status === 'succeeded') {
                        setState({ step: 'paid' });
                        onPaidRef.current(id);
                        return;
                    }
                } catch {
                    // Network blip: keep polling.
                }
                if (!cancelled) {
                    poll(id);
                }
            }, POLL_MS);
        };

        setState({ step: 'creating' });
        window.axios
            .post<{ id: string; qr_image: string }>(route('pos.payments.qrph.store'), {
                amount_cents: total,
            })
            .then(({ data }) => {
                if (!cancelled) {
                    setState({ step: 'waiting', id: data.id, image: data.qr_image });
                    poll(data.id);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setState({
                        step: 'error',
                        message:
                            (isAxiosError(error) && error.response?.data?.message) || 'Could not create the QR code. Check the internet connection.',
                    });
                }
            });

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [total, attempt]);

    return (
        <div className="mt-5 text-center">
            {state.step === 'creating' && (
                <div className="mx-auto flex h-60 w-60 animate-pulse items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500">
                    Creating QR code…
                </div>
            )}

            {state.step === 'waiting' && (
                <>
                    <p className="text-sm text-gray-600">
                        Scan with any banking or e-wallet app to pay <strong>{formatMoney(total, currency)}</strong>
                    </p>
                    <img src={state.image} alt="QR Ph code" className="mx-auto mt-3 h-60 w-60 rounded-lg ring-1 ring-gray-200" />
                    <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-medium text-gray-700">
                        <Icon name="refresh" className="h-4 w-4 animate-spin text-gray-400 [animation-duration:2s]" />
                        Waiting for the bank to confirm. The sale completes automatically.
                    </p>
                </>
            )}

            {state.step === 'paid' && (
                <p className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 font-semibold text-emerald-800">
                    <Icon name="check" className="h-5 w-5" />
                    Payment confirmed. Completing the sale…
                </p>
            )}

            {state.step === 'error' && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
                    <p>{state.message}</p>
                    <button type="button" onClick={() => setAttempt((a) => a + 1)} className="btn btn-secondary btn-sm mt-3">
                        <Icon name="refresh" />
                        Try again
                    </button>
                </div>
            )}
        </div>
    );
}
