import Modal from '@/Components/Modal';
import SecondaryButton from '@/Components/SecondaryButton';
import { LocalProduct } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { ProductSize } from '@/types/catalog';

/**
 * Asks which size to sell. Each size shows its own price, and one tap adds
 * that size at that price.
 */
export default function SizePickerModal({
    product,
    sizes,
    currency,
    available = {},
    blocksSales = false,
    onClose,
    onPick,
}: {
    product: LocalProduct | null;
    sizes: ProductSize[];
    currency: string;
    /** Size id → how many the ingredients can still make (null: not tracked). */
    available?: Record<number, number | null>;
    /** When ingredients run out, the size can't be picked. */
    blocksSales?: boolean;
    onClose: () => void;
    onPick: (product: LocalProduct, size: ProductSize) => void;
}) {
    return (
        <Modal show={product !== null} onClose={onClose} maxWidth="lg">
            {product && (
                <div className="flex max-h-[85vh] flex-col">
                    <div className="flex items-center gap-4 border-b border-gray-100 p-5">
                        {product.image_url ? (
                            <img src={product.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                        ) : (
                            <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-gray-100 text-xl font-bold text-gray-400">
                                {product.name[0]}
                            </span>
                        )}
                        <div className="min-w-0">
                            <h2 className="truncate text-base font-semibold text-gray-950">{product.name}</h2>
                            <p className="text-sm text-gray-500">Choose a size</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 overflow-y-auto p-5 sm:grid-cols-3">
                        {sizes.map((size) => {
                            const left = available[size.id] ?? null;
                            const out = left !== null && left <= 0;

                            return (
                                <button
                                    key={size.id}
                                    type="button"
                                    disabled={out && blocksSales}
                                    onClick={() => onPick(product, size)}
                                    className="flex min-h-[5.5rem] flex-col items-start rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-brand-500 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:bg-white"
                                >
                                    <span className="text-base font-semibold capitalize text-gray-950">{size.name}</span>
                                    <span className="mt-1 text-xl font-bold tabular-nums text-gray-950">
                                        {formatMoney(size.price_cents, currency)}
                                    </span>
                                    {out ? (
                                        <span className="mt-1 text-xs font-semibold text-red-600">Out of ingredients</span>
                                    ) : (
                                        left !== null && left <= 10 && <span className="mt-1 text-xs font-semibold text-amber-700">{left} left</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex justify-end border-t border-gray-100 p-5">
                        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                    </div>
                </div>
            )}
        </Modal>
    );
}
