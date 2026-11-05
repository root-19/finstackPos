import DangerButton from '@/Components/DangerButton';
import Modal from '@/Components/Modal';
import SecondaryButton from '@/Components/SecondaryButton';
import { db, LocalSale } from '@/lib/db';
import { formatMoney } from '@/lib/money';

/** Sales the server refused. They stay on the device until handled here. */
export default function RejectedSalesModal({
    show,
    sales,
    currency,
    onClose,
    onRetry,
}: {
    show: boolean;
    sales: LocalSale[];
    currency: string;
    onClose: () => void;
    onRetry: () => void;
}) {
    const retry = async (sale: LocalSale) => {
        await db.sales.update(sale.client_uuid, {
            sync_status: 'pending',
            sync_error: null,
        });
        onRetry();
    };

    const discard = async (sale: LocalSale) => {
        if (window.confirm('Discard this sale permanently?')) {
            await db.sales.delete(sale.client_uuid);
        }
    };

    return (
        <Modal show={show} onClose={onClose}>
            <div className="flex max-h-[90vh] flex-col">
                <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
                    <h2 className="text-base font-semibold text-gray-950">Sales that could not be uploaded</h2>
                    <p className="mt-0.5 text-sm text-gray-500">The server refused these. Fix the reason and retry, or discard them.</p>
                </div>
                <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto px-5 sm:px-6">
                    {sales.length === 0 && <li className="py-4 text-sm text-gray-500">Nothing to review.</li>}
                    {sales.map((sale) => (
                        <li key={sale.client_uuid} className="flex flex-wrap items-center gap-3 py-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900">
                                    {formatMoney(sale.total_cents, currency)} · {new Date(sale.sold_at).toLocaleString()}
                                </p>
                                <p className="text-xs text-red-600">{sale.sync_error}</p>
                            </div>
                            <SecondaryButton className="btn-sm" onClick={() => void retry(sale)}>
                                Retry
                            </SecondaryButton>
                            <DangerButton className="btn-sm" onClick={() => void discard(sale)}>
                                Discard
                            </DangerButton>
                        </li>
                    ))}
                </ul>
                <div className="flex justify-end border-t border-gray-100 bg-gray-50/60 px-5 py-3 sm:px-6">
                    <SecondaryButton onClick={onClose}>Close</SecondaryButton>
                </div>
            </div>
        </Modal>
    );
}
