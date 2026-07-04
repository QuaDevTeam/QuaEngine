use std::path::PathBuf;

use super::error::NativeWindowSmokeError;

pub const WINDOW_SMOKE_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_SMOKE";
pub const WINDOW_SMOKE_FRAME_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAME";

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
