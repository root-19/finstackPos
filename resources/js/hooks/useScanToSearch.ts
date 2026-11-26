import { Dispatch, RefObject, SetStateAction, useEffect } from 'react';
import { flushSync } from 'react-dom';

/** What the decision below needs to know about a keystroke, without a DOM. */
export type KeyContext = {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    isComposing: boolean;
    /** The focused element's tag name, or null when it isn't an element. */
    targetTag: string | null;
    targetIsContentEditable: boolean;
    modalOpen: boolean;
};

/**
 * Whether a keystroke should be redirected into the POS search box.
 *
 * Kept free of the DOM so every branch is unit-tested; the hook below only
 * reads these facts off the event and passes them in.
 */
export function shouldCaptureKey(context: KeyContext): boolean {
    // Shortcuts belong to the browser and the OS (Ctrl+R, Cmd+F, Alt+Tab).
    if (context.ctrlKey || context.metaKey || context.altKey) {
        return false;
    }
    // Mid-composition characters belong to the IME.
    if (context.isComposing) {
        return false;
    }
    // Printable single characters only: not Enter, Tab, Escape, arrows or F-keys.
    if (context.key.length !== 1) {
        return false;
    }
    // Space activates the focused button and scrolls the page. Barcodes have no
    // spaces, so leaving it alone costs nothing and keeps buttons working.
    if (context.key === ' ') {
        return false;
    }
    // Someone is already typing in a field; never steal from them.
    if (context.targetIsContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(context.targetTag ?? '')) {
        return false;
    }
    // A modal owns the screen. Adding to the cart behind it would be invisible.
    if (context.modalOpen) {
        return false;
    }

    return true;
}

/**
 * Sends plain typing anywhere on the POS to the search box.
 *
 * A barcode scanner is a keyboard wedge: it types the code and presses Enter.
 * The search box is autofocused, so a scan works the moment the POS opens — but
 * as soon as the cashier taps a product, a category chip or the cart, focus moves
 * to that button and the scanner's keystrokes go nowhere. This puts them back.
 *
 * Only the first character needs help: focusing the field means the rest of the
 * code, and the closing Enter, arrive there on their own and are handled by the
 * field's own `onKeyDown` exactly as a scan into a focused box always was.
 *
 * Every POS modal renders the shared `Modal`, which mounts `#modal` only while it
 * is open, so one DOM check covers all of them and keeps covering modals added later.
 */
export default function useScanToSearch(
    inputRef: RefObject<HTMLInputElement>,
    setSearch: Dispatch<SetStateAction<string>>,
    enabled = true,
): void {
    useEffect(() => {
        if (!enabled) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof HTMLElement ? event.target : null;

            const capture = shouldCaptureKey({
                key: event.key,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                altKey: event.altKey,
                isComposing: event.isComposing,
                targetTag: target?.tagName ?? null,
                targetIsContentEditable: target?.isContentEditable ?? false,
                modalOpen: document.getElementById('modal') !== null,
            });

            const field = inputRef.current;
            if (!capture || !field) {
                return;
            }

            event.preventDefault();
            field.focus();
            // A scanner types in 1-5 ms per character. Without flushSync, React has
            // not re-rendered the controlled input by the time the second character
            // arrives, so the input's DOM value is still the old one and the first
            // character of every scan is lost.
            flushSync(() => setSearch(event.key));
        };

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [enabled, inputRef, setSearch]);
}
