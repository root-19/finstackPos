import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PrimaryButton from '@/Components/PrimaryButton';
import { Receipt, ReceiptData, useReceiptPrinter } from '@/Components/Receipt';
import SecondaryButton from '@/Components/SecondaryButton';
import { Alert, Badge, DialogLayout } from '@/Components/ui';
import { formatMoney } from '@/lib/money';
import { since, TableOrder, TableOrderStatus, useTableOrders } from '@/lib/tableOrders';
import { MerchantSettings } from '@/types';
import { ReactNode, useState } from 'react';

type Orders = ReturnType<typeof useTableOrders>;

/**
 * Orders from the tables' QR codes: new ones to accept (each already paid,
 * or paid when accepted), then being made, then ready. Accepting an order,
 * whatever the payment, shows its receipt to print. Shared by the POS
 * (which also prints it right away) and the Table Orders page.
 */
export default function OrdersBoard({
    orders,
    settings,
    online,
    autoPrint = false,
    onPrint,
}: {
    orders: Orders;
    /** The store's receipt settings (name, address, paper, currency…). */
    settings: MerchantSettings;
    online: boolean;
    /** Print as soon as an order is accepted (the POS, next to its printer). */
    autoPrint?: boolean;
    /** Print through the page's own receipt printer (the POS has one). */
    onPrint?: (receipt: ReceiptData) => void;
}) {
    const { feed, error, busy, offset } = orders;
    const money = (cents: number) => formatMoney(cents, settings.currency);
    const manualQrLabel = settings.manual_qr_label;
    // The receipt of the order just accepted.
    const [receipt, setReceipt] = useState<ReceiptData | null>(null);
    const own = useReceiptPrinter(settings);
    const print = (data: ReceiptData) => (onPrint ?? own.printReceipt)(data);

    if (!online) {
        return (
            <Alert tone="amber" title="You're offline">
                Orders from the tables need internet. Customers are asked to order at the counter until a store device is back online.
            </Alert>
        );
    }

    if (!feed) {
        return <p className="py-10 text-center text-sm text-gray-500">{error ?? 'Loading orders…'}</p>;
    }

    if (!feed.active) {
        return (
            <Alert tone="blue" title="Ordering from the table is off">
                It's part of FinstackPOS Pro (and the free trial). The owner can turn it on in Tables &amp; QR; until then the table QR codes show the menu only.
            </Alert>
        );
    }

    const byStatus = (status: TableOrderStatus) => feed.orders.filter((o) => o.status === status);
    const accept = async (order: TableOrder) => {
        const accepted = await orders.setStatus(order, 'preparing');
        if (accepted) {
            setReceipt(accepted);
            if (autoPrint) {
                print(accepted);
            }
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
                {feed.paused ? <Badge tone="amber">Not taking orders</Badge> : <Badge tone="green">Taking orders</Badge>}
                <span className="text-xs text-gray-500">
                    {feed.paused ? 'Customers are asked to order at the counter.' : 'Keep a store page open so orders reach you.'}
                </span>
                <button
                    type="button"
                    onClick={() => void orders.setPaused(!feed.paused)}
                    disabled={busy === 'pause'}
                    className="btn btn-secondary btn-sm ms-auto"
                >
                    <Icon name={feed.paused ? 'play' : 'pause'} />
                    {feed.paused ? 'Resume orders' : 'Pause orders'}
                </button>
            </div>

            {error && <Alert tone="red">{error}</Alert>}

            <div className="grid gap-4 md:grid-cols-3">
                <Column title="New" hint="Accept to record the sale and print the receipt" count={byStatus('new').length} tone="red">
                    {byStatus('new').map((order) => {
                        const waitingForQr = order.payment_method === 'qrph' && !order.paid;

                        return (
                            <OrderCard key={order.id} order={order} money={money} offset={offset} manualQrLabel={manualQrLabel} highlight>
                                {!order.paid && <RejectButton disabled={busy === `order:${order.id}`} onReject={() => void orders.setStatus(order, 'rejected')} />}
                                <button
                                    type="button"
                                    onClick={() => void accept(order)}
                                    disabled={busy === `order:${order.id}` || waitingForQr}
                                    className="btn btn-primary btn-sm flex-1"
                                    title={waitingForQr ? 'Accept it once the customer has paid' : undefined}
                                >
                                    <Icon name={waitingForQr ? 'qrCode' : 'check'} />
                                    {waitingForQr
                                        ? 'Waiting for payment'
                                        : order.payment_method === 'cash'
                                          ? `Accept · cash ${money(order.total_cents)}`
                                          : order.payment_method === 'ewallet'
                                            ? 'Payment received · Accept'
                                            : 'Accept'}
                                </button>
                            </OrderCard>
                        );
                    })}
                </Column>
                <Column title="Preparing" count={byStatus('preparing').length}>
                    {byStatus('preparing').map((order) => (
                        <OrderCard key={order.id} order={order} money={money} offset={offset} manualQrLabel={manualQrLabel}>
                            <button
                                type="button"
                                onClick={() => void orders.setStatus(order, 'ready')}
                                disabled={busy === `order:${order.id}`}
                                className="btn btn-dark btn-sm flex-1"
                            >
                                Ready
                            </button>
                        </OrderCard>
                    ))}
                </Column>
                <Column title="Ready to serve" count={byStatus('ready').length} tone="green">
                    {byStatus('ready').map((order) => (
                        <OrderCard key={order.id} order={order} money={money} offset={offset} manualQrLabel={manualQrLabel}>
                            <button
                                type="button"
                                onClick={() => void orders.setStatus(order, 'served')}
                                disabled={busy === `order:${order.id}`}
                                className="btn btn-secondary btn-sm flex-1"
                            >
                                <Icon name="check" />
                                Served
                            </button>
                        </OrderCard>
                    ))}
                </Column>
            </div>

            <Modal show={receipt !== null} onClose={() => setReceipt(null)} maxWidth="sm">
                {receipt && (
                    <DialogLayout
                        title="Order accepted"
                        description={`Receipt #${receipt.reference} · ${money(receipt.total_cents)}${autoPrint ? ' · sent to the printer' : ''}`}
                        footer={
                            <>
                                <SecondaryButton onClick={() => setReceipt(null)}>Close</SecondaryButton>
                                <PrimaryButton onClick={() => print(receipt)}>
                                    <Icon name="printer" />
                                    {autoPrint ? 'Print again' : 'Print receipt'}
                                </PrimaryButton>
                            </>
                        }
                    >
                        <div className="mx-auto w-fit rounded-lg border border-gray-200 bg-white p-3 shadow-card">
                            <Receipt data={receipt} settings={settings} />
                        </div>
                    </DialogLayout>
                )}
            </Modal>
            {!onPrint && own.printer}
        </div>
    );
}

function Column({ title, hint, count, tone, children }: { title: string; hint?: string; count: number; tone?: 'red' | 'green'; children: ReactNode }) {
    return (
        <section aria-label={title} className="min-w-0">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-950">
                {title}
                <Badge tone={count > 0 && tone ? tone : 'gray'} className="tabular-nums">
                    {count}
                </Badge>
                {hint && count > 0 && <span className="text-xs font-normal text-gray-500">{hint}</span>}
            </h3>
            <div className="space-y-2.5">
                {count === 0 ? <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">None</p> : children}
            </div>
        </section>
    );
}

/** How the order is paid, and whether it is yet. */
function PaymentBadge({ order, money, manualQrLabel }: { order: TableOrder; money: (cents: number) => string; manualQrLabel?: string | null }) {
    if (order.paid) {
        return <Badge tone="green">Paid · {order.payment_method === 'cash' ? 'Cash' : order.payment_method === 'qrph' ? 'QR Ph' : (manualQrLabel ?? 'QR')}</Badge>;
    }
    if (order.payment_method === 'cash') {
        return <Badge tone="amber">Cash · collect {money(order.total_cents)}</Badge>;
    }
    if (order.payment_method === 'qrph') {
        return <Badge>QR Ph · not paid yet</Badge>;
    }

    return order.payment_status === 'awaiting' ? (
        <Badge tone="blue">{manualQrLabel ?? 'QR'} · customer paid{order.payment_reference ? ` · ref ${order.payment_reference}` : ''}, check it</Badge>
    ) : (
        <Badge>{manualQrLabel ?? 'QR'} · not paid yet</Badge>
    );
}

function OrderCard({
    order,
    money,
    offset,
    manualQrLabel,
    highlight = false,
    children,
}: {
    order: TableOrder;
    money: (cents: number) => string;
    offset: number;
    manualQrLabel?: string | null;
    highlight?: boolean;
    children: ReactNode;
}) {
    return (
        <article className={`rounded-lg border bg-white p-3 shadow-card ${highlight ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-200'}`}>
            <header className="flex items-baseline justify-between gap-2">
                <p className="text-base font-bold text-gray-950">{order.table_name}</p>
                <p className="shrink-0 text-xs text-gray-500">{since(order.placed_at, offset)}</p>
            </header>
            <div className="mt-1.5">
                <PaymentBadge order={order} money={money} manualQrLabel={manualQrLabel} />
            </div>
            <ul className="mt-2 space-y-1.5">
                {order.items.map((item, i) => (
                    <li key={i} className="text-sm leading-snug text-gray-800">
                        <span className="font-semibold tabular-nums">{item.quantity}×</span> {item.name}
                        {item.options.length > 0 && <span className="text-gray-500"> ({item.options.map((o) => o.value).join(', ')})</span>}
                        {item.note && <span className="mt-0.5 block rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900">“{item.note}”</span>}
                    </li>
                ))}
            </ul>
            {order.note && <p className="mt-2 rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">Note: {order.note}</p>}
            <p className="mt-2 text-right text-xs text-gray-500">
                Total <span className="font-semibold tabular-nums text-gray-900">{money(order.total_cents)}</span>
            </p>
            <div className="mt-2.5 flex gap-2">{children}</div>
        </article>
    );
}

/** Two taps, so an order is never rejected by accident. */
function RejectButton({ disabled, onReject }: { disabled: boolean; onReject: () => void }) {
    const [confirming, setConfirming] = useState(false);

    return confirming ? (
        <button type="button" onClick={onReject} onBlur={() => setConfirming(false)} disabled={disabled} className="btn btn-danger-solid btn-sm" autoFocus>
            Reject?
        </button>
    ) : (
        <button type="button" onClick={() => setConfirming(true)} disabled={disabled} className="btn btn-ghost btn-sm text-gray-500 hover:text-red-600">
            Reject
        </button>
    );
}
