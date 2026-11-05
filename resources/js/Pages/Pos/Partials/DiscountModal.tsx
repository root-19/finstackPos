import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { Icon } from '@/Components/NavIcons';
import TextInput from '@/Components/TextInput';
import { DohCheck } from '@/lib/db';
import { DISCOUNT_LABELS } from '@/lib/format';
import { DiscountType, formatPercent } from '@/lib/money';
import { MerchantSettings } from '@/types';
import { FormEventHandler, useEffect, useRef, useState } from 'react';

export interface AppliedDiscount {
    type: DiscountType;
    idNumber: string;
    customerName: string;
    /** PWD only: what the cashier saw on the DOH registry (null: not checked). */
    dohCheck: DohCheck | null;
}

/**
 * The DOH PWD ID registry (pwd.doh.gov.ph), opened already searched for the
 * number. It can't be shown inside the POS (the site forbids embedding), so it
 * opens in a small popup window beside it and the cashier records what they saw.
 */
export const dohPwdLookupUrl = (idNumber: string) =>
    'https://pwd.doh.gov.ph/tbl_pwd_id_verificationlist.php?' +
    new URLSearchParams({ t: 'tbl_pwd_id_verification', cmd: 'search', z_pwd_id_number: '=', x_pwd_id_number: idNumber.trim() }).toString();

/** Senior citizen / PWD discount: records the ID and name the law requires. */
export default function DiscountModal({
    show,
    merchant,
    current,
    online,
    onClose,
    onApply,
}: {
    show: boolean;
    merchant: MerchantSettings;
    /** The DOH check needs internet. */
    online: boolean;
    current: AppliedDiscount | null;
    onClose: () => void;
    onApply: (discount: AppliedDiscount) => void;
}) {
    const types = (['senior', 'pwd'] as const).filter((t) => (t === 'senior' ? merchant.senior_discount_enabled : merchant.pwd_discount_enabled));
    const [type, setType] = useState<DiscountType>(types[0] ?? 'senior');
    const [idNumber, setIdNumber] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [dohCheck, setDohCheck] = useState<DohCheck | null>(null);
    const doh = useDohPopup();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (show) {
            setType(current?.type ?? types[0] ?? 'senior');
            setIdNumber(current?.idNumber ?? '');
            setCustomerName(current?.customerName ?? '');
            setDohCheck(current?.dohCheck ?? null);
            setError(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show]);

    // Never leave the DOH window behind once the discount is applied or cancelled.
    useEffect(() => {
        if (!show) {
            doh.close();
        }
    }, [show, doh]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        if (!idNumber.trim() || !customerName.trim()) {
            setError('Enter the ID number and the name on the ID.');
            return;
        }
        onApply({ type, idNumber: idNumber.trim(), customerName: customerName.trim(), dohCheck: type === 'pwd' ? dohCheck : null });
    };

    return (
        <Modal show={show} onClose={onClose} maxWidth="md">
            <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
                <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
                    <h2 className="text-base font-semibold text-gray-950">Senior / PWD discount</h2>
                    <p className="mt-0.5 text-sm text-gray-500">
                        {formatPercent(merchant.discount_rate_bps)} off
                        {merchant.discount_vat_exempt && ', VAT-exempt'}. Check the customer's ID before applying.
                    </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                    <div className="grid grid-cols-2 gap-2">
                        {types.map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setType(t)}
                                aria-pressed={type === t}
                                className={`rounded-lg border px-3 py-3 text-sm font-semibold transition-colors ${
                                    type === t
                                        ? 'border-brand-600 bg-brand-50 text-brand-700 ring-1 ring-brand-600'
                                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                {DISCOUNT_LABELS[t]}
                            </button>
                        ))}
                    </div>

                    <div className="mt-5 space-y-4">
                        <div>
                            <InputLabel htmlFor="discount-id" value={`${DISCOUNT_LABELS[type]} ID number`} />
                            <TextInput
                                id="discount-id"
                                value={idNumber}
                                maxLength={50}
                                onChange={(e) => {
                                    setIdNumber(e.target.value);
                                    // A check was for the old number.
                                    setDohCheck(null);
                                }}
                                className="mt-1"
                                isFocused
                            />
                        </div>
                        {type === 'pwd' && (
                            <DohLookup
                                idNumber={idNumber}
                                online={online}
                                result={dohCheck}
                                onOpen={() => doh.open(dohPwdLookupUrl(idNumber))}
                                onResult={(result) => {
                                    setDohCheck(result);
                                    doh.close();
                                }}
                            />
                        )}
                        <div>
                            <InputLabel htmlFor="discount-name" value="Name on the ID" />
                            <TextInput
                                id="discount-name"
                                value={customerName}
                                maxLength={100}
                                onChange={(e) => setCustomerName(e.target.value)}
                                className="mt-1"
                            />
                        </div>
                        <InputError message={error ?? undefined} />
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3 sm:px-6">
                    <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                    <PrimaryButton>Apply discount</PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}

const DOH_WINDOW = 'finstack-doh-pwd-check';

/**
 * A small window beside the register showing the DOH registry, reused for
 * each check and closed by the POS once the cashier records the result.
 *
 * The window keeps its opener on purpose: Chrome cuts the POS off from a
 * detached popup, so it could no longer close it. The DOH page can't read the
 * POS (other origin); at most it could navigate it, and the window is only
 * open for the few seconds of the check.
 */
function useDohPopup() {
    const ref = useRef<Window | null>(null);
    const [api] = useState(() => ({
        open(url: string) {
            const width = Math.min(960, window.screen.availWidth - 40);
            const height = Math.min(760, window.screen.availHeight - 80);
            const left = Math.max(0, window.screenX + window.outerWidth - width - 20);
            const top = Math.max(0, window.screenY + 60);
            const popup = window.open(url, DOH_WINDOW, `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
            if (!popup) {
                // Popups blocked: a normal new tab still shows the result.
                window.open(url, '_blank', 'noopener,noreferrer');
                return;
            }
            popup.focus();
            ref.current = popup;
        },
        close() {
            if (ref.current && !ref.current.closed) {
                ref.current.close();
            }
            ref.current = null;
        },
    }));

    return api;
}

