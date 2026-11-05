import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

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
                sans: ['Figtree', ...defaultTheme.fontFamily.sans],
            },
            // One step larger than Tailwind's defaults (12px / 14px) for readability.
            fontSize: {
                xs: ['0.8125rem', { lineHeight: '1.125rem' }],
                sm: ['0.9375rem', { lineHeight: '1.375rem' }],
            },
            colors: {
                // Brand red gradient runs from brand-500 to brand-700.
                brand: {
                    50: '#FFF1F1',
                    100: '#FFDFDF',
                    // 200/300: tints for selected states in the app.
                    200: '#FFC5C7',
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
                // App background behind cards and tables.
                surface: '#F7F8FA',
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
