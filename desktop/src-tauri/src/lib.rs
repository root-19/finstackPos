//! FinstackPOS desktop: a window around the hosted Laravel POS, plus the
//! hardware a browser can't reach (silent receipt printing, cash drawer).
//!
//! The web app stays the single source of truth: deploy the site and every
//! register picks it up. Offline selling keeps working through the PWA's
//! service worker and IndexedDB queue, exactly as in the browser.

mod config;
mod display;
mod printing;
mod updater;

use tauri::ipc::CapabilityBuilder;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

#[tauri::command]
fn app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

pub fn run() {
    tauri::Builder::default()
        // One register window per PC: a second launch focuses the first.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            app_version,
            printing::list_printers,
            printing::default_printer,
            printing::print_raw,
            display::open_customer_display,
        ])
        // Closing the register closes the customer display too.
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .setup(|app| {
            let config = config::load(app.handle());
            let start: Url = config
                .server_url
                .parse()
                .map_err(|err| format!("server_url \"{}\" in config.json is not a URL: {err}", config.server_url))?;
            let origin = start.origin();

            // Let only our own server call the printer commands.
            app.add_capability(
                CapabilityBuilder::new("pos-server")
                    .remote(format!("{}/*", origin.ascii_serialization()))
                    .window("main")
                    .permission("core:default"),
            )?;

            let allowed = origin.clone();
            let opener = app.handle().clone();

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(start))
                .title("FinstackPOS")
                .inner_size(1280.0, 800.0)
                .min_inner_size(1024.0, 640.0)
                .maximized(true)
                .fullscreen(config.kiosk)
                .decorations(!config.kiosk)
                // Links to other sites open in the normal browser, so the
                // register window never leaves the POS.
                .on_navigation(move |url| {
                    if url.origin() == allowed || url.scheme() == "about" {
                        return true;
                    }
                    if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
                        use tauri_plugin_opener::OpenerExt;
                        let _ = opener.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .build()?;

            updater::check_on_launch(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running FinstackPOS");
}
