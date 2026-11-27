//! The customer display: a second window on the customer-facing monitor.
//!
//! `window.open` does nothing inside the desktop app, so the POS asks us to
//! open it instead. It lands on the monitor the register is NOT on, in full
//! screen, so there is nothing to drag. Both windows share one WebView2
//! profile, so the register and display keep talking over BroadcastChannel
//! exactly as in the browser (lib/customerDisplay.ts).

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

pub const LABEL: &str = "customer-display";

/// Async: creating a window from a sync command can deadlock on Windows.
#[tauri::command]
pub async fn open_customer_display(app: AppHandle, url: String) -> Result<(), String> {
    let url: Url = url.parse().map_err(|err| format!("Bad display URL: {err}"))?;
    let main = app.get_webview_window("main").ok_or("The register window is not open")?;
    let register = main.url().map_err(|err| err.to_string())?;

    // Only pages from our own POS server.
    if url.origin() != register.origin() {
        return Err("The customer display must come from the POS server".into());
    }

    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.navigate(url);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(url))
        .title("FinstackPOS - Customer display")
        .inner_size(1280.0, 800.0)
        .build()
        .map_err(|err| err.to_string())?;

    // Move it to another monitor than the register's, then go full screen.
    let here = main.current_monitor().ok().flatten().map(|m| *m.position());
    let other = main
        .available_monitors()
        .unwrap_or_default()
        .into_iter()
        .find(|m| Some(*m.position()) != here);

    if let Some(monitor) = other {
        let _ = window.set_position(tauri::Position::Physical(*monitor.position()));
        let _ = window.set_fullscreen(true);
    }

    Ok(())
}
