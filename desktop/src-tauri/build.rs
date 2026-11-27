/// Every app command the POS page may call. Tauri v2 only lets local pages
/// call app commands by default; listing them here creates `allow-<command>`
/// permissions that lib.rs grants to the POS server's origin.
const COMMANDS: &[&str] = &[
    "app_version",
    "system_info",
    "list_printers",
    "default_printer",
    "print_raw",
    "open_customer_display",
    "check_update",
    "install_update",
];

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)))
        .expect("failed to run tauri-build");
}
