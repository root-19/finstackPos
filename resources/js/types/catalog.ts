// Merchant-defined sizes, each with its own full price
// (e.g. Iced Coffee: Small ₱65, Large ₱85).

export interface ProductSize {
    id: number;
    name: string;
    price_cents: number;
}

export interface CatalogCategory {
    id: number;
    name: string;
}

/** What a sale line records about the chosen size (a snapshot, by name). */
export interface SelectedOption {
    group: string;
    value: string;
    price_cents: number;
}
