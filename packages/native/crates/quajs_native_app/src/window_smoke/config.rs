use std::path::PathBuf;

use super::error::NativeWindowSmokeError;

pub const WINDOW_SMOKE_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_SMOKE";
pub const WINDOW_SMOKE_FRAME_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAME";
pub const WINDOW_SMOKE_FRAMES_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAMES";
pub const WINDOW_DEV_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_DEV";
pub const WINDOW_DEV_QPK_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_DEV_QPK";
pub const WINDOW_PERF_HUD_ENV: &str = "QUA_NATIVE_RENDERER_PERF_HUD";
pub const WINDOW_TITLE_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_TITLE";
pub const WINDOW_DEMO_E2E_ENV: &str = "QUA_NATIVE_RENDERER_WINDOW_DEMO_E2E";
pub const WINDOW_TARGET_FPS_ENV: &str = "QUA_NATIVE_RENDERER_TARGET_FPS";

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

/// The performance HUD overlay is developer-only diagnostics. It is off by
/// default (including dev windows) and must be requested explicitly.
pub(super) fn native_window_perf_hud_enabled() -> bool {
    env_flag_enabled(WINDOW_PERF_HUD_ENV)
}

pub(super) fn native_window_title() -> String {
    std::env::var(WINDOW_TITLE_ENV)
        .ok()
        .map(|title| title.trim().to_string())
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| {
            if native_window_dev_enabled() {
                "Qua Native Renderer Dev".to_string()
            } else {
                "Qua Native Renderer Smoke".to_string()
            }
        })
}

pub(super) fn native_window_demo_e2e_enabled() -> bool {
    env_flag_enabled(WINDOW_DEMO_E2E_ENV)
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
    if native_window_dev_enabled() || native_window_demo_e2e_enabled() {
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

/// Dev/CI override for the target render cadence. Player-facing frame rate
/// selection arrives through `view.renderer.targetFrameRate`; this env only
/// exists so a developer or a benchmark can pin the cadence without editing
/// settings. Invalid values fall back to the default cadence.
pub(super) fn load_window_target_fps_override() -> Option<u32> {
    let value = std::env::var_os(WINDOW_TARGET_FPS_ENV)?;
    let value = value.to_string_lossy();
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    let fps = value.parse::<u32>().ok()?;
    Some(crate::product_frame_pacer::clamp_target_fps(fps))
}

fn env_flag_enabled(name: &str) -> bool {
    let Some(value) = std::env::var_os(name) else {
        return false;
    };
    let value = value.to_string_lossy();
    let value = value.trim();
    !value.is_empty() && value != "0" && !value.eq_ignore_ascii_case("false")
}

/// Explicit physical capture size for finite GPU audits. Actual window DPR is
/// still measured by winit and never replaced by a fixture's requested DPR.
pub(super) fn load_window_capture_size() -> Option<winit::dpi::PhysicalSize<u32>> {
    if !native_window_smoke_enabled()
        || native_window_dev_enabled()
        || native_window_demo_e2e_enabled()
    {
        return None;
    }
    parse_window_capture_size(&std::env::var("QUA_NATIVE_RENDERER_WINDOW_CAPTURE_SIZE").ok()?)
}

fn parse_window_capture_size(value: &str) -> Option<winit::dpi::PhysicalSize<u32>> {
    let (width, height) = value.split_once('x')?;
    let width = width.parse::<u32>().ok()?;
    let height = height.parse::<u32>().ok()?;
    ((64..=4096).contains(&width) && (64..=4096).contains(&height))
        .then_some(winit::dpi::PhysicalSize::new(width, height))
}

#[cfg(test)]
mod capture_size_tests {
    use super::*;
    #[test]
    fn bounds_capture_extent_without_overriding_platform_dpr() {
        assert_eq!(
            parse_window_capture_size("1920x1200"),
            Some(winit::dpi::PhysicalSize::new(1920, 1200))
        );
        for value in ["0x100", "1920x999999", "NaNx1", "-10x100", "100x100x100"] {
            assert_eq!(parse_window_capture_size(value), None);
        }
    }
}
