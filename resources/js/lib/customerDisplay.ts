import { useEffect, useRef, useState } from 'react';

/*
 * Register ↔ customer display sync for a dual-monitor POS on ONE computer.
 *
 * The register and the display are two windows of the same browser, so they
 * talk over a BroadcastChannel: no server round trip, works offline, and
 * nothing leaves the device. The channel is keyed by store and by a terminal
 * id kept in this browser, so a display only ever hears its own register.
 *
 * Separate devices (e.g. a tablet facing the customer) would need a server
 * push channel, which this app doesn't have; the display then just shows its
 * welcome screen.
 */

export type DisplayLine = {
    key: string;
    name: string;
    /** e.g. the size. */
    detail: string | null;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
};

export type DisplayTotals = {
    subtotal_cents: number;
    vat_exempt_cents: number;
    discount_cents: number;
    service_charge_cents: number;
    tax_cents: number;
    total_cents: number;
};

export type DisplayState =
    | { phase: 'idle' }
    | {
          phase: 'cart' | 'paying';
          lines: DisplayLine[];
          totals: DisplayTotals;
          discountLabel: string | null;
          taxLabel: string | null;
          /** While paying: how, the QR code to scan if any, and whether a QR Ph code is still being made. */
          payment?: { label: string; qrImage: string | null; preparingQr?: boolean };
      }
    /** Only sent after the sale is recorded (and, for QR Ph, the gateway confirmed it). */
    | { phase: 'paid'; reference: string; total_cents: number; amount_paid_cents: number; change_cents: number; method: string };

type Message = { kind: 'state'; terminal: string; state: DisplayState } | { kind: 'hello'; terminal: string } | { kind: 'present'; terminal: string };

const HEARTBEAT_MS = 3000;
const STALE_MS = 9000;

/** This browser's register id, so two registers on one network never mix. */
export function terminalId(): string {
    const key = 'finstack-pos-terminal';
    try {
        let id = window.localStorage.getItem(key);
        if (!id) {
            id = Math.random().toString(36).slice(2, 10);
            window.localStorage.setItem(key, id);
        }

        return id;
    } catch {
        return 'default';
    }
}

function channelFor(storeId: number, terminal: string): BroadcastChannel | null {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`finstack-pos-display:${storeId}:${terminal}`);
}

export const displaySupported = () => typeof BroadcastChannel !== 'undefined';

/**
 * Register side: sends the current state whenever it changes (and as a
 * heartbeat), answers a display that just opened, and reports whether a
 * display is listening.
 */
export function useDisplayPublisher(storeId: number, state: DisplayState): { connected: boolean } {
    const terminal = useRef(terminalId()).current;
    const channel = useRef<BroadcastChannel | null>(null);
    const latest = useRef(state);
    const lastSeen = useRef(0);
    const [connected, setConnected] = useState(false);
    latest.current = state;

    useEffect(() => {
        const ch = channelFor(storeId, terminal);
        channel.current = ch;
        if (!ch) {
            return;
        }

        const send = () => ch.postMessage({ kind: 'state', terminal, state: latest.current } satisfies Message);
        ch.onmessage = (event: MessageEvent<Message>) => {
            if (event.data?.terminal !== terminal) {
                return;
            }
            if (event.data.kind === 'hello' || event.data.kind === 'present') {
                lastSeen.current = Date.now();
                setConnected(true);
            }
            if (event.data.kind === 'hello') {
                send();
            }
        };

        const timer = window.setInterval(() => {
            send();
            setConnected(Date.now() - lastSeen.current < STALE_MS);
        }, HEARTBEAT_MS);

        return () => {
            window.clearInterval(timer);
            ch.close();
            channel.current = null;
        };
    }, [storeId, terminal]);

    const serialized = JSON.stringify(state);
    useEffect(() => {
        channel.current?.postMessage({ kind: 'state', terminal, state: latest.current } satisfies Message);
    }, [serialized, terminal]);

    return { connected };
}

/**
 * Display side: the register's latest state, and whether the register is
 * still there (a closed or crashed register leaves a stale screen otherwise).
 */
export function useDisplaySubscriber(storeId: number, terminal: string): { state: DisplayState; connected: boolean } {
    const [state, setState] = useState<DisplayState>({ phase: 'idle' });
    const [connected, setConnected] = useState(false);
    const lastHeard = useRef(0);

    useEffect(() => {
        const ch = channelFor(storeId, terminal);
        if (!ch) {
            return;
        }

        ch.onmessage = (event: MessageEvent<Message>) => {
            if (event.data?.terminal !== terminal || event.data.kind !== 'state') {
                return;
            }
            lastHeard.current = Date.now();
            setConnected(true);
            setState(event.data.state);
        };
        ch.postMessage({ kind: 'hello', terminal } satisfies Message);

        const timer = window.setInterval(() => {
            ch.postMessage({ kind: 'present', terminal } satisfies Message);
            if (Date.now() - lastHeard.current > STALE_MS) {
                setConnected(false);
                // Never leave a stale order or "paid" screen up.
                setState({ phase: 'idle' });
            }
        }, HEARTBEAT_MS);

        return () => {
            window.clearInterval(timer);
            ch.close();
        };
    }, [storeId, terminal]);

    return { state, connected };
}
