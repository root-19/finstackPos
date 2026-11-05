import { Icon } from '@/Components/NavIcons';
import TextInput from '@/Components/TextInput';
import { ProductSize } from '@/types/catalog';

export interface SizeForm {
    id: number | null;
    name: string;
    /** The size's own full price, as typed. */
    price: string;
}

export function toSizeForms(sizes: ProductSize[]): SizeForm[] {
    return sizes.map((size) => ({
        id: size.id,
        name: size.name,
        price: (size.price_cents / 100).toFixed(2),
    }));
}

const blankSize = (): SizeForm => ({ id: null, name: '', price: '' });

const ROW = 'grid grid-cols-[minmax(0,1fr)_6.5rem_2.25rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_2.25rem]';

/** A product's sizes, each with its own price (Small ₱100, Large ₱170). */
export default function SizesEditor({
    sizes,
    onChange,
    errors,
    currency,
}: {
    sizes: SizeForm[];
    onChange: (sizes: SizeForm[]) => void;
    /** Nested keys like "sizes.1.price". */
    errors: Record<string, string | undefined>;
    currency: string;
}) {
    const update = (index: number, patch: Partial<SizeForm>) => onChange(sizes.map((s, i) => (i === index ? { ...s, ...patch } : s)));

    return (
        <div>
            <p className="text-sm font-medium text-gray-950">Sizes</p>
            <p className="help mt-0.5">
                Add sizes if this product comes in more than one, each with its own full price. The cashier picks the size at the POS.
            </p>

            {sizes.length > 0 && (
                <div className="mt-3">
                    <div className={`${ROW} text-xs font-medium text-gray-500`}>
                        <span>Size</span>
                        <span>Price ({currency})</span>
                        <span />
                    </div>
                    <div className="mt-1.5 space-y-2">
                        {sizes.map((size, i) => {
                            const error = errors[`sizes.${i}.name`] ?? errors[`sizes.${i}.price`];

                            return (
                                <div key={i}>
                                    <div className={ROW}>
                                        <TextInput
                                            value={size.name}
                                            onChange={(e) => update(i, { name: e.target.value })}
                                            placeholder={['e.g. Small', 'e.g. Medium', 'e.g. Large'][i] ?? 'Size'}
                                            aria-label="Size name"
                                            required
                                        />
                                        <TextInput
                                            value={size.price}
                                            onChange={(e) => update(i, { price: e.target.value })}
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            aria-label={`Price of ${size.name || 'this size'}`}
                                            className="tabular-nums"
                                            required
                                        />
                                        <button
                                            type="button"
                                            aria-label="Remove size"
                                            title="Remove size"
                                            onClick={() => onChange(sizes.filter((_, j) => j !== i))}
                                            className="btn btn-ghost btn-icon text-gray-500 hover:bg-red-50 hover:text-red-600"
                                        >
                                            <Icon name="x" />
                                        </button>
                                    </div>
                                    {error && <p className="field-error">{error}</p>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {errors.sizes && <p className="field-error mt-2">{errors.sizes}</p>}

            <button type="button" onClick={() => onChange([...sizes, blankSize()])} className="btn btn-secondary btn-sm mt-3">
                <Icon name="plus" className="h-3.5 w-3.5" />
                Add size
            </button>
        </div>
    );
}
