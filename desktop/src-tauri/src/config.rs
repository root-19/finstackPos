//! Per-machine settings, kept in %APPDATA%\com.finstackpos.desktop\config.json.
//! Created with defaults on first run so a store can edit it by hand.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// The live server. Build with `FINSTACK_URL=http://localhost/pos` to point a
/// dev build at a local Laravel instead.
const DEFAULT_URL: &str = match option_env!("FINSTACK_URL") {
    Some(url) => url,
    None => "https://finstackpos.shop/pos",
};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Config {
    /// The page the register opens on.
    pub server_url: String,
    /// Fullscreen with no window frame (dedicated register PCs).
    pub kiosk: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server_url: DEFAULT_URL.to_string(),
            kiosk: false,
        }
    }
}

fn path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("config.json"))
}

pub fn load(app: &AppHandle) -> Config {
    let Some(path) = path(app) else {
        return Config::default();
    };

    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_else(|err| {
            eprintln!("config.json is invalid ({err}); using defaults");
            Config::default()
        }),
        Err(_) => {
            let config = Config::default();
            if let Some(dir) = path.parent() {
                let _ = fs::create_dir_all(dir);
            }
            if let Ok(text) = serde_json::to_string_pretty(&config) {
                let _ = fs::write(&path, text);
            }
            config
        }
    }
}
