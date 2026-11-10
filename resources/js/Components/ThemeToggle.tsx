import { ColorMode, currentMode, setMode } from '@/lib/theme';
import { useEffect, useState } from 'react';

const SUN = 'M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z';
const MOON = 'M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z';

/** Top-bar button that switches the app between dark (shop floor) and light mode. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
    const [mode, setState] = useState<ColorMode>('dark');

    useEffect(() => setState(currentMode()), []);

    const next: ColorMode = mode === 'dark' ? 'light' : 'dark';
    const label = next === 'light' ? 'Switch to light mode' : 'Switch to dark mode';

    return (
        <button
            type="button"
            onClick={() => {
                setMode(next);
                setState(next);
            }}
            aria-label={label}
            title={label}
            className={`btn btn-ghost btn-icon ${className}`}
        >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
                {/* Shows where you'll go: the sun in dark mode, the moon in light mode. */}
                <path strokeLinecap="round" strokeLinejoin="round" d={mode === 'dark' ? SUN : MOON} />
            </svg>
        </button>
    );
}
