import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        laravel({
            input: 'resources/js/app.tsx',
            refresh: true,
        }),
        react(),
        VitePWA({
            // Laravel serves from public/ while Vite builds into public/build/.
            // The service worker must live at /sw.js so its scope covers the
            // whole app (a worker under /build/ could only control /build/*).
            outDir: 'public',
            base: '/',
            buildBase: '/',
            scope: '/',
            registerType: 'prompt',
            injectRegister: false,
            // Handwritten in public/manifest.webmanifest: the plugin would emit
            // it into public/build/ but precache it as /manifest.webmanifest.
            manifest: false,
            workbox: {
                globDirectory: 'public',
                globPatterns: [
                    'build/assets/**/*.{js,css,woff,woff2,svg,png,ico}',
                    'icons/*.png',
                    'manifest.webmanifest',
                    'favicon.ico',
                ],
                // There is no static index.html: pages are rendered by Laravel.
                navigateFallback: null,
                inlineWorkboxRuntime: true,
                cleanupOutdatedCaches: true,
                runtimeCaching: [
                    {
                        // Keep the last rendered POS shell so it opens offline.
                        urlPattern: ({ request, url }) =>
                            request.mode === 'navigate' &&
                            url.pathname.startsWith('/pos'),
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'pos-pages',
                            networkTimeoutSeconds: 4,
                            // Never cache login redirects (status 0) or errors.
                            cacheableResponse: { statuses: [200] },
                            expiration: { maxEntries: 5 },
                        },
                    },
                    {
                        // Product photos, so the register shows them offline.
                        urlPattern: ({ url, sameOrigin }) =>
                            sameOrigin &&
                            url.pathname.startsWith('/storage/products/'),
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'product-images',
                            cacheableResponse: { statuses: [200] },
                            expiration: {
                                maxEntries: 500,
                                maxAgeSeconds: 60 * 60 * 24 * 30,
                            },
                        },
                    },
                    {
                        // The store's own payment QR, so QR checkout (and the
                        // customer display) still shows it offline. Each upload
                        // gets a new file name, so a changed QR is never stale.
                        urlPattern: ({ url, sameOrigin }) =>
                            sameOrigin &&
                            url.pathname.startsWith('/storage/payment-qr/'),
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'payment-qr',
                            cacheableResponse: { statuses: [200] },
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 90,
                            },
                        },
                    },
                    {
                        urlPattern: ({ url }) =>
                            url.origin === 'https://fonts.bunny.net',
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'fonts',
                            cacheableResponse: { statuses: [0, 200] },
                            expiration: { maxEntries: 20 },
                        },
                    },
                ],
            },
        }),
    ],
});
