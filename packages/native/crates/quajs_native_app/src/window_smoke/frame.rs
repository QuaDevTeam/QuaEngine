use serde_json::json;
use winit::dpi::PhysicalSize;

use super::error::NativeWindowSmokeError;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct WindowFrameDimensions {
    pub logical_width: f64,
    pub logical_height: f64,
    pub physical_size: PhysicalSize<u32>,
    pub device_pixel_ratio: f64,
}

pub(super) fn window_frame_dimensions(
    physical_size: PhysicalSize<u32>,
    scale_factor: f64,
) -> WindowFrameDimensions {
    let physical_size = normalized_physical_size(physical_size);
    let device_pixel_ratio = normalized_scale_factor(scale_factor);
    WindowFrameDimensions {
        logical_width: physical_size.width as f64 / device_pixel_ratio,
        logical_height: physical_size.height as f64 / device_pixel_ratio,
        physical_size,
        device_pixel_ratio,
    }
}

pub(super) fn frame_json_for_window(
    frame_source: &str,
    width: f64,
    height: f64,
    device_pixel_ratio: f64,
) -> Result<String, NativeWindowSmokeError> {
    let mut value: serde_json::Value = serde_json::from_str(frame_source).map_err(|error| {
        NativeWindowSmokeError::new(format!(
            "Failed to parse native window renderer smoke frame before container projection: {error}."
        ))
    })?;
    value["container"] = json!({
        "width": width,
        "height": height,
        "devicePixelRatio": device_pixel_ratio
    });
    serde_json::to_string(&value).map_err(|error| {
        NativeWindowSmokeError::new(format!(
            "Failed to serialize native window renderer smoke frame after container projection: {error}."
        ))
    })
}

pub(super) fn normalized_physical_size(size: PhysicalSize<u32>) -> PhysicalSize<u32> {
    PhysicalSize::new(size.width.max(1), size.height.max(1))
}

pub(super) fn normalized_scale_factor(scale_factor: f64) -> f64 {
    if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    }
}
