import Modal from '@/Components/Modal';
import {
    canPromptInstall,
    installPlatform,
    installVersion,
    isInstalled,
    promptInstall,
    subscribeToInstall,
} from '@/lib/pwa';
import { useState, useSyncExternalStore } from 'react';

const STEPS = {
    ios: [
        'Open this page in Safari.',
        'Tap the Share button at the bottom of the screen.',
        'Choose “Add to Home Screen”, then tap Add.',
    ],
    android: [
        'Open this page in Chrome.',
        'Tap the ⋮ menu in the top-right corner.',
        'Choose “Install app” or “Add to Home screen”.',
    ],
    desktop: [
        'Open this page in Chrome or Microsoft Edge.',
        'Click the install icon at the right end of the address bar, or open the browser menu.',
        'Choose “Install FinstackPOS”.',
    ],
};

const BENEFITS = ['Opens full screen, like a regular app', 'Keeps selling even without internet', 'One tap from your home screen or taskbar'];

/**
 * Lets people know FinstackPOS installs like an app. Uses the browser's
 * own install prompt where available; otherwise explains the steps for
 * the device. Hidden once the app is installed.
 */
export default function InstallAppButton({
    variant = 'light',
    compact = false,
    className = '',
}: {
    /** light: on white headers; menu: full-width row in mobile menus. */
    variant?: 'light' | 'menu';
    /** Icon only below the lg breakpoint, where the header is tight. */
    compact?: boolean;
    className?: string;
}) {
    useSyncExternalStore(subscribeToInstall, installVersion, () => 0);
    const [helpOpen, setHelpOpen] = useState(false);

    if (typeof window === 'undefined' || isInstalled()) {
        return null;
    }

    const onClick = async () => {
        if (canPromptInstall()) {
            await promptInstall();
        } else {
            setHelpOpen(true);
        }
    };

    const styles =
        variant === 'menu'
            ? 'flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:border-ink-900'
            : 'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 transition hover:text-ink-900 hover:ring-ink-900/30';

    const steps = STEPS[installPlatform()];

    return (
        <>
            <button
                type="button"
                onClick={() => void onClick()}
                className={`${styles} focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${className}`}
                title="Install FinstackPOS as an app on this device"
            >
                <svg className="h-4 w-4 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                <span className={compact ? 'sr-only lg:not-sr-only' : ''}>Install app</span>
            </button>

            <Modal show={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="md">
                <div className="p-6 sm:p-7">
                    <div className="flex items-center gap-4">
                        <img src="/brand/fb-profile-black.png" alt="" className="h-14 w-14 rounded-2xl" />
                        <div>
                            <h2 className="text-lg font-bold text-ink-900">Install FinstackPOS</h2>
                            <p className="text-sm text-gray-500">Free · no app store needed</p>
                        </div>
                    </div>

                    <ul className="mt-5 space-y-2">
                        {BENEFITS.map((benefit) => (
                            <li key={benefit} className="flex items-center gap-2.5 text-sm text-gray-700">
                                <svg className="h-4 w-4 shrink-0 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                </svg>
                                {benefit}
                            </li>
                        ))}
                    </ul>

                    <ol className="mt-6 space-y-3 rounded-2xl bg-gray-50 p-4">
                        {steps.map((step, i) => (
                            <li key={step} className="flex gap-3 text-sm text-gray-700">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white">
                                    {i + 1}
                                </span>
                                {step}
                            </li>
                        ))}
                    </ol>

                    <button
                        type="button"
                        onClick={() => setHelpOpen(false)}
                        className="mt-6 w-full rounded-xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white hover:bg-ink-800"
                    >
                        Got it
                    </button>
                </div>
            </Modal>
        </>
    );
}
