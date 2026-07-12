use std::collections::VecDeque;
use std::time::{Duration, Instant};

use quajs_wgpu_renderer::fonts::NATIVE_BITMAP_FONT_FAMILY;
use serde_json::{json, Value};

use super::error::NativeWindowSmokeError;
use super::frame::WindowFrameDimensions;

const SAMPLE_COUNT: usize = 120;
const HUD_REFRESH_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Debug)]
pub(super) struct NativeWindowPerformanceHud {
    frame_intervals: VecDeque<Duration>,
    last_presented_at: Option<Instant>,
    last_frame_time: Duration,
    command_count: usize,
    pass_count: usize,
    batch_count: usize,
    last_hud_refresh_at: Option<Instant>,
    displayed_fps: f64,
    displayed_frame_time: Duration,
    displayed_command_count: usize,
    displayed_pass_count: usize,
    displayed_batch_count: usize,
}

impl Default for NativeWindowPerformanceHud {
    fn default() -> Self {
        Self {
            frame_intervals: VecDeque::with_capacity(SAMPLE_COUNT),
            last_presented_at: None,
            last_frame_time: Duration::ZERO,
            command_count: 0,
            pass_count: 0,
            batch_count: 0,
            last_hud_refresh_at: None,
            displayed_fps: 0.0,
            displayed_frame_time: Duration::ZERO,
            displayed_command_count: 0,
            displayed_pass_count: 0,
            displayed_batch_count: 0,
        }
    }
}

impl NativeWindowPerformanceHud {
    pub(super) fn inject(
        &self,
        frame_json: &str,
        dimensions: WindowFrameDimensions,
    ) -> Result<String, NativeWindowSmokeError> {
        let mut frame: Value = serde_json::from_str(frame_json).map_err(|error| {
            NativeWindowSmokeError::new(format!(
                "Failed to parse native renderer frame before adding the performance HUD: {error}."
            ))
        })?;
        let view = frame
            .get_mut("view")
            .and_then(Value::as_object_mut)
            .ok_or_else(|| {
                NativeWindowSmokeError::new("Native renderer dev frame requires a view object.")
            })?;
        let ui = view.entry("ui").or_insert_with(|| json!({}));
        let ui = ui.as_object_mut().ok_or_else(|| {
            NativeWindowSmokeError::new("Native renderer dev frame view.ui must be an object.")
        })?;
        ui.insert("visible".to_string(), Value::Bool(true));
        let overlays = ui.entry("overlays").or_insert_with(|| json!([]));
        let overlays = overlays.as_array_mut().ok_or_else(|| {
            NativeWindowSmokeError::new(
                "Native renderer dev frame view.ui.overlays must be an array.",
            )
        })?;
        overlays.retain(|overlay| {
            overlay.get("elementId").and_then(Value::as_str) != Some("native-performance-hud")
        });
        overlays.push(self.overlay(dimensions));
        serde_json::to_string(&frame).map_err(|error| {
            NativeWindowSmokeError::new(format!(
                "Failed to serialize native renderer frame with the performance HUD: {error}."
            ))
        })
    }

    pub(super) fn record_frame(
        &mut self,
        frame_time: Duration,
        command_count: usize,
        pass_count: usize,
        batch_count: usize,
    ) {
        let now = Instant::now();
        if let Some(previous) = self.last_presented_at.replace(now) {
            self.frame_intervals
                .push_back(now.saturating_duration_since(previous));
            if self.frame_intervals.len() > SAMPLE_COUNT {
                self.frame_intervals.pop_front();
            }
        }
        self.last_frame_time = frame_time;
        self.command_count = command_count;
        self.pass_count = pass_count;
        self.batch_count = batch_count;
        if self
            .last_hud_refresh_at
            .map(|previous| now.saturating_duration_since(previous) < HUD_REFRESH_INTERVAL)
            .unwrap_or(false)
        {
            return;
        }
        self.last_hud_refresh_at = Some(now);
        self.displayed_fps = self.fps();
        self.displayed_frame_time = self.last_frame_time;
        self.displayed_command_count = self.command_count;
        self.displayed_pass_count = self.pass_count;
        self.displayed_batch_count = self.batch_count;
    }

