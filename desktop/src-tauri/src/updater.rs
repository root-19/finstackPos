//! Self-update. On launch the app asks finstackpos.shop for a newer signed
//! release (Laravel: /desktop/update/{target}/{arch}/{current_version}).
//! If there is one, the cashier picks "Update now" or "Later"; "Update now"
//! downloads it, checks its signature against the public key in
//! tauri.conf.json, installs it (passive NSIS) and restarts.
//!
//! Only at launch, so an update never cuts into a sale. Offline or server
//! errors are ignored: the register must open regardless.

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

pub fn check_on_launch(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(err) = check(app).await {
            eprintln!("update check skipped: {err}");
        }
    });
}

async fn check(app: AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(());
    };

    let message = format!(
        "FinstackPOS {} is available (this PC has {}).\n\nInstall it now? The app will close and reopen in a few seconds. Sales saved offline are kept.",
        update.version, update.current_version
    );
    let handle = app.clone();

    app.dialog()
        .message(message)
        .title("Update available")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom("Update now".into(), "Later".into()))
        .show(move |install| {
            if !install {
                return;
            }
            tauri::async_runtime::spawn(async move {
                match update.download_and_install(|_, _| {}, || {}).await {
                    Ok(()) => handle.restart(),
                    Err(err) => {
                        handle
                            .dialog()
                            .message(format!("The update couldn't be installed: {err}\n\nIt will be offered again next time the app opens."))
                            .title("Update failed")
                            .kind(MessageDialogKind::Error)
                            .show(|_| {});
                    }
                }
            });
        });

    Ok(())
}
