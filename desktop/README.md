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

## Releasing an update (auto-update)

Installed apps check `https://finstackpos.shop/desktop/update/...` on launch and offer
"Update now / Later". Updates are signed; the app only installs files signed with the
private key that matches the `pubkey` in `tauri.conf.json`.

1. Bump `version` in `src-tauri/tauri.conf.json` (and `Cargo.toml`, `package.json`).
2. Build with the signing key:
   ```sh
   export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/finstackpos-updater.key"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
   npm run build
   ```
3. Upload **both** files from `src-tauri/target/release/bundle/nsis/` to the server's
   `storage/app/downloads/`: `FinstackPOS_X.Y.Z_x64-setup.exe` and `FinstackPOS_X.Y.Z_x64-setup.exe.sig`.
   Without the `.sig`, the landing page offers it but installed apps won't update to it.

**Keep `~/.tauri/finstackpos-updater.key` safe and backed up** (password manager or
offline copy). Never commit it. If it is lost, installed apps can't be updated anymore
and every PC must reinstall manually.

Web changes (Laravel/React) don't need any of this: deploy the site and every register
gets them on the next load.
