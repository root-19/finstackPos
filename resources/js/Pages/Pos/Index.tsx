import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PrimaryButton from '@/Components/PrimaryButton';
import { ReceiptData, useReceiptPrinter } from '@/Components/Receipt';
import SecondaryButton from '@/Components/SecondaryButton';
import { ProductGridSkeleton } from '@/Components/Skeleton';
import OrdersBoard from '@/Components/TableOrders/OrdersBoard';
import { Badge, DialogLayout } from '@/Components/ui';
import usePosSync from '@/hooks/usePosSync';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { displaySupported, DisplayState, terminalId, useDisplayPublisher } from '@/lib/customerDisplay';
import { db, LocalProduct, LocalSale, LocalSaleItem } from '@/lib/db';
import { DISCOUNT_LABELS, PAYMENT_LABELS } from '@/lib/format';
import { afterSale, canMake, inventoryAt, shortItems } from '@/lib/inventory';
import { computeTotals, formatMoney, formatPercent } from '@/lib/money';
import { formatPriceRange } from '@/lib/options';
import { newOrders, useTableOrders } from '@/lib/tableOrders';
import { useDeviceBranch } from '@/lib/branch';
import { uuid } from '@/lib/uuid';
import { MerchantSettings, PageProps } from '@/types';
import { ProductSize, SelectedOption } from '@/types/catalog';
import { Head } from '@inertiajs/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import CartPanel from './Partials/CartPanel';
import CheckoutModal, { PaymentResult } from './Partials/CheckoutModal';
import DiscountModal, { AppliedDiscount } from './Partials/DiscountModal';
import SizePickerModal from './Partials/SizePickerModal';
import RejectedSalesModal from './Partials/RejectedSalesModal';

