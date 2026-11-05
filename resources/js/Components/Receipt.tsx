import { PaymentMethod } from '@/lib/db';
import { DISCOUNT_LABELS, PAYMENT_LABELS } from '@/lib/format';
import { DiscountType, formatMoney, formatPercent } from '@/lib/money';
import { MerchantSettings } from '@/types';
import { SelectedOption } from '@/types/catalog';
import { ReactNode, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';

export interface ReceiptData {
    reference: string;
    sold_at: string;
    cashier: string | null;
    items: {
        name: string;
        options: SelectedOption[] | null;
        quantity: number;
        unit_price_cents: number;
        line_total_cents: number;
    }[];
    subtotal_cents: number;
    discount_type: DiscountType | null;
    discount_id_number: string | null;
    discount_customer_name: string | null;
    vat_exempt_cents: number;
    discount_cents: number;
    service_charge_cents: number;
    tax_cents: number;
    total_cents: number;
    payment_method: PaymentMethod;
    payment_reference: string | null;
    amount_paid_cents: number;
    change_cents: number;
}

type ReceiptSettings = Pick<
    MerchantSettings,
    | 'name'
    | 'address'
    | 'tin'
    | 'contact_number'
    | 'currency'
    | 'tax_rate_bps'
    | 'prices_include_tax'
    | 'discount_rate_bps'
    | 'service_charge_bps'
    | 'receipt_footer'
    | 'receipt_paper_mm'
    | 'manual_qr_label'
>;

/**
 * A thermal-printer style receipt (58 or 80 mm). Used for printing and as
 * the live preview on the settings page.
 */
export function Receipt({ data, settings }: { data: ReceiptData; settings: ReceiptSettings }) {
    const money = (cents: number) => formatMoney(cents, settings.currency);
    const narrow = settings.receipt_paper_mm === 58;
    const paymentLabel =
        data.payment_method === 'ewallet' && settings.manual_qr_label
            ? settings.manual_qr_label
            : PAYMENT_LABELS[data.payment_method];

    return (
        <div
            className={`bg-white font-mono leading-snug text-black ${narrow ? 'w-[58mm] px-[2mm] text-[10px]' : 'w-[80mm] px-[3mm] text-[11.5px]'} py-[4mm]`}
        >
            <div className="text-center">
                <p className="text-[1.3em] font-bold uppercase">{settings.name}</p>
                {settings.address && <p>{settings.address}</p>}
                {settings.tin && <p>TIN: {settings.tin}</p>}
                {settings.contact_number && <p>Tel: {settings.contact_number}</p>}
            </div>

            <Divider />
            <Line left={`Ref: ${data.reference}`} right={new Date(data.sold_at).toLocaleDateString()} />
            <Line left={data.cashier ? `Cashier: ${data.cashier}` : ''} right={new Date(data.sold_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
            <Divider />

            {data.items.map((item, i) => (
                <div key={i} className="mb-1">
                    <p className="font-semibold">
                        {item.name}
                        {item.options && item.options.length > 0 && ` (${item.options.map((o) => o.value).join(', ')})`}
                    </p>
                    <Line
                        left={`  ${item.quantity} x ${money(item.unit_price_cents)}`}
                        right={money(item.line_total_cents)}
                    />
                </div>
            ))}

            <Divider />
            <Line left="Subtotal" right={money(data.subtotal_cents)} />
            {data.vat_exempt_cents > 0 && (
                <Line left={`Less VAT (${formatPercent(settings.tax_rate_bps)})`} right={`-${money(data.vat_exempt_cents)}`} />
            )}
            {data.discount_type && data.discount_cents > 0 && (
                <Line
                    left={`Less ${DISCOUNT_LABELS[data.discount_type]} (${formatPercent(settings.discount_rate_bps)})`}
                    right={`-${money(data.discount_cents)}`}
                />
            )}
            {data.service_charge_cents > 0 && (
                <Line
                    left={`Service charge (${formatPercent(settings.service_charge_bps)})`}
                    right={money(data.service_charge_cents)}
                />
            )}
            {data.tax_cents > 0 && !settings.prices_include_tax && (
                <Line left={`VAT (${formatPercent(settings.tax_rate_bps)})`} right={money(data.tax_cents)} />
            )}

            <div className="my-1 flex justify-between border-y border-dashed border-black py-1 text-[1.25em] font-bold">
                <span>TOTAL</span>
                <span>{money(data.total_cents)}</span>
            </div>

            <Line left={paymentLabel} right={money(data.amount_paid_cents)} />
            {data.change_cents > 0 && <Line left="Change" right={money(data.change_cents)} />}
            {data.payment_reference && <Line left="Ref no." right={data.payment_reference} />}

            {/* VAT breakdown */}
            <Divider />
            {data.vat_exempt_cents > 0 || data.discount_type ? (
                <Line left="VAT-exempt sale" right={money(data.subtotal_cents - data.vat_exempt_cents)} />
            ) : data.tax_cents > 0 ? (
                <>
                    <Line
                        left="VATable sale"
                        right={money(data.total_cents - data.service_charge_cents - data.tax_cents)}
                    />
                    <Line left={`VAT (${formatPercent(settings.tax_rate_bps)})`} right={money(data.tax_cents)} />
                </>
            ) : null}

            {data.discount_type && (
                <>
                    <Divider />
                    <p>{DISCOUNT_LABELS[data.discount_type]} ID: {data.discount_id_number}</p>
                    <p>Name: {data.discount_customer_name}</p>
                    <p className="mt-3">Signature: ____________________</p>
                </>
            )}

            {settings.receipt_footer && (
                <>
                    <Divider />
                    <p className="whitespace-pre-line text-center">{settings.receipt_footer}</p>
                </>
            )}
            <p className="mt-2 text-center text-[0.85em]">Powered by FinstackPOS</p>
        </div>
    );
}

function Line({ left, right }: { left: ReactNode; right: ReactNode }) {
    return (
        <div className="flex justify-between gap-2">
            <span className="min-w-0 break-words">{left}</span>
            <span className="shrink-0 text-right">{right}</span>
        </div>
    );
}

function Divider() {
    return <div className="my-1.5 border-t border-dashed border-black" />;
}

/**
 * Prints receipts through the browser's print system, so any printer the
 * computer has a driver for works: USB, Bluetooth or network thermal
 * printers included. Only the receipt is printed (see app.css).
 */
export function useReceiptPrinter(settings: ReceiptSettings) {
    const [data, setData] = useState<ReceiptData | null>(null);

    const printReceipt = (receipt: ReceiptData) => {
        // Render the receipt synchronously so it's in the DOM when printing.
        flushSync(() => setData(receipt));
        window.print();
    };

    const printer = data
        ? createPortal(
              <div id="receipt-print">
                  <style>{`@page { size: ${settings.receipt_paper_mm}mm auto; margin: 0; }`}</style>
                  <Receipt data={data} settings={settings} />
              </div>,
              document.body,
          )
        : null;

    return { printReceipt, printer };
}
