import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Registers the service worker and asks before activating a new version,
 * so an update never reloads the page in the middle of a sale.
 */
export default function PwaUpdatePrompt() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW();

    if (!needRefresh) {
        return null;
    }

    return (
        <div
            role="status"
            className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg"
        >
            <span>A new version of FinstackPOS is available.</span>
            <button
                type="button"
                onClick={() => void updateServiceWorker(true)}
                className="font-semibold text-red-300 hover:text-red-200"
            >
                Reload
            </button>
            <button
                type="button"
                onClick={() => setNeedRefresh(false)}
                className="text-gray-400 hover:text-gray-200"
            >
                Later
            </button>
        </div>
    );
}
