/** Cache name of the POS page shell, see runtimeCaching in vite.config.ts. */
const POS_PAGE_CACHE = 'pos-pages';

/**
 * Forget the cached POS page on logout: it embeds the signed-in user's
 * details and must not be served to whoever opens the app next.
 * Queued sales in IndexedDB are kept so nothing unsynced is lost.
 */
export function clearOfflinePageCache(): void {
    if ('caches' in window) {
        void caches.delete(POS_PAGE_CACHE);
    }
}

/** Chromium's install prompt event (not in the standard DOM types). */
interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedNow = false;
let version = 0;
const listeners = new Set<() => void>();

function changed() {
    version++;
    listeners.forEach((listener) => listener());
}

/**
 * Keep the browser's install prompt for our own "Install app" button.
 * Call once at startup: the event can fire before React has mounted.
 */
export function listenForInstallPrompt(): void {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event as BeforeInstallPromptEvent;
        changed();
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        installedNow = true;
        changed();
    });
}

export function subscribeToInstall(listener: () => void): () => void {
    listeners.add(listener);

    return () => listeners.delete(listener);
}

/** Changes whenever install availability does (for useSyncExternalStore). */
export function installVersion(): number {
    return version;
}

export function canPromptInstall(): boolean {
    return deferredPrompt !== null;
}

/** Running as the installed app, or just installed in this session. */
export function isInstalled(): boolean {
    return (
        installedNow ||
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}

/** Shows the browser's install dialog. Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
    if (!deferredPrompt) {
        return false;
    }

    const event = deferredPrompt;
    deferredPrompt = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    changed();

    return outcome === 'accepted';
}

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export function installPlatform(): InstallPlatform {
    const ua = navigator.userAgent;
    const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

    if (/iphone|ipad|ipod/i.test(ua) || iPadOs) {
        return 'ios';
    }

    return /android/i.test(ua) ? 'android' : 'desktop';
}