    fn overlay(&self, dimensions: WindowFrameDimensions) -> Value {
        let fps = self.displayed_fps;
        let frame_ms = self.displayed_frame_time.as_secs_f64() * 1_000.0;
        let lines = [
            format!("FPS {:>5.1}   FRAME {:>5.2} ms", fps, frame_ms),
            format!(
                "DRAW {:>4}   PASS {:>2}   BATCH {:>3}",
                self.displayed_command_count, self.displayed_pass_count, self.displayed_batch_count
            ),
            format!(
                "DPR {:.2}   {} x {} CSS",
                dimensions.device_pixel_ratio,
                dimensions.logical_width.round() as u32,
                dimensions.logical_height.round() as u32
            ),
        ];
        json!({
            "elementId": "native-performance-hud",
            "visible": true,
            "renderMode": "render-only",
            "interactive": false,
            "overlayStack": "hud",
            "stackPriority": -100,
            "zIndex": 8,
            "surface": {
                "key": "native/debug/performance-hud",
                "root": {
                    "id": "performance-panel",
                    "kind": "Panel",
                    "bounds": { "x": 24, "y": 24, "width": 420, "height": 112 },
                    "visible": true,
                    "style": {
                        "backgroundColor": "rgba(3,5,8,0.88)",
                        "borderColor": "rgba(129,229,255,0.42)",
                        "borderRadius": 4,
                        "borderWidth": 1
                    },
                    "children": lines.into_iter().enumerate().map(|(index, text)| json!({
                        "id": format!("performance-line-{index}"),
                        "kind": "Text",
                        "bounds": { "x": 42, "y": 38 + index * 28, "width": 384, "height": 24 },
                        "visible": true,
                        "text": text,
                        "style": {
                            "color": if index == 0 { "#81e5ff" } else { "rgba(255,248,234,0.82)" },
                            "fontFamily": [NATIVE_BITMAP_FONT_FAMILY],
                            "fontSize": 17,
                            "fontWeight": if index == 0 { 700 } else { 500 },
                            "lineHeight": 22
                        }
                    })).collect::<Vec<_>>()
                }
            }
        })
    }

    fn fps(&self) -> f64 {
        if self.frame_intervals.is_empty() {
            return 0.0;
        }
        let seconds = self
            .frame_intervals
            .iter()
            .map(Duration::as_secs_f64)
            .sum::<f64>();
        if seconds <= f64::EPSILON {
            0.0
        } else {
            self.frame_intervals.len() as f64 / seconds
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn injects_a_non_interactive_low_stack_debug_overlay() {
        let hud = NativeWindowPerformanceHud::default();
        let frame = hud
            .inject(
                r#"{"view":{"ui":{"overlays":[]}}}"#,
                WindowFrameDimensions {
                    logical_width: 960.0,
                    logical_height: 540.0,
                    physical_size: winit::dpi::PhysicalSize::new(1920, 1080),
                    device_pixel_ratio: 2.0,
                },
            )
            .unwrap();
        let value: Value = serde_json::from_str(&frame).unwrap();
        let overlay = &value["view"]["ui"]["overlays"][0];
        assert_eq!(overlay["elementId"], "native-performance-hud");
        assert_eq!(overlay["interactive"], false);
        assert_eq!(overlay["overlayStack"], "hud");
        assert_eq!(overlay["stackPriority"], -100);
    }

    #[test]
    fn keeps_hud_projection_stable_between_refresh_intervals() {
        let mut hud = NativeWindowPerformanceHud::default();
        let dimensions = WindowFrameDimensions {
            logical_width: 960.0,
            logical_height: 540.0,
            physical_size: winit::dpi::PhysicalSize::new(1920, 1080),
            device_pixel_ratio: 2.0,
        };
        hud.record_frame(Duration::from_millis(8), 12, 1, 3);
        let first = hud
            .inject(r#"{"view":{"ui":{"overlays":[]}}}"#, dimensions)
            .unwrap();
        hud.record_frame(Duration::from_millis(30), 99, 4, 8);
        let second = hud
            .inject(r#"{"view":{"ui":{"overlays":[]}}}"#, dimensions)
            .unwrap();

        assert_eq!(first, second);
    }
}
