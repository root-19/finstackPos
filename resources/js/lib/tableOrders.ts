import type { ReceiptData } from '@/Components/Receipt';
import { SelectedOption } from '@/types/catalog';
import { isAxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * Orders from the tables' QR codes (see TableOrderController). Customers pay
 * for each order at checkout; accepting it records the sale and returns its
 * receipt. The POS, Table Orders, and any back-office page poll the feed;
 * each poll also tells the customers' menus a store device is online.
 */

export type TableOrderStatus = 'new' | 'preparing' | 'ready' | 'served';

/** cash: staff collect it; qrph: PayMongo confirms it; ewallet: the store's own QR. */
export type TablePaymentMethod = 'cash' | 'qrph' | 'ewallet';

/** awaiting: paid by the store's QR, the customer says; staff check it. */
export type TablePaymentStatus = 'unpaid' | 'awaiting' | 'paid';

export interface TableOrderItem {
    product_id: number | null;
    size_id: number | null;
    name: string;
    options: SelectedOption[];
    quantity: number;
    note: string | null;
    unit_price_cents: number;
    line_total_cents: number;
}

export interface TableOrder {
    id: number;
    table_id: number | null;
    table_name: string;
    status: TableOrderStatus;
    note: string | null;
    subtotal_cents: number;
    total_cents: number;
    payment_method: TablePaymentMethod;
    payment_status: TablePaymentStatus;
    payment_reference: string | null;
    placed_at: string;
    paid: boolean;
    items: TableOrderItem[];
}

export interface OrdersFeed {
    active: boolean;
    /** Null when following every branch. */
    branch: { id: number; name: string } | null;
    paused: boolean;
    orders: TableOrder[];
    server_time: string;
}

const POLL_MS = 5_000;

/** Two short tones, so a new order is heard across the counter. */
let audio: AudioContext | null = null;
export function chime(): void {
    try {
        audio ??= new AudioContext();
        if (audio.state === 'suspended') {
            void audio.resume();
        }
        const start = audio.currentTime;
        [880, 1320].forEach((frequency, i) => {
            const at = start + i * 0.18;
            const osc = audio!.createOscillator();
            const gain = audio!.createGain();
            osc.type = 'sine';
            osc.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
            osc.connect(gain).connect(audio!.destination);
            osc.start(at);
            osc.stop(at + 0.4);
        });
    } catch {
        // No audio (or not allowed before a tap): the badge still shows it.
    }
}

const errorMessage = (error: unknown) =>
    isAxiosError(error) ? (error.response?.data?.message ?? 'Couldn’t reach the server.') : 'Something went wrong.';

/** Orders waiting for the staff to accept them. */
export const newOrders = (feed: OrdersFeed | null) => feed?.orders.filter((o) => o.status === 'new') ?? [];

/**
 * Poll the order feed of a branch (or 'all' of them) while `enabled` and
 * online, chiming on new orders and on orders becoming paid.
 */
export function useTableOrders(enabled: boolean, online: boolean, branchId: number | 'all' | null) {
    const [feed, setFeed] = useState<OrdersFeed | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    // Server time minus device time, for "3 min ago".
    const [offset, setOffset] = useState(0);
    const seen = useRef<Set<string> | null>(null);

    const refresh = useCallback(async () => {
        try {
            const { data } = await window.axios.get<OrdersFeed>(route('orders.feed'), { params: { branch: branchId } });
            setOffset(Date.parse(data.server_time) - Date.now());
            setFeed(data);
            setError(null);

            const alerts = newOrders(data).map((o) => `${o.id}:${o.payment_status}`);

            // Nothing chimes for what was already there when the screen opened.
            if (seen.current && alerts.some((key) => !seen.current!.has(key))) {
                chime();
            }
            seen.current = new Set(alerts);
        } catch (e) {
            setError(errorMessage(e));
        }
    }, [branchId]);

    // Another branch: start over, without chiming for what's already there.
    useEffect(() => {
        seen.current = null;
        setFeed(null);
    }, [branchId]);

    useEffect(() => {
        if (!enabled || !online) {
            return;
        }

        void refresh();
        const timer = window.setInterval(() => void refresh(), POLL_MS);

        return () => window.clearInterval(timer);
    }, [enabled, online, refresh]);

    const run = async <T>(key: string, request: () => Promise<T>): Promise<T | null> => {
        setBusy(key);
        try {
            return await request();
        } catch (e) {
            setError(errorMessage(e));

            return null;
        } finally {
            await refresh();
            setBusy(null);
        }
    };

    return {
        feed,
        error,
        busy,
        offset,
        refresh,
        /** Moves the order on; accepting it returns the receipt of its sale. */
        setStatus: async (order: TableOrder, status: TableOrderStatus | 'rejected'): Promise<ReceiptData | null> => {
            const response = await run(`order:${order.id}`, () =>
                window.axios.patch<{ receipt: ReceiptData | null }>(route('orders.update', order.id), { status }),
            );

            return response?.data.receipt ?? null;
        },
        setPaused: (paused: boolean) => run('pause', () => window.axios.post(route('orders.pause', { branch: branchId }), { paused })),
    };
}

/** "Just now", "4 min ago", "1 h 5 min ago". */
export function since(iso: string, offset: number): string {
    const minutes = Math.max(0, Math.floor((Date.now() + offset - Date.parse(iso)) / 60_000));

    if (minutes < 1) {
        return 'Just now';
    }

    return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
}
