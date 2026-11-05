import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'finstack.sidebarCollapsed';

function read(): boolean {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

/**
 * Whether the desktop sidebar shows icons only. Remembered per browser
 * (a viewer convenience, so localStorage is enough); Ctrl/Cmd+B toggles.
 */
export default function useSidebarCollapsed(): [boolean, () => void] {
    const [collapsed, setCollapsed] = useState(read);

    const toggle = useCallback(() => {
        setCollapsed((current) => {
            const next = !current;
            try {
                window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
            } catch {
                // Private mode or blocked storage: just don't remember it.
            }
            return next;
        });
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                toggle();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [toggle]);

    return [collapsed, toggle];
}
