import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import { useReceiptPrinter } from '@/Components/Receipt';
import { Badge, Card, CardHeader } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PaymentMethod } from '@/lib/db';
import { DISCOUNT_LABELS, formatDateTime } from '@/lib/format';
import { DiscountType, formatMoney } from '@/lib/money';
import { MerchantSettings, PageProps } from '@/types';
import { SelectedOption } from '@/types/catalog';
import { Head, Link } from '@inertiajs/react';
import { ReactNode } from 'react';
import { PaymentBadge } from './Index';

interface SaleDetail {
    id: number;
    reference: string;
    sold_at: string;
    synced_at: string;
    cashier: string | null;
    branch: string | null;
    payment_method: PaymentMethod;
    payment_reference: string | null;
    subtotal_cents: number;
    discount_type: DiscountType | null;
    discount_id_number: string | null;
    discount_doh_check: 'found' | 'not_found' | null;
    discount_customer_name: string | null;
    vat_exempt_cents: number;
    discount_cents: number;
    service_charge_cents: number;
    tax_cents: number;
    total_cents: number;
    amount_paid_cents: number;
    change_cents: number;
    items: {
        id: number;
        name: string;
        options: SelectedOption[] | null;
        unit_price_cents: number;
        quantity: number;
        line_total_cents: number;
    }[];
}

export default function SaleShow({ auth, sale }: PageProps<{ sale: SaleDetail }>) {
    const merchant = auth.merchant;
    const money = (cents: number) => formatMoney(cents, merchant?.currency ?? 'PHP');
    // Reprints use today's receipt settings (name, address, footer...).
    const { printReceipt, printer } = useReceiptPrinter(merchant as MerchantSettings);
    const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <AuthenticatedLayout header={<PageHeader title={`Sale ${sale.reference}`} subtitle={formatDateTime(sale.sold_at)} />}>
            <Head title={`Sale ${sale.reference}`} />

            <div className="app-page">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={route('sales.index')} className="btn btn-ghost btn-sm -ms-2.5">
                        <Icon name="chevronLeft" className="h-3.5 w-3.5" />
                        Back to sales
                    </Link>
                    {merchant && (
                        <button type="button" onClick={() => printReceipt(sale)} className="btn btn-secondary">
                            <Icon name="printer" />
                            Reprint receipt
                        </button>
                    )}
                </div>

                <div className="grid items-start gap-4 lg:grid-cols-3">
                    <Card className="overflow-hidden lg:col-span-2">
                        <CardHeader title="Items" subtitle={`${itemCount} item${itemCount === 1 ? '' : 's'}`} />
                        <ul className="divide-y divide-gray-100">
                            {sale.items.map((item) => (
                                <li key={item.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                                    <span className="mt-0.5 inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 px-1.5 text-xs font-semibold tabular-nums text-gray-700">
                                        {item.quantity}×
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-gray-950">{item.name}</p>
                                        {item.options && item.options.length > 0 && (
                                            <p className="text-xs text-brand-700">{item.options.map((o) => `${o.group}: ${o.value}`).join(' · ')}</p>
                                        )}
                                        <p className="text-xs tabular-nums text-gray-500">{money(item.unit_price_cents)} each</p>
                                    </div>
                                    <p className="shrink-0 text-sm font-medium tabular-nums text-gray-950">{money(item.line_total_cents)}</p>
                                </li>
                            ))}
                        </ul>
                        <dl className="space-y-1.5 border-t border-gray-200 bg-gray-50/80 px-4 py-4 text-sm sm:px-5">
                            <Row label="Subtotal" value={money(sale.subtotal_cents)} />
                            {sale.vat_exempt_cents > 0 && <Row label="Less VAT (exempt)" value={`-${money(sale.vat_exempt_cents)}`} />}
                            {sale.discount_type && sale.discount_cents > 0 && (
                                <Row label={`${DISCOUNT_LABELS[sale.discount_type]} discount`} value={`-${money(sale.discount_cents)}`} />
                            )}
                            {sale.service_charge_cents > 0 && <Row label="Service charge" value={money(sale.service_charge_cents)} />}
                            {sale.tax_cents > 0 && (
                                <Row label={`VAT${merchant?.prices_include_tax ? ' (included)' : ''}`} value={money(sale.tax_cents)} />
                            )}
                            <div className="flex justify-between gap-4 border-t border-gray-200 pt-2.5 text-base font-semibold text-gray-950">
                                <dt>Total</dt>
                                <dd className="tabular-nums">{money(sale.total_cents)}</dd>
                            </div>
                        </dl>
                    </Card>

                    <aside className="space-y-4">
                        <Card>
                            <CardHeader title="Payment" />
                            <dl className="card-body space-y-3 text-sm">
                                <Detail label="Method">
                                    <PaymentBadge method={sale.payment_method} />
                                </Detail>
                                {sale.payment_reference && (
                                    <Detail label="Reference">
                                        <span className="break-all font-mono text-xs">{sale.payment_reference}</span>
                                    </Detail>
                                )}
                                <Detail label="Amount paid">
                                    <span className="font-semibold tabular-nums">{money(sale.amount_paid_cents)}</span>
                                </Detail>
                                <Detail label="Change given">
                                    <span className="tabular-nums">{money(sale.change_cents)}</span>
                                </Detail>
                            </dl>
                        </Card>

                        {sale.discount_type && (
                            <Card>
                                <CardHeader title="Discount" actions={<Badge tone="brand">{DISCOUNT_LABELS[sale.discount_type]}</Badge>} />
                                <dl className="card-body space-y-3 text-sm">
                                    <Detail label="Customer">{sale.discount_customer_name}</Detail>
                                    <Detail label="ID number">
                                        <span className="break-all font-mono text-xs">{sale.discount_id_number}</span>
                                    </Detail>
                                    {sale.discount_type === 'pwd' && (
                                        <Detail label="DOH registry">
                                            {sale.discount_doh_check === 'found' ? (
                                                <Badge tone="green">Found</Badge>
                                            ) : sale.discount_doh_check === 'not_found' ? (
                                                <Badge tone="amber">Not found</Badge>
                                            ) : (
                                                <Badge>Not checked</Badge>
                                            )}
                                        </Detail>
                                    )}
                                </dl>
                            </Card>
                        )}

                        <Card>
                            <CardHeader title="Details" />
                            <dl className="card-body space-y-3 text-sm">
                                <Detail label="Sale ref.">
                                    <span className="font-mono font-medium">{sale.reference}</span>
                                </Detail>
                                <Detail label="Cashier">{sale.cashier ?? 'Former staff'}</Detail>
                                {sale.branch && <Detail label="Branch">{sale.branch}</Detail>}
                                <Detail label="Sold at">{formatDateTime(sale.sold_at)}</Detail>
                                <Detail label="Uploaded at">{formatDateTime(sale.synced_at)}</Detail>
                            </dl>
                        </Card>
                    </aside>
                </div>
            </div>
            {printer}
        </AuthenticatedLayout>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4 text-gray-600">
            <dt>{label}</dt>
            <dd className="tabular-nums">{value}</dd>
        </div>
    );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <dt className="shrink-0 text-gray-500">{label}</dt>
            <dd className="min-w-0 text-right text-gray-950">{children}</dd>
        </div>
    );
}
