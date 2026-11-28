<!DOCTYPE html>
{{-- data-theme: the signed-in app uses the dark "shop floor" theme (resources/css/app.css); marketing pages bring their own. --}}
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" data-theme="{{ isset($marketing) ? 'marketing' : 'shop' }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        @unless(isset($marketing))
            {{-- The saved color mode (resources/js/lib/theme.ts), applied before the first paint. --}}
            <script>try { if (localStorage.getItem('finstack-theme') === 'light') document.documentElement.dataset.theme = 'light'; } catch (e) {}</script>
        @endunless

        {{-- Marketing pages: the page's own title in the HTML itself, for crawlers (no SSR). --}}
        <title inertia>{{ isset($meta) ? $meta['title'] : config('app.name', 'Laravel') }}</title>

        <!-- PWA -->
        <link rel="manifest" href="/manifest.webmanifest">
        <meta name="theme-color" content="#C8102E">
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
        <link rel="icon" type="image/png" href="/icons/favicon-48.png">

        @isset($marketing)
            {{-- Landing and legal pages (WelcomeController::meta): SEO tags for crawlers (no SSR) and the marketing fonts. --}}
            <meta name="description" content="{{ $meta['description'] }}">
            <link rel="canonical" href="{{ $meta['url'] }}">
            <meta property="og:type" content="website">
            <meta property="og:site_name" content="FinstackPOS">
            <meta property="og:title" content="{{ $meta['title'] }}">
            <meta property="og:description" content="{{ $meta['description'] }}">
            <meta property="og:url" content="{{ $meta['url'] }}">
            <meta property="og:image" content="{{ $meta['image'] }}">
            <meta property="og:image:width" content="1200">
            <meta property="og:image:height" content="630">
            <meta property="og:locale" content="en_PH">
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:title" content="{{ $meta['title'] }}">
            <meta name="twitter:description" content="{{ $meta['description'] }}">
            <meta name="twitter:image" content="{{ $meta['image'] }}">
            @if (request()->is('/'))
                {{-- Structured data for search results. Only what is true: a free plan, PHP, web + Windows. --}}
                <script type="application/ld+json">{!! json_encode([
                    '@context' => 'https://schema.org',
                    '@graph' => [
                        [
                            '@type' => 'Organization',
                            'name' => 'FinstackPOS',
                            'url' => $meta['url'],
                            'logo' => rtrim($meta['url'], '/').'/logo.png',
                        ],
                        [
                            '@type' => 'SoftwareApplication',
                            'name' => 'FinstackPOS',
                            'url' => $meta['url'],
                            'description' => $meta['description'],
                            'applicationCategory' => 'BusinessApplication',
                            'operatingSystem' => 'Web, Windows, Android, iOS',
                            'inLanguage' => 'en-PH',
                            'offers' => ['@type' => 'Offer', 'price' => '0', 'priceCurrency' => 'PHP', 'description' => 'Free plan'],
                        ],
                    ],
                ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) !!}</script>
            @endif
        @endisset

        {{-- Fonts (Archivo, Anton, IBM Plex Mono) are self-hosted: resources/css/fonts.css, bundled by Vite. --}}

        <!-- Scripts -->
        @routes
        @viteReactRefresh
        @vite(['resources/js/app.tsx', "resources/js/Pages/{$page['component']}.tsx"])
        @inertiaHead
    </head>
    <body class="{{ isset($marketing) ? 'bg-shop-ink font-archivo text-shop-paper' : 'bg-surface font-sans text-gray-950' }} antialiased">
        @unless(isset($marketing))
            {{-- Shown until React mounts; removed in resources/js/app.tsx. Marketing pages skip it (LCP). --}}
            <div id="boot-splash" class="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-surface" role="status" aria-label="Loading">
                <img src="/brand/fb-profile-black.png" alt="" class="h-16 w-16 animate-pulse rounded-2xl shadow-lg shadow-gray-900/20">
                <div class="h-1 w-32 overflow-hidden rounded-full bg-gray-100">
                    <div class="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-red-500 to-red-800"></div>
                </div>
            </div>
        @endunless

        @inertia
    </body>
</html>
