/**
 * The app's color mode: "dark" is the shop-floor theme (html[data-theme="shop"]),
 * "light" the classic light look. Saved per device; app.blade.php applies the
 * saved choice before the page paints, so there's no flash of the wrong theme.
 * Marketing pages (data-theme="marketing") are never changed.
 */
export type ColorMode = 'dark' | 'light';

/** Must match the inline script in resources/views/app.blade.php. */
export const THEME_STORAGE_KEY = 'finstack-theme';

export function currentMode(): ColorMode {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setMode(mode: ColorMode): void {
    const root = document.documentElement;
    if (root.dataset.theme === 'marketing') return;

    root.dataset.theme = mode === 'light' ? 'light' : 'shop';
    try {
        localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
        // Private mode or storage blocked: the choice lasts for this page only.
    }
}