export default function PosIndex({ auth, merchant: pageMerchant }: PageProps<{ merchant: MerchantSettings }>) {
    const merchantId = pageMerchant.id;
    const sync = usePosSync(merchantId);
    // Settings from the latest sync win over the (possibly cached) page props;
    // the merge keeps newer page fields an older stored copy doesn't have.
    const merchant: MerchantSettings = { ...pageMerchant, ...sync.merchant };
    const { printReceipt, printer } = useReceiptPrinter(merchant);
    // Where this register sells (every sale records it).
    const deviceBranch = useDeviceBranch(merchant, auth.user);

    const [search, setSearch] = useState('');
    const [categoryId, setCategoryId] = useState<number | null>(null);
    const [cart, setCart] = useState<LocalSaleItem[]>([]);
    const [checkingOut, setCheckingOut] = useState(false);
    const [completedSale, setCompletedSale] = useState<LocalSale | null>(null);
    const [showRejected, setShowRejected] = useState(false);
    const [picking, setPicking] = useState<LocalProduct | null>(null);
    const [discount, setDiscount] = useState<AppliedDiscount | null>(null);
    const [editingDiscount, setEditingDiscount] = useState(false);
    const [stockNotice, setStockNotice] = useState<{ text: string; blocked: boolean } | null>(null);
    // Phones and tablets show the cart in a sheet.
    const [cartOpen, setCartOpen] = useState(false);
    const [showDisplayHelp, setShowDisplayHelp] = useState(false);
    // How the customer is paying, for the customer display.
    const [paymentStage, setPaymentStage] = useState<{ label: string; qrImage: string | null; preparingQr: boolean } | null>(null);
    const [ordersOpen, setOrdersOpen] = useState(false);

    // Orders from the tables' QR codes at this register's branch. Polling also
    // keeps the menus taking orders; accepting one prints its receipt here.
    const tableOrders = useTableOrders(Boolean(merchant.table_ordering), sync.online, deviceBranch.branchId);
    const waiting = newOrders(tableOrders.feed);
    const orderAlerts = waiting.length;

    // Ingredient stock at this register's branch, from the last sync (see lib/inventory).
    const inventory = useMemo(() => inventoryAt(sync.inventory, deviceBranch.branchId), [sync.inventory, deviceBranch.branchId]);
    const blocksSales = merchant.inventory_blocks_sales ?? false;

    useEffect(() => {
        if (!stockNotice) {
            return;
        }
        const timer = window.setTimeout(() => setStockNotice(null), 5000);

        return () => window.clearTimeout(timer);
    }, [stockNotice]);

    const categories = useLiveQuery(() => db.categories.where({ merchant_id: merchantId }).sortBy('name'), [merchantId], []);

    // No default value: undefined means IndexedDB hasn't answered yet.
    const storedProducts = useLiveQuery(
        () =>
            db.products
                .where({ merchant_id: merchantId })
                .filter((p) => p.is_active)
                .sortBy('name'),
        [merchantId],
    );
    // Only what this branch sells, with this branch's own stock.
    const products = useMemo(() => {
        const branchId = deviceBranch.branchId;

        return (storedProducts ?? [])
            .filter((p) => !p.branch_ids || branchId === null || p.branch_ids.includes(branchId))
            .map((p) => (p.stock !== null && p.branch_stock && branchId !== null ? { ...p, stock: p.branch_stock[branchId] ?? 0 } : p));
    }, [storedProducts, deviceBranch.branchId]);
    // Skeleton while reading the device, or while the very first download runs.
    const catalogLoading = storedProducts === undefined || (products.length === 0 && !sync.lastSyncedAt && sync.online && sync.lastResult === null);

    const visibleProducts = useMemo(() => {
        const term = search.trim().toLowerCase();

        return products.filter(
            (p) =>
                (categoryId === null || p.category_id === categoryId) &&
                (term === '' || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || p.barcode?.includes(term)),
        );
    }, [products, search, categoryId]);

    const subtotal = cart.reduce((sum, line) => sum + line.unit_price_cents * line.quantity, 0);
    const totals = computeTotals(subtotal, merchant, discount?.type ?? null);
    const total = totals.total;

    // Products pulled before sizes existed have none.
    const sizesFor = (product: LocalProduct) => product.sizes ?? [];

    /** Units of a product already in the cart, across all its size lines. */
    const quantityInCart = (lines: LocalSaleItem[], productId: number) =>
        lines.filter((l) => l.product_id === productId).reduce((sum, l) => sum + l.quantity, 0);

    /** A chosen size's own price is the price; otherwise the product price. */
    const addToCart = (product: LocalProduct, size: ProductSize | null) => {
        const lineId = size ? `${product.id}|${size.id}` : String(product.id);
        const options: SelectedOption[] = size ? [{ group: 'Size', value: size.name, price_cents: size.price_cents }] : [];

        // Not enough ingredients for one more: stop, or warn and sell anyway.
        const left = canMake(inventory, cart, product.id, size?.id ?? null);
        if (left !== null && left < 1) {
            const label = `${product.name}${size ? ` (${size.name})` : ''}`;
            const short = shortItems(inventory, cart, product.id, size?.id ?? null).join(', ');
            setStockNotice({
                text: blocksSales ? `${label} can't be sold: not enough ${short}.` : `Low on ${short} for ${label}. Added anyway; check your stock.`,
                blocked: blocksSales,
            });
            if (blocksSales) {
                return;
            }
        }

        setCart((lines) => {
            if (product.stock !== null && quantityInCart(lines, product.id) >= product.stock) {
                return lines;
            }

            const existing = lines.find((l) => l.line_id === lineId);

            if (existing) {
                return lines.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
            }

            return [
                ...lines,
                {
                    line_id: lineId,
                    product_id: product.id,
                    name: product.name,
                    options,
                    unit_price_cents: size ? size.price_cents : product.price_cents,
                    quantity: 1,
                },
            ];
        });
    };

    /** Products with sizes ask which one first. */
    const selectProduct = (product: LocalProduct) => {
        if (sizesFor(product).length > 0) {
            setPicking(product);
        } else {
            addToCart(product, null);
        }
    };

    const setQuantity = (lineId: string, quantity: number) => {
        setCart((lines) => {
            const line = lines.find((l) => l.line_id === lineId);

            if (!line) {
                return lines;
            }

            if (quantity <= 0) {
                return lines.filter((l) => l !== line);
            }

            const stock = products.find((p) => p.id === line.product_id)?.stock ?? null;
            const otherLines = quantityInCart(lines, line.product_id) - line.quantity;
            let allowed = stock === null ? quantity : Math.min(quantity, stock - otherLines);

            if (blocksSales && quantity > line.quantity) {
                const [, size] = line.line_id.split('|');
                const more = canMake(inventory, lines, line.product_id, size ? Number(size) : null);
                if (more !== null) {
                    allowed = Math.min(allowed, line.quantity + more);
                }
            }

            return lines.map((l) => (l === line ? { ...l, quantity: Math.max(allowed, 1) } : l));
        });
    };

    // Barcode scanners type the code and press Enter.
    const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') {
            return;
        }

        const code = search.trim();
        const match = products.find((p) => p.barcode === code || p.sku === code);

        if (match) {
            selectProduct(match);
            setSearch('');
        }
    };

    const completeSale = async ({ method, amountPaid, reference }: PaymentResult) => {
        const sale: LocalSale = {
            client_uuid: uuid(),
            merchant_id: merchantId,
            user_id: auth.user.id,
            items: cart,
            payment_method: method,
            payment_reference: reference,
            subtotal_cents: subtotal,
            discount_type: discount?.type ?? null,
            discount_id_number: discount?.idNumber ?? null,
            discount_customer_name: discount?.customerName ?? null,
            discount_doh_check: discount?.type === 'pwd' ? discount.dohCheck : null,
            vat_exempt_cents: totals.vatExempt,
            discount_cents: totals.discount,
            service_charge_cents: totals.serviceCharge,
            tax_cents: totals.tax,
            total_cents: total,
            amount_paid_cents: amountPaid,
            change_cents: amountPaid - total,
            sold_at: new Date().toISOString(),
            branch_id: deviceBranch.branchId,
            sync_status: 'pending',
            sync_error: null,
            synced_at: null,
        };

        // The sale is durable the moment it's in IndexedDB; uploading is
        // best-effort and retried until the server acknowledges it.
        await db.transaction('rw', db.sales, db.products, db.syncState, async () => {
            await db.sales.add(sale);

            const state = await db.syncState.get(merchantId);
            if (state?.inventory) {
                await db.syncState.update(merchantId, { inventory: afterSale(state.inventory, cart, deviceBranch.branchId) });
            }

            const branchKey = deviceBranch.branchId;
            for (const line of cart) {
                await db.products.where({ id: line.product_id }).modify((p) => {
                    if (p.stock !== null) {
                        p.stock -= line.quantity;
                        if (p.branch_stock && branchKey !== null) {
                            p.branch_stock = { ...p.branch_stock, [branchKey]: (p.branch_stock[branchKey] ?? 0) - line.quantity };
                        }
                    }
                });
            }
        });

        setCart([]);
        setDiscount(null);
        setCheckingOut(false);
        setPaymentStage(null);
        setCompletedSale(sale);
        void sync.syncNow();

        if (merchant.auto_print_receipt) {
            printReceipt(toReceipt(sale));
        }
    };

    const money = (cents: number) => formatMoney(cents, merchant.currency);

    const toReceipt = (sale: LocalSale): ReceiptData => ({
        reference: sale.client_uuid.slice(0, 8).toUpperCase(),
        sold_at: sale.sold_at,
        cashier: auth.user.name,
        items: sale.items.map((item) => ({
            name: item.name,
            options: item.options,
            quantity: item.quantity,
            unit_price_cents: item.unit_price_cents,
            line_total_cents: item.unit_price_cents * item.quantity,
        })),
        subtotal_cents: sale.subtotal_cents,
        discount_type: sale.discount_type ?? null,
        discount_id_number: sale.discount_id_number ?? null,
        discount_customer_name: sale.discount_customer_name ?? null,
        vat_exempt_cents: sale.vat_exempt_cents ?? 0,
        discount_cents: sale.discount_cents ?? 0,
        service_charge_cents: sale.service_charge_cents ?? 0,
        tax_cents: sale.tax_cents,
        total_cents: sale.total_cents,
        payment_method: sale.payment_method,
        payment_reference: sale.payment_reference ?? null,
        amount_paid_cents: sale.amount_paid_cents,
        change_cents: sale.change_cents,
    });

    // What the customer display shows (lib/customerDisplay). "paid" is only
    // set once the sale is recorded, i.e. after the payment was confirmed.
    const taxLabel = `VAT ${formatPercent(merchant.tax_rate_bps)}${merchant.prices_include_tax ? ' (included)' : ''}`;
    const displayState: DisplayState = completedSale
        ? {
              phase: 'paid',
              reference: completedSale.client_uuid.slice(0, 8).toUpperCase(),
              total_cents: completedSale.total_cents,
              amount_paid_cents: completedSale.amount_paid_cents,
              change_cents: completedSale.change_cents,
              method:
                  completedSale.payment_method === 'ewallet'
                      ? merchant.manual_qr_label || PAYMENT_LABELS.ewallet
                      : PAYMENT_LABELS[completedSale.payment_method],
          }
        : cart.length === 0
          ? { phase: 'idle' }
          : {
                phase: checkingOut ? 'paying' : 'cart',
                lines: cart.map((line) => ({
                    key: line.line_id,
                    name: line.name,
                    detail: line.options.map((o) => o.value).join(' · ') || null,
                    quantity: line.quantity,
                    unit_price_cents: line.unit_price_cents,
                    line_total_cents: line.unit_price_cents * line.quantity,
                })),
                totals: {
                    subtotal_cents: subtotal,
                    vat_exempt_cents: totals.vatExempt,
                    discount_cents: totals.discount,
                    service_charge_cents: totals.serviceCharge,
                    tax_cents: totals.tax,
                    total_cents: totals.total,
                },
                discountLabel: discount ? `${DISCOUNT_LABELS[discount.type]} discount` : null,
                taxLabel,
                payment: checkingOut && paymentStage ? paymentStage : undefined,
            };
    const display = useDisplayPublisher(merchantId, displayState);

    // Fetch the store's QR picture while online so it is cached for offline QR checkout.
    useEffect(() => {
        if (merchant.manual_qr_image_url) {
            new Image().src = merchant.manual_qr_image_url;
        }
    }, [merchant.manual_qr_image_url]);

    const openCustomerDisplay = () => {
        window.open(route('pos.display', { terminal: terminalId() }), 'finstack-customer-display', 'popup=yes,width=1280,height=800');
        setShowDisplayHelp(true);
    };

    const units = cart.reduce((sum, l) => sum + l.quantity, 0);
    const cartPanel = (
        <CartPanel
            lines={cart}
            merchant={merchant}
            subtotal={subtotal}
            totals={totals}
            discount={discount}
            onQuantityChange={setQuantity}
            onClear={() => {
                setCart([]);
                setDiscount(null);
            }}
            onCharge={() => {
                setCartOpen(false);
                setCheckingOut(true);
            }}
            onEditDiscount={() => setEditingDiscount(true)}
            onRemoveDiscount={() => setDiscount(null)}
        />
    );

    const statusBar = (
        <div className="flex min-w-0 items-center gap-2">
            <h1 className="hidden shrink-0 text-lg font-semibold text-gray-950 sm:block">Point of Sale</h1>
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto sm:ms-2">
                {sync.online ? (
                    <Badge tone="green">Online</Badge>
                ) : (
                    <Badge tone="amber">
                        <Icon name="wifiOff" className="h-3.5 w-3.5" />
                        Offline
                    </Badge>
                )}
                {deviceBranch.locked && deviceBranch.branch && <Badge tone="blue">{deviceBranch.branch.name}</Badge>}
                {!deviceBranch.locked && deviceBranch.branches.length > 1 && (
                    <select
                        value={deviceBranch.branchId ?? ''}
                        onChange={(e) => {
                            deviceBranch.choose(Number(e.target.value));
                        }}
                        aria-label="Branch of this register"
                        title="Sales on this register are recorded for this branch"
                        className="input h-8 w-auto max-w-[11rem] py-0 pe-8 text-sm font-medium"
                    >
                        {deviceBranch.branches.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.name}
                            </option>
                        ))}
                    </select>
                )}
                {sync.pendingCount > 0 && <Badge>{sync.pendingCount} to upload</Badge>}
                {sync.rejectedSales.length > 0 && (
                    <button type="button" onClick={() => setShowRejected(true)} className="badge badge-red hover:bg-red-100">
                        <Icon name="warning" className="h-3.5 w-3.5" />
                        {sync.rejectedSales.length} need review
                    </button>
                )}
            </div>
            <div className="ms-auto flex shrink-0 items-center gap-1.5">
                {merchant.table_ordering && (
                    <button
                        type="button"
                        onClick={() => setOrdersOpen(true)}
                        className={`btn btn-sm ${orderAlerts > 0 ? 'btn-primary' : 'btn-secondary'}`}
                        title="Orders and calls from the table QR codes"
                    >
                        <Icon name="tableOrders" />
                        <span className="hidden md:inline">Table orders</span>
                        {orderAlerts > 0 && (
                            <span className="flex h-5 min-w-5 animate-pulse items-center justify-center rounded-full bg-white px-1 text-xs font-bold text-brand-700">
                                {orderAlerts}
                            </span>
                        )}
                    </button>
                )}
                {displaySupported() && (
                    <button
                        type="button"
                        onClick={openCustomerDisplay}
                        className="btn btn-secondary btn-sm"
                        title={display.connected ? 'Customer display connected' : 'Open the customer display'}
                    >
                        <Icon name="monitor" />
                        <span className="hidden md:inline">Customer display</span>
                        {display.connected && <span className="h-2 w-2 rounded-full bg-emerald-500" aria-label="connected" />}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => void sync.syncNow()}
                    disabled={sync.syncing || !sync.online}
                    className="btn btn-ghost btn-sm"
                    aria-label="Sync now"
                >
                    <Icon name="refresh" className={`h-4 w-4 ${sync.syncing ? 'animate-spin' : ''}`} />
                    <span className="hidden md:inline">{sync.syncing ? 'Syncing…' : 'Sync'}</span>
                </button>
            </div>
        </div>
    );

    return (
        <AuthenticatedLayout header={statusBar} fullHeight>
            <Head title="Point of Sale" />

            <div className="flex h-full flex-col">
                {sync.lastResult?.ok === false && sync.lastResult.reason !== 'offline' && (
                    <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
                        {sync.lastResult.message}{' '}
                        {sync.lastResult.reason === 'unauthenticated' && (
                            <a href={route('login')} className="font-semibold underline">
                                Log in
                            </a>
                        )}
                    </div>
                )}

                {orderAlerts > 0 && !ordersOpen && (
                    <button
                        type="button"
                        onClick={() => setOrdersOpen(true)}
                        className="flex w-full items-center gap-3 border-b border-brand-700 bg-brand-600 px-4 py-2.5 text-left text-sm font-semibold text-white hover:bg-brand-700"
                    >
                        <span className="flex h-7 w-7 shrink-0 animate-pulse items-center justify-center rounded-full bg-white/20">
                            <Icon name="bell" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                            {orderAlerts === 1 ? `New order from ${waiting[0].table_name}` : `${orderAlerts} new orders from the tables`}
                            <span className="ms-2 font-normal text-white/80">Accept to record the sale and print the receipt</span>
                        </span>
                        <span className="shrink-0 rounded-md bg-white px-2.5 py-1 text-xs font-bold text-brand-700">Open</span>
                    </button>
                )}

                {stockNotice && (
                    <div
                        role="status"
                        className={`flex items-center gap-2 border-b px-4 py-2 text-sm font-medium ${
                            stockNotice.blocked ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'
                        }`}
                    >
                        <Icon name="warning" />
                        {stockNotice.text}
                    </div>
                )}

                <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
                    <section className="flex min-h-0 flex-col">
                        <div className="shrink-0 space-y-2.5 border-b border-gray-200 bg-white px-3 py-3 sm:px-4">
                            <div className="relative">
                                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={onSearchKeyDown}
                                    placeholder="Search products or scan a barcode"
                                    aria-label="Search products or scan a barcode"
                                    autoFocus
                                    className="input h-11 pl-9 text-base sm:text-sm"
                                />
                            </div>
                            <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 sm:-mx-4 sm:px-4" role="group" aria-label="Categories">
                                <CategoryChip active={categoryId === null} onClick={() => setCategoryId(null)}>
                                    All
                                </CategoryChip>
                                {categories.map((c) => (
                                    <CategoryChip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                                        {c.name}
                                    </CategoryChip>
                                ))}
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 sm:p-4 sm:pb-24 lg:pb-4">
                            <div className="grid auto-rows-min grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                                {catalogLoading && <ProductGridSkeleton />}

                                {visibleProducts.map((p) => {
                                    const hasSizes = sizesFor(p).length > 0;
                                    // How many the ingredients can still make (null: no recipe).
                                    const makeable = hasSizes
                                        ? sizesFor(p).map((s) => canMake(inventory, cart, p.id, s.id))
                                        : [canMake(inventory, cart, p.id, null)];
                                    const tracked = makeable.every((n) => n !== null);
                                    const ingredientsOut = tracked && makeable.every((n) => (n ?? 0) <= 0);
                                    const fewest = tracked && !hasSizes ? makeable[0] : null;
                                    const stockOut = p.stock !== null && p.stock <= 0;
                                    const soldOut = stockOut || (blocksSales && ingredientsOut);
                                    const inCart = quantityInCart(cart, p.id);

                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            disabled={soldOut}
                                            onClick={() => selectProduct(p)}
                                            className={`group relative flex flex-col overflow-hidden rounded-lg border bg-white text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed ${
                                                inCart ? 'border-brand-400 ring-1 ring-brand-200' : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                        >
                                            <span className="relative block aspect-[4/3] w-full bg-gray-100">
                                                {p.image_url ? (
                                                    <img
                                                        src={p.image_url}
                                                        alt=""
                                                        loading="lazy"
                                                        className={`h-full w-full object-cover ${soldOut ? 'opacity-40 grayscale' : ''}`}
                                                    />
                                                ) : (
                                                    <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-gray-300">
                                                        {p.name[0]}
                                                    </span>
                                                )}
                                                {hasSizes && (
                                                    <span className="absolute left-1.5 top-1.5 rounded bg-white/95 px-1.5 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                                                        {sizesFor(p).length} sizes
                                                    </span>
                                                )}
                                                {inCart > 0 && (
                                                    <span className="absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">
                                                        {inCart}
                                                    </span>
                                                )}
                                                {soldOut && (
                                                    <span className="absolute inset-x-0 bottom-0 bg-gray-900/80 py-1 text-center text-xs font-semibold text-white">
                                                        {stockOut ? 'Out of stock' : 'Out of ingredients'}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="flex flex-1 flex-col p-2.5">
                                                <span className="line-clamp-2 text-sm font-medium leading-snug text-gray-950">{p.name}</span>
                                                <span className="mt-auto pt-1.5 text-base font-semibold tabular-nums text-gray-950">
                                                    {hasSizes
                                                        ? formatPriceRange(p.price_cents, sizesFor(p), merchant.currency)
                                                        : money(p.price_cents)}
                                                </span>
                                                {!soldOut && p.stock !== null && <span className="text-xs text-gray-500">{p.stock} in stock</span>}
                                                {!soldOut && ingredientsOut && (
                                                    <span className="text-xs font-medium text-red-600">Out of ingredients</span>
                                                )}
                                                {!soldOut && !ingredientsOut && fewest !== null && fewest <= 10 && (
                                                    <span className="text-xs font-medium text-amber-700">Ingredients for {fewest} left</span>
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}

                                {!catalogLoading && visibleProducts.length === 0 && (
                                    <div className="col-span-full flex flex-col items-center py-16 text-center">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-gray-400 ring-1 ring-gray-200">
                                            <Icon name={products.length === 0 && !sync.lastSyncedAt ? 'wifiOff' : 'search'} className="h-5 w-5" />
                                        </span>
                                        <p className="mt-3 text-sm font-medium text-gray-950">
                                            {products.length === 0
                                                ? sync.lastSyncedAt
                                                    ? 'No products yet'
                                                    : 'Products not downloaded yet'
                                                : 'No products match your search'}
                                        </p>
                                        <p className="mt-0.5 text-sm text-gray-500">
                                            {products.length === 0
                                                ? sync.lastSyncedAt
                                                    ? 'Add products in the back office, then sync.'
                                                    : 'Connect to the internet once to download your products.'
                                                : 'Try another name, SKU, or barcode.'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Desktop: the cart sits beside the products. */}
                    <aside className="hidden min-h-0 border-l border-gray-200 lg:block">{cartPanel}</aside>
                </div>

                {/* Phones and tablets: a bar at the bottom opens the cart. */}
                <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white px-3 py-2.5 shadow-[0_-4px_12px_rgb(16_24_40/0.06)] lg:hidden">
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setCartOpen(true)} className="btn btn-secondary h-12 flex-1 justify-between">
                            <span className="inline-flex items-center gap-2">
                                <Icon name="pos" />
                                {units ? `${units} item(s)` : 'Cart is empty'}
                            </span>
                            <span className="tabular-nums">{money(totals.total)}</span>
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary h-12 px-5 text-base"
                            disabled={cart.length === 0}
                            onClick={() => setCheckingOut(true)}
                        >
                            Charge
                        </button>
                    </div>
                </div>
            </div>

            <Modal show={cartOpen} onClose={() => setCartOpen(false)} maxWidth="lg">
                <div className="flex h-[85vh] flex-col">
                    <div className="flex justify-end border-b border-gray-100 px-2 py-1.5">
                        <button type="button" onClick={() => setCartOpen(false)} className="btn btn-ghost btn-sm" aria-label="Close cart">
                            <Icon name="x" />
                            Close
                        </button>
                    </div>
                    <div className="min-h-0 flex-1">{cartPanel}</div>
                </div>
            </Modal>

            <Modal show={ordersOpen} onClose={() => setOrdersOpen(false)} maxWidth="5xl">
                <div className="flex max-h-[90vh] flex-col">
                    <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                        <div>
                            <h2 className="text-base font-semibold text-gray-950">
                                Table orders{deviceBranch.branches.length > 1 && deviceBranch.branch ? ` · ${deviceBranch.branch.name}` : ''}
                            </h2>
                            <p className="text-sm text-gray-500">
                                Accepting an order records its sale and prints the receipt here. Staff can also use Table Orders on their phone.
                            </p>
                        </div>
                        <button type="button" onClick={() => setOrdersOpen(false)} className="btn btn-ghost btn-sm" aria-label="Close table orders">
                            <Icon name="x" />
                            Close
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto bg-surface p-4 sm:p-5">
                        <OrdersBoard orders={tableOrders} settings={merchant} online={sync.online} autoPrint onPrint={printReceipt} />
                    </div>
                </div>
            </Modal>

            <SizePickerModal
                product={picking}
                sizes={picking ? sizesFor(picking) : []}
                currency={merchant.currency}
                available={picking ? Object.fromEntries(sizesFor(picking).map((s) => [s.id, canMake(inventory, cart, picking.id, s.id)])) : {}}
                blocksSales={blocksSales}
                onClose={() => setPicking(null)}
                onPick={(product, size) => {
                    addToCart(product, size);
                    setPicking(null);
                }}
            />

            <DiscountModal
                show={editingDiscount}
                merchant={merchant}
                current={discount}
                online={sync.online}
                onClose={() => setEditingDiscount(false)}
                onApply={(applied) => {
                    setDiscount(applied);
                    setEditingDiscount(false);
                }}
            />

            <CheckoutModal
                show={checkingOut}
                total={total}
                merchant={merchant}
                online={sync.online}
                onClose={() => {
                    setCheckingOut(false);
                    setPaymentStage(null);
                }}
                onConfirm={completeSale}
                onPaymentStage={({ method, label, qrImage }) => setPaymentStage({ label, qrImage, preparingQr: method === 'qrph' && !qrImage })}
            />

            <Modal show={completedSale !== null} onClose={() => setCompletedSale(null)} maxWidth="sm">
                {completedSale && (
                    <div className="p-6 text-center">
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                            <Icon name="check" className="h-6 w-6" />
                        </span>
                        <p className="mt-3 text-sm font-medium text-gray-950">Sale complete</p>
                        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-500">Change due</p>
                        <p className="text-4xl font-bold tabular-nums tracking-tight text-gray-950">{money(completedSale.change_cents)}</p>
                        <p className="mt-2 text-xs text-gray-500">
                            Receipt #{completedSale.client_uuid.slice(0, 8).toUpperCase()}
                            {!sync.online && ' · saved offline, uploads when online'}
                        </p>
                        <div className="mt-6 grid grid-cols-2 gap-2">
                            <SecondaryButton className="btn-lg" onClick={() => printReceipt(toReceipt(completedSale))}>
                                <Icon name="printer" />
                                Print
                            </SecondaryButton>
                            <PrimaryButton className="btn-lg" onClick={() => setCompletedSale(null)}>
                                New sale
                            </PrimaryButton>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal show={showDisplayHelp} onClose={() => setShowDisplayHelp(false)} maxWidth="md">
                <DialogLayout
                    title="Customer display"
                    description="A second screen facing the customer shows the order, totals, the QR code to pay, and a thank-you."
                    footer={
                        <>
                            <SecondaryButton onClick={openCustomerDisplay}>Open again</SecondaryButton>
                            <PrimaryButton onClick={() => setShowDisplayHelp(false)}>Done</PrimaryButton>
                        </>
                    }
                >
                    <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700">
                        <li>A new window opened. If nothing appeared, allow pop-ups for this site and choose Open again.</li>
                        <li>Drag that window onto the customer-facing monitor.</li>
                        <li>Click Full screen on it (or press F11).</li>
                        <li>
                            Keep this register open in the same browser on this computer. The dot on the Customer display button turns green when the
                            screen is linked.
                        </li>
                    </ol>
                    <p className="mt-4 rounded-lg bg-surface px-3 py-2 text-xs text-gray-600">
                        The display works between windows of this computer, even offline. A separate tablet or device can’t be linked yet.
                    </p>
                    <p className="mt-3 text-sm">
                        Status: {display.connected ? <Badge tone="green">Display connected</Badge> : <Badge>Waiting for the display</Badge>}
                    </p>
                </DialogLayout>
            </Modal>

            {printer}

            <RejectedSalesModal
                show={showRejected}
                sales={sync.rejectedSales}
                currency={merchant.currency}
                onClose={() => setShowRejected(false)}
                onRetry={() => void sync.syncNow()}
            />
        </AuthenticatedLayout>
    );
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`h-9 shrink-0 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors ${
                active ? 'bg-gray-950 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            }`}
        >
            {children}
        </button>
    );
}
