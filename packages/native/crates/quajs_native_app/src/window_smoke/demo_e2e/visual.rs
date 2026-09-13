use std::path::Path;
use std::time::{Duration, Instant};

use quajs_wgpu_renderer::renderer::RealWgpuEncodedFrameCapture;
use quajs_wgpu_renderer::stage_layout::ResolvedStageLayout;
use serde::Serialize;
use serde_json::Value;

use super::super::error::NativeWindowSmokeError;

const SETTLE_TIME: Duration = Duration::from_millis(600);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct VisualCheckpoint {
    pub name: String,
    pub file: String,
    pub width: u32,
    pub height: u32,
    pub background: Option<String>,
    pub characters: Vec<String>,
    pub dialogue: Option<String>,
    pub scene_region: bool,
    pub bright_fraction: f64,
    pub mean_luma: f64,
    pub luma_stddev: f64,
}

#[derive(Clone, Debug)]
struct PendingCapture {
    name: String,
    frame: Value,
    layout: ResolvedStageLayout,
}

#[derive(Clone, Debug, Default)]
pub(super) struct VisualCheckpoints {
    candidate: Option<(String, String, Instant)>,
    pending: Option<PendingCapture>,
    pub completed: Vec<VisualCheckpoint>,
}

impl VisualCheckpoints {
    pub fn contains(&self, name: &str) -> bool {
        self.completed
            .iter()
            .any(|checkpoint| checkpoint.name == name)
    }

    pub fn ready(&mut self, name: &str, frame: &Value, layout: ResolvedStageLayout) -> bool {
        if self.contains(name) {
            return true;
        }
        if !projection_settled(frame) || !dialogue_revealed(frame) {
            self.candidate = None;
            return false;
        }
        let identity = serde_json::json!({
            "dialogue": dialogue_signature(frame),
            "background": frame.pointer("/view/background"),
            "characters": frame.pointer("/view/characters"),
            "overlays": frame.pointer("/view/ui/overlays").and_then(Value::as_array).map(|overlays| overlays.iter().map(|overlay| &overlay["elementId"]).collect::<Vec<_>>()),
        }).to_string();
        let now = Instant::now();
        match &self.candidate {
            Some((previous_name, previous_identity, since))
                if previous_name == name && previous_identity == &identity =>
            {
                if now.duration_since(*since) >= SETTLE_TIME {
                    self.pending = Some(PendingCapture {
                        name: name.into(),
                        frame: frame.clone(),
                        layout,
                    });
                }
            }
            _ => self.candidate = Some((name.into(), identity, now)),
        }
        false
    }

    pub fn has_pending_capture(&self) -> bool {
        self.pending.is_some()
    }

    // Called only after the matching projection has reached the real GPU.
    pub fn capture(
        &mut self,
        capture: &RealWgpuEncodedFrameCapture,
    ) -> Result<(), NativeWindowSmokeError> {
        let Some(pending) = self.pending.take() else {
            return Ok(());
        };
        let directory = std::env::var_os("QUA_NATIVE_RENDERER_WINDOW_DEMO_E2E_CAPTURE_DIR")
            .ok_or_else(|| error("Native demo E2E requires a checkpoint capture directory."))?;
        let file = format!("{}.png", pending.name);
        let path = Path::new(&directory).join(&file);
        std::fs::create_dir_all(&directory).map_err(|e| error(e.to_string()))?;
        // Keep the failing image too, so a black-frame failure is reviewable.
        std::fs::write(&path, &capture.bytes).map_err(|e| error(e.to_string()))?;
        let image = image::load_from_memory_with_format(&capture.bytes, image::ImageFormat::Png)
            .map_err(|e| error(format!("Cannot decode checkpoint {}: {e}", pending.name)))?
            .to_rgba8();
        let scene_region = pending.name.starts_with("story-");
        let layout = pending.layout;
        let x = (layout.viewport_x * layout.device_pixel_ratio
            + layout.physical_viewport_width * 0.05)
            .max(0.0) as u32;
        let y = (layout.viewport_y * layout.device_pixel_ratio
            + layout.physical_viewport_height * 0.05)
            .max(0.0) as u32;
        let width = (layout.physical_viewport_width * 0.90) as u32;
        // A bright dialogue box must not make a black scene pass.
        let height =
            (layout.physical_viewport_height * if scene_region { 0.55 } else { 0.90 }) as u32;
        let (bright_fraction, mean_luma, luma_stddev) = region_metrics(&image, x, y, width, height);
        let checkpoint = VisualCheckpoint {
            name: pending.name.clone(),
            file,
            width: capture.width,
            height: capture.height,
            background: pending
                .frame
                .pointer("/view/background/assetName")
                .and_then(Value::as_str)
                .map(str::to_string),
            characters: visible_characters(&pending.frame),
            dialogue: full_dialogue_text(&pending.frame),
            scene_region,
            bright_fraction,
            mean_luma,
            luma_stddev,
        };
        std::fs::write(
            path.with_extension("json"),
            serde_json::to_vec_pretty(&checkpoint).map_err(|e| error(e.to_string()))?,
        )
        .map_err(|e| error(e.to_string()))?;
        if !pixels_pass(bright_fraction, mean_luma, luma_stddev) {
            return Err(error(format!(
                "Native demo E2E checkpoint {} is black or blank: bright={bright_fraction:.3}, mean={mean_luma:.1}, stddev={luma_stddev:.1}; capture: {}.",
                pending.name, path.display()
            )));
        }
        println!("Native demo E2E visual checkpoint: {} (bright={bright_fraction:.3}, mean={mean_luma:.1}, stddev={luma_stddev:.1}).", pending.name);
        self.completed.push(checkpoint);
        self.candidate = None;
        Ok(())
    }
}

