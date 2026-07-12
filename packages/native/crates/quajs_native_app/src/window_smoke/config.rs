use std::path::PathBuf;

use super::error::NativeWindowSmokeError;

pub const WINDOW_SMOKE_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_SMOKE";
pub const WINDOW_SMOKE_FRAME_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAME";
pub const WINDOW_SMOKE_FRAMES_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAMES";
pub const WINDOW_DEV_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_DEV";
pub const WINDOW_DEV_QPK_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_DEV_QPK";
pub const WINDOW_INTERACTION_PROBE_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_INTERACTION_PROBE";

const DEFAULT_WINDOW_SMOKE_FRAME_COUNT: usize = 1;
const MAX_WINDOW_SMOKE_FRAME_COUNT: usize = 120;

pub(super) const DEFAULT_WINDOW_SMOKE_FRAME: &str =
    include_str!("../../../../test-fixtures/renderer/qui-qss-surface-frame.json");

pub(super) fn native_window_smoke_enabled() -> bool {
    let Some(value) = std::env::var_os(WINDOW_SMOKE_ENV) else {
        return false;
    };
    let value = value.to_string_lossy();
    let value = value.trim();
    !value.is_empty() && value != "0" && !value.eq_ignore_ascii_case("false")
}

pub(super) fn native_window_dev_enabled() -> bool {
    env_flag_enabled(WINDOW_DEV_ENV)
}

pub(super) fn native_window_interaction_probe_enabled() -> bool {
    env_flag_enabled(WINDOW_INTERACTION_PROBE_ENV)
}

pub(super) fn load_window_smoke_frame_source() -> Result<String, NativeWindowSmokeError> {
    let path = std::env::var_os(WINDOW_SMOKE_FRAME_ENV)
        .or_else(|| std::env::var_os(crate::renderer_smoke::RENDERER_SMOKE_FRAME_ENV));
    let Some(path) = path else {
        return Ok(DEFAULT_WINDOW_SMOKE_FRAME.to_string());
    };
    let path = PathBuf::from(path);
    std::fs::read_to_string(&path).map_err(|error| {
        NativeWindowSmokeError::new(format!(
            "Failed to read native window renderer smoke frame \"{}\": {error}.",
            path.display()
        ))
    })
}

pub(super) fn load_window_smoke_target_frame_count() -> usize {
    if native_window_dev_enabled() || native_window_interaction_probe_enabled() {
        return usize::MAX;
    }
    let Some(value) = std::env::var_os(WINDOW_SMOKE_FRAMES_ENV) else {
        return DEFAULT_WINDOW_SMOKE_FRAME_COUNT;
    };
    let value = value.to_string_lossy();
    let value = value.trim();
    let Ok(frame_count) = value.parse::<usize>() else {
        return DEFAULT_WINDOW_SMOKE_FRAME_COUNT;
    };

    frame_count.clamp(
        DEFAULT_WINDOW_SMOKE_FRAME_COUNT,
        MAX_WINDOW_SMOKE_FRAME_COUNT,
    )
}

fn env_flag_enabled(name: &str) -> bool {
    let Some(value) = std::env::var_os(name) else {
        return false;
    };
    let value = value.to_string_lossy();
    let value = value.trim();
    !value.is_empty() && value != "0" && !value.eq_ignore_ascii_case("false")
}
