# FinstackPOS Desktop (Windows)

A Tauri window around the hosted FinstackPOS web app, plus what a browser can't do:

- **Silent receipt printing** straight to a thermal (ESC/POS) printer, with no print dialog
- **Cash drawer** kick after cash sales, plus auto-cut
- One register window per PC, optional kiosk (fullscreen) mode

The Laravel app is unchanged: deploying the site updates every register. Offline selling
works as in the browser (service worker + IndexedDB queue).

## One-time setup (build machine)

1. Rust: `winget install Rustlang.Rustup`, then `rustup default stable-msvc`
2. Visual Studio Build Tools with **Desktop development with C++**:
   `winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`
3. In this folder: `npm install`, then `npm run icons` (generates `src-tauri/icons` from the PWA icon)

## Run and build

```sh
npm run dev                                   # opens https://finstackpos.shop/pos
FINSTACK_URL=http://localhost/pos npm run dev # against a local Laravel
npm run build                                 # installer in src-tauri/target/release/bundle/nsis
```

## Per-PC settings

First launch writes `%APPDATA%\com.finstackpos.desktop\config.json`:

```json
{ "server_url": "https://finstackpos.shop/pos", "kiosk": false }
```

Edit it and restart the app to point a register at another server or turn on kiosk mode.

The receipt printer is chosen in the app: **Settings → Desktop receipt printer**. It is
saved on that PC only. Leave it on "Use the print dialog" for non-thermal printers.
