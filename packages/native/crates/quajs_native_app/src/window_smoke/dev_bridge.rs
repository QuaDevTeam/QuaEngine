use std::fs::{self, OpenOptions};
use std::io::Write;

use quajs_native_runtime::InMemoryNativeHostApi;

use super::config::{
    native_window_dev_enabled, WINDOW_DEV_FRAME_PATH_ENV, WINDOW_DEV_INTENT_PATH_ENV,
};
use super::error::NativeWindowSmokeError;

pub(super) fn current_frame_source(fallback: &str) -> Result<String, NativeWindowSmokeError> {
    if !native_window_dev_enabled() {
        return Ok(fallback.to_string());
    }
    let Some(path) = std::env::var_os(WINDOW_DEV_FRAME_PATH_ENV) else {
        return Ok(fallback.to_string());
    };
    read_frame_source(path.as_ref())
}

fn read_frame_source(path: &std::path::Path) -> Result<String, NativeWindowSmokeError> {
    fs::read_to_string(&path).map_err(|error| {
        NativeWindowSmokeError::new(format!(
            "Failed to read native renderer dev frame {}: {error}.",
            path.to_string_lossy()
        ))
    })
}

pub(super) fn persist_new_renderer_intents(
    host: &InMemoryNativeHostApi,
    persisted_count: &mut usize,
) -> Result<(), NativeWindowSmokeError> {
    if !native_window_dev_enabled() {
        return Ok(());
    }
    let Some(path) = std::env::var_os(WINDOW_DEV_INTENT_PATH_ENV) else {
        return Ok(());
    };
    persist_new_renderer_intents_to_path(host, persisted_count, path.as_ref())
}

fn persist_new_renderer_intents_to_path(
    host: &InMemoryNativeHostApi,
    persisted_count: &mut usize,
    path: &std::path::Path,
) -> Result<(), NativeWindowSmokeError> {
    let intents = host.renderer_intents();
    if *persisted_count > intents.len() {
        *persisted_count = 0;
    }
    if *persisted_count == intents.len() {
        return Ok(());
    }
    let mut output = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| {
            NativeWindowSmokeError::new(format!(
                "Failed to open native renderer dev intent stream {}: {error}.",
                path.to_string_lossy()
            ))
        })?;
    for intent in &intents[*persisted_count..] {
        serde_json::to_writer(&mut output, intent).map_err(|error| {
            NativeWindowSmokeError::new(format!(
                "Failed to serialize native renderer dev intent: {error}."
            ))
        })?;
        output.write_all(b"\n").map_err(|error| {
            NativeWindowSmokeError::new(format!(
                "Failed to append native renderer dev intent: {error}."
            ))
        })?;
    }
    output.flush().map_err(|error| {
        NativeWindowSmokeError::new(format!(
            "Failed to flush native renderer dev intent stream: {error}."
        ))
    })?;
    *persisted_count = intents.len();
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use quajs_native_runtime::{NativeHostApi, NativeHostInfoBuilder, NativeRendererIntent};

    use super::*;

    #[test]
    fn reloads_the_latest_dev_frame_from_disk() {
        let path = temporary_path("frame.json");
        fs::write(&path, "{\"revision\":2}").unwrap();

        assert_eq!(read_frame_source(&path).unwrap(), "{\"revision\":2}");
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn appends_only_new_committed_renderer_intents() {
        let path = temporary_path("intents.jsonl");
        let mut host = InMemoryNativeHostApi::new(
            NativeHostInfoBuilder::new("Dev bridge", "dev.quajs.bridge").build(),
        );
        host.emit_renderer_intent(NativeRendererIntent {
            r#type: "ui/intent".to_string(),
            payload_json: Some("{\"action\":\"settings-update\"}".to_string()),
        })
        .unwrap();
        let mut persisted_count = 0;

        persist_new_renderer_intents_to_path(&host, &mut persisted_count, &path).unwrap();
        persist_new_renderer_intents_to_path(&host, &mut persisted_count, &path).unwrap();

        let lines = fs::read_to_string(&path).unwrap();
        assert_eq!(lines.lines().count(), 1);
        assert!(lines.contains("settings-update"));
        assert_eq!(persisted_count, 1);
        fs::remove_file(path).unwrap();
    }

    fn temporary_path(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "quajs-native-dev-bridge-{}-{nonce}-{name}",
            std::process::id()
        ))
    }
}
