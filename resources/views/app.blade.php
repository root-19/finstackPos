<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <title inertia>{{ config('app.name', 'Laravel') }}</title>

        <!-- PWA -->
        <link rel="manifest" href="/manifest.webmanifest">
        <meta name="theme-color" content="#C8102E">
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
        <link rel="icon" type="image/png" href="/icons/favicon-48.png">

        <!-- Fonts -->
        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=figtree:400,500,600,700,800&display=swap" rel="stylesheet" />

        <!-- Scripts -->
        @routes
        @viteReactRefresh
        @vite(['resources/js/app.tsx', "resources/js/Pages/{$page['component']}.tsx"])
        @inertiaHead
    </head>
    <body class="font-sans antialiased">
        {{-- Shown until React mounts; removed in resources/js/app.tsx. --}}
        <div id="boot-splash" class="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-white" role="status" aria-label="Loading">
            <img src="/brand/fb-profile-black.png" alt="" class="h-16 w-16 animate-pulse rounded-2xl shadow-lg shadow-gray-900/20">
            <div class="h-1 w-32 overflow-hidden rounded-full bg-gray-100">
                <div class="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-red-500 to-red-800"></div>
            </div>
        </div>

        @inertia
    </body>
</html>
