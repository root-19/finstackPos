/*
 * Bridge to the FinstackPOS desktop app (Tauri shell in /desktop).
 *
 * The desktop app loads this same web app in its own window and injects
 * `window.__TAURI__`. Everything here is a no-op in a normal browser, so the
 * web version keeps printing through the browser's print dialog.
 *
 * The printer choice is per computer (each register has its own printer),
 * so it lives in this machine's localStorage, not in the merchant settings.
 */

type TauriGlobal = {
    core: { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };
};

declare global {
    interface Window {
        __TAURI__?: TauriGlobal;
    }
}

export function isDesktop(): boolean {
    return typeof window !== 'undefined' && typeof window.__TAURI__?.core?.invoke === 'function';
}

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!isDesktop()) {
        return Promise.reject(new Error('Only available in the FinstackPOS desktop app.'));
    }

    return window.__TAURI__!.core.invoke<T>(cmd, args);
}

export type DesktopPrinterConfig = {
    /** Windows printer name; null = use the browser print dialog. */
    printer: string | null;
    /** Kick the cash drawer (wired to the printer) after cash sales. */
    openDrawer: boolean;
    /** Cut the paper after each receipt. */
    cut: boolean;
};

const CONFIG_KEY = 'finstack-desktop-printer';
const DEFAULT_CONFIG: DesktopPrinterConfig = { printer: null, openDrawer: false, cut: true };

export function loadPrinterConfig(): DesktopPrinterConfig {
    try {
        const raw = window.localStorage.getItem(CONFIG_KEY);

        return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
    } catch {
        return DEFAULT_CONFIG;
    }
}

export function savePrinterConfig(config: DesktopPrinterConfig): void {
    try {
        window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch {
        // Storage blocked: the setting just won't stick on this machine.
    }
}

export const listPrinters = () => invoke<string[]>('list_printers');

export const defaultPrinter = () => invoke<string | null>('default_printer');

/** Send raw ESC/POS bytes straight to a Windows printer (no dialog). */
export const printRaw = (printer: string, bytes: Uint8Array) =>
    invoke<void>('print_raw', { printer, data: Array.from(bytes) });