fn error(message: impl Into<String>) -> NativeWindowSmokeError {
    NativeWindowSmokeError::new(message.into())
}

fn region_metrics(
    image: &image::RgbaImage,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> (f64, f64, f64) {
    let mut count = 0.0_f64;
    let mut bright = 0.0;
    let mut sum = 0.0;
    let mut square_sum = 0.0;
    for row in y..y.saturating_add(height).min(image.height()) {
        for column in x..x.saturating_add(width).min(image.width()) {
            let [r, g, b, a] = image.get_pixel(column, row).0;
            let luma = (0.2126 * f64::from(r) + 0.7152 * f64::from(g) + 0.0722 * f64::from(b))
                * f64::from(a)
                / 255.0;
            count += 1.0;
            bright += if luma > 24.0 { 1.0 } else { 0.0 };
            sum += luma;
            square_sum += luma * luma;
        }
    }
    let mean = sum / count.max(1.0);
    (
        bright / count.max(1.0),
        mean,
        (square_sum / count.max(1.0) - mean * mean).max(0.0).sqrt(),
    )
}

fn pixels_pass(bright: f64, mean: f64, stddev: f64) -> bool {
    bright >= 0.25 && mean >= 20.0 && stddev >= 8.0
}

pub(super) fn full_dialogue_text(frame: &Value) -> Option<String> {
    let dialogue = frame.pointer("/view/dialogue")?;
    if dialogue.get("visible").and_then(Value::as_bool) == Some(false) {
        return None;
    }
    let text = dialogue
        .get("layoutText")
        .or_else(|| dialogue.get("text"))?;
    let text = text
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| text.to_string());
    (!text.is_empty() && text != "null").then_some(text)
}

pub(super) fn dialogue_signature(frame: &Value) -> Option<String> {
    let text = full_dialogue_text(frame)?;
    let dialogue = frame.pointer("/view/dialogue")?;
    Some(serde_json::json!([dialogue.get("revision"), dialogue.get("speaker"), text]).to_string())
}

pub(super) fn dialogue_revealed(frame: &Value) -> bool {
    let Some(dialogue) = frame.pointer("/view/dialogue") else {
        return true;
    };
    dialogue.get("visible").and_then(Value::as_bool) == Some(false)
        || dialogue
            .get("layoutText")
            .is_none_or(|full| Some(full) == dialogue.get("text"))
}

pub(super) fn projection_settled(frame: &Value) -> bool {
    fn presence_settled(value: &Value) -> bool {
        match value {
            Value::Object(object) => {
                object
                    .get("presenceOpacity")
                    .and_then(Value::as_f64)
                    .is_none_or(|opacity| opacity >= 0.999)
                    && object.values().all(presence_settled)
            }
            Value::Array(values) => values.iter().all(presence_settled),
            _ => true,
        }
    }
    frame
        .pointer("/view/sceneTransition/active")
        .and_then(Value::as_bool)
        != Some(true)
        && !frame
            .pointer("/view/background/layers")
            .and_then(Value::as_array)
            .is_some_and(|layers| {
                layers.iter().any(|layer| {
                    layer
                        .get("id")
                        .and_then(Value::as_str)
                        .is_some_and(|id| id.starts_with("__qua_transition_"))
                })
            })
        && presence_settled(&frame["view"])
}

pub(super) fn visible_characters(frame: &Value) -> Vec<String> {
    frame
        .pointer("/view/characters")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|character| character.get("visible").and_then(Value::as_bool) != Some(false))
        .filter_map(|character| {
            character
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reveal_frames_are_one_dialogue_but_repeated_lines_have_distinct_revisions() {
        let mut frame =
            json!({"view":{"dialogue":{"revision":10,"text":"雨","layoutText":"雨没有停。"}}});
        let signature = dialogue_signature(&frame);
        assert!(!dialogue_revealed(&frame));
        frame["view"]["dialogue"]["text"] = json!("雨没有停。");
        frame["view"]["dialogue"]
            .as_object_mut()
            .unwrap()
            .remove("layoutText");
        assert_eq!(signature, dialogue_signature(&frame));
        assert!(dialogue_revealed(&frame));
        frame["view"]["dialogue"]["revision"] = json!(11);
        assert_ne!(signature, dialogue_signature(&frame));
    }

    #[test]
    fn transitions_must_finish_before_scene_acceptance() {
        for view in [
            json!({"sceneTransition":{"active":true}}),
            json!({"characters":[{"presenceOpacity":0.2}]}),
            json!({"background":{"layers":[{"id":"__qua_transition_new_main"}]}}),
        ] {
            assert!(!projection_settled(&json!({"view":view})));
        }
        assert!(projection_settled(
            &json!({"view":{"background":{"mode":"image"},"characters":[{"presenceOpacity":1.0}]}})
        ));
    }

    #[test]
    fn black_scene_with_bright_dialogue_and_blank_frames_fail() {
        let mut image = image::RgbaImage::from_pixel(100, 100, image::Rgba([0, 0, 0, 255]));
        for y in 75..100 {
            for x in 0..100 {
                image.put_pixel(x, y, image::Rgba([240, 240, 240, 255]));
            }
        }
        let (bright, mean, stddev) = region_metrics(&image, 5, 5, 90, 55);
        assert!(!pixels_pass(bright, mean, stddev));
        assert!(!pixels_pass(1.0, 255.0, 0.0));
        assert!(!pixels_pass(0.0, 0.0, 0.0));
        for y in 0..100 {
            for x in 0..100 {
                let gray = (40 + x * 2) as u8;
                image.put_pixel(x, y, image::Rgba([gray, gray, gray, 255]));
            }
        }
        let (bright, mean, stddev) = region_metrics(&image, 5, 5, 90, 55);
        assert!(pixels_pass(bright, mean, stddev));
    }
}
