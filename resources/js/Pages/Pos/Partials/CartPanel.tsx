import { Icon } from '@/Components/NavIcons';
import { LocalSaleItem } from '@/lib/db';
import { DISCOUNT_LABELS } from '@/lib/format';
import { formatMoney, formatPercent, Totals } from '@/lib/money';
import { MerchantSettings } from '@/types';
import { AppliedDiscount } from './DiscountModal';

/** The current sale: lines with quantity steppers, discount, totals, and Charge. */
export default function CartPanel({
    lines,
    merchant,
    subtotal,
    totals,
    discount,
    onQuantityChange,
    onClear,
    onCharge,
    onEditDiscount,
    onRemoveDiscount,
}: {
    lines: LocalSaleItem[];
    merchant: MerchantSettings;
    subtotal: number;
    totals: Totals;
    discount: AppliedDiscount | null;
    onQuantityChange: (lineId: string, quantity: number) => void;
    onClear: () => void;
    onCharge: () => void;
    onEditDiscount: () => void;
    onRemoveDiscount: () => void;
}) {
    const money = (cents: number) => formatMoney(cents, merchant.currency);
    const discountsOffered = merchant.senior_discount_enabled || merchant.pwd_discount_enabled;
    const units = lines.reduce((sum, l) => sum + l.quantity, 0);

    return (
        <div className="flex h-full min-h-0 flex-col bg-white">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-4">
                <h2 className="text-sm font-semibold text-gray-950">
                    Current sale
                    {units > 0 && (
                        <span className="ms-2 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">{units} item(s)</span>
                    )}
                </h2>
                {lines.length > 0 && (
                    <button type="button" onClick={onClear} className="btn btn-ghost btn-sm text-gray-500 hover:text-red-600">
                        <Icon name="trash" />
                        Clear
                    </button>
                )}
            </div>

            <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
                {lines.length === 0 && (
                    <li className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                            <Icon name="pos" className="h-5 w-5" />
                        </span>
                        <p className="mt-3 text-sm font-medium text-gray-950">No items yet</p>
                        <p className="mt-0.5 text-sm text-gray-500">Tap a product or scan a barcode to start.</p>
                    </li>
                )}
                {lines.map((line) => (
                    <li key={line.line_id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-gray-950">{line.name}</p>
                                <p className="text-xs text-gray-500">
                                    {line.options.length > 0 && (
                                        <span className="me-1.5 rounded bg-brand-50 px-1.5 py-0.5 font-medium text-brand-700">
                                            {line.options.map((o) => o.value).join(' · ')}
                                        </span>
                                    )}
                                    {money(line.unit_price_cents)} each
                                </p>
                            </div>
                            <p className="shrink-0 text-sm font-semibold tabular-nums text-gray-950">
                                {money(line.unit_price_cents * line.quantity)}
                            </p>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                            <div className="inline-flex items-center rounded-lg border border-gray-300 bg-white">
                                <StepButton
                                    label={`Decrease ${line.name}`}
                                    icon="minus"
                                    onClick={() => onQuantityChange(line.line_id, line.quantity - 1)}
                                />
                                <span className="w-9 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                                    {line.quantity}
                                </span>
                                <StepButton
                                    label={`Increase ${line.name}`}
                                    icon="plus"
                                    onClick={() => onQuantityChange(line.line_id, line.quantity + 1)}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => onQuantityChange(line.line_id, 0)}
                                aria-label={`Remove ${line.name}`}
                                className="btn btn-ghost btn-sm btn-icon text-gray-400 hover:text-red-600"
                            >
                                <Icon name="trash" />
                            </button>
                        </div>
                    </li>
                ))}
            </ul>

            <div className="shrink-0 border-t border-gray-200 bg-white">
                {discountsOffered && lines.length > 0 && (
                    <div className="px-4 pt-3">
                        {discount ? (
                            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                                <Icon name="tag" className="h-4 w-4 text-emerald-700" />
                                <span className="min-w-0 flex-1 truncate font-medium text-emerald-900">
                                    {DISCOUNT_LABELS[discount.type]} · {discount.customerName}
                                </span>
                                <button type="button" onClick={onEditDiscount} className="text-xs font-semibold text-emerald-800 hover:underline">
                                    Edit
                                </button>
                                <button type="button" onClick={onRemoveDiscount} className="text-xs font-semibold text-gray-500 hover:text-red-700">
                                    Remove
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={onEditDiscount} className="btn btn-secondary w-full border-dashed text-gray-600">
                                <Icon name="tag" />
                                Senior / PWD discount
                            </button>
                        )}
                    </div>
                )}

                <dl className="space-y-1 px-4 pt-3 text-sm">
                    <Row label="Subtotal" value={money(subtotal)} />
                    {totals.vatExempt > 0 && (
                        <Row label={`Less VAT (${formatPercent(merchant.tax_rate_bps)})`} value={`−${money(totals.vatExempt)}`} />
                    )}
                    {totals.discount > 0 && discount && (
                        <Row
                            label={`${DISCOUNT_LABELS[discount.type]} (${formatPercent(merchant.discount_rate_bps)})`}
                            value={`−${money(totals.discount)}`}
                        />
                    )}
                    {totals.serviceCharge > 0 && (
                        <Row label={`Service charge (${formatPercent(merchant.service_charge_bps)})`} value={money(totals.serviceCharge)} />
                    )}
                    {totals.tax > 0 && (
                        <Row
                            label={`VAT ${formatPercent(merchant.tax_rate_bps)}${merchant.prices_include_tax ? ' (included)' : ''}`}
                            value={money(totals.tax)}
                        />
                    )}
                </dl>
                <div className="flex items-baseline justify-between px-4 pb-3 pt-2">
                    <span className="text-base font-semibold text-gray-950">Total</span>
                    <span className="text-2xl font-bold tabular-nums tracking-tight text-gray-950">{money(totals.total)}</span>
                </div>

                <div className="px-4 pb-4">
                    <button type="button" className="btn btn-primary h-14 w-full text-base" disabled={lines.length === 0} onClick={onCharge}>
                        Charge {money(totals.total)}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3 text-gray-600">
            <dt>{label}</dt>
            <dd className="tabular-nums text-gray-900">{value}</dd>
        </div>
    );
}

function StepButton({ label, icon, onClick }: { label: string; icon: 'plus' | 'minus'; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="flex h-9 w-9 items-center justify-center text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40"
        >
            <Icon name={icon} />
        </button>
    );
}
