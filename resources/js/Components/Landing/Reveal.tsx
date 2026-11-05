import { createElement, ElementType, ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Fades and lifts its content in the first time it scrolls into view.
 * Without IntersectionObserver (or JS), content simply shows; users who
 * prefer reduced motion get no movement (see app.css).
 */
export default function Reveal({
    as = 'div',
    delay = 0,
    className = '',
    children,
}: {
    as?: ElementType;
    /** Stagger in milliseconds. */
    delay?: number;
    className?: string;
    children: ReactNode;
}) {
    const ref = useRef<HTMLElement>(null);
    const [armed, setArmed] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === 'undefined') {
            return;
        }

        setArmed(true);
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
        );
        observer.observe(el);

        return () => observer.disconnect();
    }, []);

    return createElement(
        as,
        {
            ref,
            className: `${armed ? 'js-reveal' : ''} ${visible ? 'is-visible' : ''} ${className}`,
            style: delay ? ({ '--reveal-delay': `${delay}ms` } as React.CSSProperties) : undefined,
        },
        children,
    );
}
