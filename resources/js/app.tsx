import '../css/app.css';
import './bootstrap';

import PwaUpdatePrompt from '@/Components/PwaUpdatePrompt';
import { listenForInstallPrompt } from '@/lib/pwa';
import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

// Before anything renders: the browser may offer installation right away.
listenForInstallPrompt();

createInertiaApp({
    title: (title) => `${title} - ${appName}`,
    resolve: (name) =>
        resolvePageComponent(
            `./Pages/${name}.tsx`,
            import.meta.glob('./Pages/**/*.tsx'),
        ),
    setup({ el, App, props }) {
        const root = createRoot(el);

        // Customers' phones on a table's menu don't need the offline app
        // (it would download every screen over their mobile data).
        const customerMenu = window.location.pathname.startsWith('/order/');

        root.render(
            <>
                <App {...props} />
                {!customerMenu && <PwaUpdatePrompt />}
            </>,
        );

        // Drop the boot splash (app.blade.php) once the first frame is painted.
        requestAnimationFrame(() =>
            requestAnimationFrame(() => document.getElementById('boot-splash')?.remove()),
        );
    },
    progress: {
        color: '#DC2626',
    },
});
