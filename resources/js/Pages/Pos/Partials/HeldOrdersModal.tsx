import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { Badge, ConfirmDialog, EmptyState } from '@/Components/ui';
import { HeldOrder } from '@/lib/db';
import { DISCOUNT_LABELS } from '@/lib/format';
import { heldAge, heldBeforeToday, heldTotal, heldUnits } from '@/lib/heldOrders';
import { formatMoney } from '@/lib/money';
import { MerchantSettings } from '@/types';
import { useEffect, useState } from 'react';
import HoldOrderModal from './HoldOrderModal';

/** The register's held orders: resume one into the cart, rename it, or discard it. */
export default function HeldOrdersModal({
    show,
    orders,
    merchant,
    branchName,
    catalogReady,
    onClose,
    onResume,
    onRename,
    onDiscard,
}: {
    show: boolean;
    orders: HeldOrder[];
    merchant: MerchantSettings;
    /** Shown when the store has several branches. */
    branchName: string | null;
    /** The catalog has been read from the device (resuming re-prices from it). */
    catalogReady: boolean;
    onClose: () => void;
    onResume: (order: HeldOrder) => void;
    onRename: (id: string, label: string) => Promise<void>;
    onDiscard: (id: string) => Promise<void>;
}) {
    const money = (cents: number) => formatMoney(cents, merchant.currency);
    const [renaming, setRenaming] = useState<HeldOrder | null>(null);
    const [discarding, setDiscarding] = useState<HeldOrder | null>(null);
    // Re-render every minute so "12 min" stays true while the list is open.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        if (!show) {
            return;
        }
        setNow(new Date());
        const timer = window.setInterval(() => setNow(new Date()), 60_000);

        return () => window.clearInterval(timer);
    }, [show]);

    return (
        <>
            <Modal show={show} onClose={onClose} maxWidth="lg">
                <div className="flex max-h-[90vh] flex-col">
                    <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
                        <div>
                            <h2 className="text-base font-semibold text-gray-950">Held orders{branchName ? ` · ${branchName}` : ''}</h2>
                            <p className="mt-0.5 text-sm text-gray-500">Saved on this register. Prices are checked again when you resume.</p>
                        </div>
                        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Close held orders">
                            <Icon name="x" />
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {orders.length === 0 ? (
                            <div className="p-6">
                                <EmptyState title="No held orders" icon={<Icon name="pause" className="h-5 w-5" />}>
                                    Use Hold on the current sale to park it and serve the next customer.
                                </EmptyState>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {orders.map((order) => {
                                    const old = heldBeforeToday(order.held_at, now);

                                    return (
                                        <li key={order.id} className="px-5 py-3 sm:px-6">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-gray-950">{order.label}</p>
                                                    <p className="mt-0.5 text-xs text-gray-500">
                                                        {heldUnits(order)} item(s) · held {heldAge(order.held_at, now)}
                                                        {heldAge(order.held_at, now) !== 'just now' && !old ? ' ago' : ''} by {order.user_name}
                                                    </p>
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {old && <Badge tone="amber">From an earlier day</Badge>}
                                                        {order.discount && <Badge tone="green">{DISCOUNT_LABELS[order.discount.type]}</Badge>}
                                                    </div>
                                                </div>
                                                <p className="shrink-0 text-sm font-semibold tabular-nums text-gray-950">{money(heldTotal(order, merchant))}</p>
                                            </div>
                                            <p className="mt-1 line-clamp-1 text-xs text-gray-500">
                                                {order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                                            </p>
                                            <div className="mt-2 flex flex-wrap justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setDiscarding(order)}
                                                    className="btn btn-ghost btn-sm text-gray-500 hover:text-red-600"
                                                >
                                                    <Icon name="trash" />
                                                    Discard
                                                </button>
                                                <SecondaryButton className="btn-sm" onClick={() => setRenaming(order)}>
                                                    <Icon name="pencil" />
                                                    Rename
                                                </SecondaryButton>
                                                <PrimaryButton type="button" className="btn-sm" disabled={!catalogReady} onClick={() => onResume(order)}>
                                                    <Icon name="play" />
                                                    Resume
                                                </PrimaryButton>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <HoldOrderModal
                        show={renaming !== null}
                        title="Rename held order"
                        confirmLabel="Save"
                        initialLabel={renaming?.label ?? ''}
                        onClose={() => setRenaming(null)}
                        onConfirm={async (label) => {
                            if (renaming) {
                                await onRename(renaming.id, label);
                            }
                            setRenaming(null);
                        }}
                    />

                    <ConfirmDialog
                        show={discarding !== null}
                        title={`Discard “${discarding?.label ?? ''}”?`}
                        confirmLabel="Discard order"
                        onClose={() => setDiscarding(null)}
                        onConfirm={async () => {
                            if (discarding) {
                                await onDiscard(discarding.id);
                            }
                            setDiscarding(null);
                        }}
                    >
                        The items in this held order are removed from this register. Nothing was charged, so there is nothing to refund.
                    </ConfirmDialog>
                </div>
            </Modal>
        </>
    );
}
