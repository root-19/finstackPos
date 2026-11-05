import { RefObject, useEffect } from 'react';

/**
 * Moves an element slightly against the scroll for a sense of depth.
 * Uses a CSS variable so it composes with other transforms; disabled for
 * reduced-motion users and on small screens.
 */
export default function useParallax(ref: RefObject<HTMLElement | null>, strength = 0.08) {
    useEffect(() => {
        const el = ref.current;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (!el || reduce || window.innerWidth < 1024) {
            return;
        }

        let frame = 0;
        // Rests where the layout put it, then drifts up slower than the page.
        const update = () => {
            frame = 0;
            const offset = Math.min(window.scrollY, 900) * -strength;
            el.style.setProperty('--parallax', `${offset.toFixed(1)}px`);
        };
        const onScroll = () => {
            if (!frame) {
                frame = requestAnimationFrame(update);
            }
        };

        update();
        window.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', onScroll);
            cancelAnimationFrame(frame);
        };
    }, [ref, strength]);
}
