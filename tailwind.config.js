import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

/**
 * Theme-able colors: the app's grays, surfaces and light red tints are CSS
 * variables (defined in app.css), so `html[data-theme="shop"]` can turn the
 * whole app into the dark "shop floor" look without touching every page.
 */
const themed = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const grays = Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [n, themed(`gray-${n}`)]));

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
        './resources/js/**/*.tsx',
    ],

    // Badge tones are picked at runtime (`badge-${tone}` in Components/ui.tsx).
    safelist: [{ pattern: /^badge-(gray|green|amber|red|blue|dark|brand)$/ }],

    theme: {
        extend: {
            fontFamily: {
                // The whole system: Archivo for text, Anton for big titles and numbers, IBM Plex Mono for labels.
                sans: ['Archivo', ...defaultTheme.fontFamily.sans],
                display: ['Anton', 'Impact', ...defaultTheme.fontFamily.sans],
                archivo: ['Archivo', ...defaultTheme.fontFamily.sans],
                plex: ['"IBM Plex Mono"', ...defaultTheme.fontFamily.mono],
            },
            // One step larger than Tailwind's defaults (12px / 14px) for readability.
            fontSize: {
                xs: ['0.8125rem', { lineHeight: '1.125rem' }],
                sm: ['0.9375rem', { lineHeight: '1.375rem' }],
            },
            colors: {
                // Brand red gradient runs from brand-500 to brand-700.
                gray: grays,
                brand: {
                    // 50-200: tints for selected states (themed: deep reds on the dark floor).
                    50: themed('brand-50'),
                    100: themed('brand-100'),
                    200: themed('brand-200'),
                    300: '#FF9A9E',
                    400: '#FF5A5A',
                    500: '#FF3030',
                    600: '#E41E2E',
                    700: '#C8102E',
                    800: '#9E0C24',
                },
                ink: {
                    900: '#111111',
                    800: '#1A1A1A',
                    700: '#262626',
                },
                // App background behind cards and tables, and the cards themselves (themed).
                surface: themed('surface'),
                card: themed('card'),
                // Landing + legal pages: a dark "shop floor" with paper sections. Red stays brand-500/700/800.
                shop: {
                    ink: '#0D0B0A',
                    'ink-2': '#161311',
                    paper: '#EFE8DC',
                    'paper-2': '#E4DCCD',
                    ember: '#5E0710',
                },
            },
            boxShadow: {
                card: '0 1px 2px 0 rgb(16 24 40 / 0.04)',
                pop: '0 12px 32px -8px rgb(16 24 40 / 0.18), 0 2px 6px -2px rgb(16 24 40 / 0.08)',
            },
            keyframes: {
                rise: {
                    from: { opacity: '0', transform: 'translateY(24px)' },
                    to: { opacity: '1', transform: 'translateY(0)' },
                },
                'gradient-x': {
                    '0%, 100%': { backgroundPosition: '0% 50%' },
                    '50%': { backgroundPosition: '100% 50%' },
                },
                drift: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-8px)' },
                },
                sheen: {
                    from: { transform: 'translateX(-120%) skewX(-20deg)' },
                    to: { transform: 'translateX(220%) skewX(-20deg)' },
                },
                'bar-grow': {
                    from: { transform: 'scaleY(0)' },
                    to: { transform: 'scaleY(1)' },
                },
            },
            animation: {
                rise: 'rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
                'gradient-x': 'gradient-x 8s ease-in-out infinite',
                drift: 'drift 6s ease-in-out infinite',
                sheen: 'sheen 1s ease-out',
                'bar-grow': 'bar-grow 1s cubic-bezier(0.22, 1, 0.36, 1) both',
            },
        },
    },

    plugins: [forms],
};