/** Look the PWD ID up on the DOH registry and record what was seen. Advisory only. */
function DohLookup({
    idNumber,
    online,
    result,
    onOpen,
    onResult,
}: {
    idNumber: string;
    online: boolean;
    result: DohCheck | null;
    onOpen: () => void;
    onResult: (result: DohCheck | null) => void;
}) {
    const hasId = idNumber.trim() !== '';
    const choice = (value: DohCheck, label: string, tone: string) => (
        <button
            type="button"
            disabled={!hasId}
            onClick={() => onResult(result === value ? null : value)}
            aria-pressed={result === value}
            className={`btn btn-sm flex-1 ${result === value ? tone : 'btn-secondary'}`}
        >
            {label}
        </button>
    );

    return (
        <div className="rounded-lg border border-gray-200 bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-700">DOH PWD registry</p>
                <button type="button" onClick={onOpen} disabled={!hasId || !online} className="btn btn-secondary btn-sm">
                    <Icon name="search" />
                    Check on DOH
                </button>
            </div>
            <p className="help">
                {!online
                    ? 'Needs internet. You can still apply the discount; check the ID card itself.'
                    : !hasId
                      ? 'Enter the ID number first.'
                      : 'Opens a small DOH window beside the register, already searched for this ID. Then tap what you saw.'}
            </p>
            <div className="mt-3 flex gap-2" role="group" aria-label="DOH registry result">
                {choice('found', 'Found', 'bg-emerald-600 text-white hover:bg-emerald-700')}
                {choice('not_found', 'Not found', 'bg-amber-500 text-white hover:bg-amber-600')}
            </div>
            <p className="mt-2 text-xs text-gray-500">
                {result === 'not_found'
                    ? 'Not every LGU-issued ID is listed yet, so this doesn\u2019t mean it\u2019s fake. Check the photo, name, and expiry on the card. The discount still applies.'
                    : '\u201cNo records found\u201d doesn\u2019t mean the ID is fake: not every LGU-issued ID is listed yet. The discount is never blocked.'}
            </p>
        </div>
    );
}
