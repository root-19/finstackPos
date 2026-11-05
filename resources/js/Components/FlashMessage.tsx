import { Icon } from '@/Components/NavIcons';
import { usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';

/** Shows the session's "success" flash as a toast for a few seconds. */
export default function FlashMessage() {
    const { flash } = usePage().props;
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!flash.success) {
            return;
        }

        setMessage(flash.success);
        const timer = window.setTimeout(() => setMessage(null), 4000);

        return () => window.clearTimeout(timer);
    }, [flash]);

    if (!message) {
        return null;
    }

    return (
        <div
            role="status"
            className="fixed inset-x-3 bottom-3 z-50 flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-pop sm:inset-x-auto sm:bottom-5 sm:right-5 sm:max-w-sm"
        >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                        clipRule="evenodd"
                    />
                </svg>
            </span>
            <span className="flex-1">{message}</span>
            <button
                type="button"
                onClick={() => setMessage(null)}
                className="-mr-1 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Dismiss"
            >
                <Icon name="x" />
            </button>
        </div>
    );
}
