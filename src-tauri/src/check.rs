//! `nonla check`: the main window's webview transpiles the code with the same
//! Sucrase setup that renders mini apps, so the check matches runtime exactly.
//! Rust sends `check:request`, the UI answers through the `check_result` command.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use rand::RngCore;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

static PENDING: LazyLock<Mutex<HashMap<String, oneshot::Sender<Value>>>> =
    LazyLock::new(Default::default);

/// `files` is `{ frontend?: string, backend?: string, panel?: string }`.
pub async fn run(app: &AppHandle, files: Value) -> Result<Value, String> {
    let mut bytes = [0u8; 8];
    rand::thread_rng().fill_bytes(&mut bytes);
    let request_id: String = bytes.iter().map(|b| format!("{b:02x}")).collect();

    let (tx, rx) = oneshot::channel();
    PENDING
        .lock()
        .map_err(|e| e.to_string())?
        .insert(request_id.clone(), tx);

    // Re-send every second: right after launch the webview may not be listening
    // yet, and an event sent before that is lost. Only the first answer counts.
    let payload = json!({ "requestId": request_id, "files": files });
    let ask = async {
        let mut rx = rx;
        loop {
            if let Err(e) = app.emit_to("main", "check:request", payload.clone()) {
                return Err(format!("Could not reach the Nonla Desk window: {e}"));
            }
            match tokio::time::timeout(Duration::from_secs(1), &mut rx).await {
                Ok(Ok(v)) => return Ok(v),
                Ok(Err(_)) => return Err("The check request was dropped.".to_string()),
                Err(_) => continue,
            }
        }
    };
    let result = match tokio::time::timeout(Duration::from_secs(20), ask).await {
        Ok(r) => r,
        Err(_) => Err("The Nonla Desk window did not answer the check request.".into()),
    };
    if result.is_err() {
        PENDING.lock().ok().map(|mut p| p.remove(&request_id));
    }
    result
}

pub fn resolve(request_id: &str, result: Value) {
    if let Some(tx) = PENDING.lock().ok().and_then(|mut p| p.remove(request_id)) {
        let _ = tx.send(result);
    }
}
