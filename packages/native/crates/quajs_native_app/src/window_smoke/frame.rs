use quajs_wgpu_renderer::stage_layout::{StageContainerInput, StageSafeAreaInsets};
use serde_json::json;
use winit::dpi::PhysicalSize;

use super::error::NativeWindowSmokeError;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct WindowFrameDimensions {
    pub logical_width: f64,
    pub logical_height: f64,
    pub physical_size: PhysicalSize<u32>,
    pub device_pixel_ratio: f64,
    pub safe_area_insets: Option<StageSafeAreaInsets>,
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
        safe_area_insets: None,
    }
}

pub(super) fn frame_json_for_window(
    frame_source: &str,
    dimensions: WindowFrameDimensions,
) -> Result<String, NativeWindowSmokeError> {
    let mut value: serde_json::Value = serde_json::from_str(frame_source).map_err(|error| {
        NativeWindowSmokeError::new(format!(
            "Failed to parse native window renderer smoke frame before container projection: {error}."
        ))
    })?;
    value["container"] = json!(StageContainerInput {
        width: Some(dimensions.logical_width),
        height: Some(dimensions.logical_height),
        device_pixel_ratio: Some(dimensions.device_pixel_ratio),
        safe_area_insets: dimensions.safe_area_insets,
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

pub(super) fn window_surface_size(window: &winit::window::Window) -> PhysicalSize<u32> {
    // Winit's UIKit inner_size() already removes safeAreaInsets. The Metal
    // surface covers the whole window, with safe insets applied by stage layout.
    #[cfg(target_os = "ios")]
    let size = window.outer_size();
    #[cfg(not(target_os = "ios"))]
    let size = window.inner_size();
    normalized_physical_size(size)
}

pub(super) fn current_window_dimensions(window: &winit::window::Window) -> WindowFrameDimensions {
    let dimensions = window_frame_dimensions(window_surface_size(window), window.scale_factor());
    #[cfg(target_os = "android")]
    {
        use winit::platform::android::WindowExtAndroid;
        let rect = window.content_rect();
        // Android reports the drawable content rectangle in physical pixels.
        // A newly created NativeWindow sometimes has no content measurement yet.
        if rect.right > rect.left && rect.bottom > rect.top {
            let size = dimensions.physical_size;
            let scale = dimensions.device_pixel_ratio;
            return WindowFrameDimensions {
                safe_area_insets: Some(StageSafeAreaInsets {
                    top: f64::from(rect.top.max(0)) / scale,
                    right: (f64::from(size.width) - f64::from(rect.right)).max(0.0) / scale,
                    bottom: (f64::from(size.height) - f64::from(rect.bottom)).max(0.0) / scale,
                    left: f64::from(rect.left.max(0)) / scale,
                }),
                ..dimensions
            };
        }
    }
    #[cfg(target_os = "ios")]
    {
        use winit::raw_window_handle::{HasWindowHandle, RawWindowHandle};
        unsafe extern "C" {
            fn qua_ios_view_safe_area(view: *mut std::ffi::c_void, insets: *mut f64);
        }
        if let Ok(handle) = window.window_handle() {
            if let RawWindowHandle::UiKit(view) = handle.as_raw() {
                let mut insets = [0.0; 4];
                // The UIKit view and destination live for this synchronous main-thread call.
                unsafe { qua_ios_view_safe_area(view.ui_view.as_ptr(), insets.as_mut_ptr()) };
                let [top, right, bottom, left] = insets;
                return WindowFrameDimensions {
                    safe_area_insets: Some(StageSafeAreaInsets {
                        top,
                        right,
                        bottom,
                        left,
                    }),
                    ..dimensions
                };
            }
        }
    }
    dimensions
}
