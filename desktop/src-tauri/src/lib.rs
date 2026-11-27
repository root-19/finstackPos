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

/// For the System details page.
#[derive(serde::Serialize)]
struct SystemInfo {
    app_version: String,
    tauri_version: &'static str,
    webview_version: Option<String>,
    os: &'static str,
    arch: &'static str,
    os_version: Option<String>,
    server_url: String,
    kiosk: bool,
}

#[tauri::command]
fn system_info(app: tauri::AppHandle) -> SystemInfo {
    let config = config::load(&app);

    SystemInfo {
        app_version: app.package_info().version.to_string(),
        tauri_version: tauri::VERSION,
        webview_version: tauri::webview_version().ok(),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        os_version: os_version(),
        server_url: config.server_url,
        kiosk: config.kiosk,
    }
}

/// e.g. "Microsoft Windows [Version 10.0.22621.4317]" (build 22000+ is Windows 11).
#[cfg(windows)]
fn os_version() -> Option<String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let out = std::process::Command::new("cmd")
        .args(["/C", "ver"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!text.is_empty()).then_some(text)
}

#[cfg(not(windows))]
fn os_version() -> Option<String> {
    None
}

/// Permissions build.rs generates for the app commands.
const APP_PERMISSIONS: &[&str] = &[
    "allow-app-version",
    "allow-system-info",
    "allow-list-printers",
    "allow-default-printer",
    "allow-print-raw",
    "allow-open-customer-display",
    "allow-check-update",
    "allow-install-update",
];

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
            system_info,
            printing::list_printers,
            printing::default_printer,
            printing::print_raw,
            display::open_customer_display,
            updater::check_update,
            updater::install_update,
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
            let mut capability = CapabilityBuilder::new("pos-server")
                .remote(format!("{}/*", origin.ascii_serialization()))
                .window("main")
                .permission("core:default");
            for permission in APP_PERMISSIONS {
                capability = capability.permission(*permission);
            }
            app.add_capability(capability)?;

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
