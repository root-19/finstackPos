import { router } from '@inertiajs/react';
import { useEffect, useState } from 'react';

/**
 * True while Inertia loads another page. Form posts, filter refreshes
 * (preserveState) and partial reloads don't count, and fast visits never
 * flash a skeleton thanks to the short delay.
 */
export default function useNavigationLoading(delayMs = 150): boolean {
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let timer: number | undefined;

        const offStart = router.on('start', (event) => {
            const visit = event.detail.visit;

            if (visit.method !== 'get' || visit.preserveState === true || visit.only.length > 0) {
                return;
            }

            timer = window.setTimeout(() => setLoading(true), delayMs);
        });

        const offFinish = router.on('finish', () => {
            window.clearTimeout(timer);
            setLoading(false);
        });

        return () => {
            offStart();
            offFinish();
            window.clearTimeout(timer);
        };
    }, [delayMs]);

    return loading;
}
