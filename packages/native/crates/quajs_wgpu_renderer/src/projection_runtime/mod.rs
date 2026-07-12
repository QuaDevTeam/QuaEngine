mod animation;

use std::time::{Instant, SystemTime, UNIX_EPOCH};

use quajs_native_runtime::NativeRendererIntent;
use serde_json::{json, Map, Value};
use unicode_segmentation::UnicodeSegmentation;

const DEFAULT_TYPEWRITER_CPS: f64 = 36.0;
const DEFAULT_TRANSITION_DURATION_MS: f64 = 320.0;

#[derive(Clone, Debug)]
struct DialogueReveal {
    key: String,
    started_at_ms: f64,
    total: usize,
    visible: usize,
    reveal_on_advance: bool,
    revealed_all: bool,
}

#[derive(Clone, Debug)]
struct SceneTransition {
    kind: String,
    to_scene: String,
    from_scene: Option<String>,
    duration_ms: f64,
    started_at_ms: f64,
    easing: Option<String>,
}

#[derive(Clone, Debug)]
pub struct NativeRendererProjectionFrame {
    pub json: String,
    pub local_work_active: bool,
}

#[derive(Debug)]
pub struct NativeRendererProjectionRuntime {
    base_frame: Value,
    received_at: Instant,
    received_epoch_ms: f64,
    dialogue_reveal: Option<DialogueReveal>,
    scene_transition: Option<SceneTransition>,
    pending_intents: Vec<NativeRendererIntent>,
}

impl NativeRendererProjectionRuntime {
    pub fn from_frame_json(input: &str) -> Result<Self, serde_json::Error> {
        let frame: Value = serde_json::from_str(input)?;
        let now = Instant::now();
        let epoch = current_epoch_ms();
        let mut runtime = Self {
            base_frame: frame,
            received_at: now,
            received_epoch_ms: epoch,
            dialogue_reveal: None,
            scene_transition: None,
            pending_intents: Vec::new(),
        };
        runtime.sync_dialogue(epoch);
        Ok(runtime)
    }

    pub fn replace_frame_json(&mut self, input: &str) -> Result<(), serde_json::Error> {
        self.base_frame = serde_json::from_str(input)?;
        self.received_at = Instant::now();
        self.received_epoch_ms = current_epoch_ms();
        self.sync_dialogue(self.received_epoch_ms);
        Ok(())
    }

    pub fn apply_pipeline_event(
        &mut self,
        event: &str,
        payload_json: &str,
    ) -> Result<bool, serde_json::Error> {
        let payload: Value = serde_json::from_str(payload_json)?;
        match event {
            "view/update" => {
                let view = payload.get("view").cloned().unwrap_or(Value::Null);
                self.base_frame = json!({
                    "layout": view.get("layout").cloned().unwrap_or(Value::Null),
                    "view": view,
                });
                self.received_at = Instant::now();
                self.received_epoch_ms = current_epoch_ms();
                self.sync_dialogue(self.received_epoch_ms);
                Ok(true)
            }
            "scene/change" => {
                self.start_scene_transition(&payload, current_epoch_ms());
                Ok(true)
            }
            _ => Ok(false),
        }
    }

    pub fn reveal_dialogue_on_advance(&mut self) -> bool {
        let Some(reveal) = self.dialogue_reveal.as_mut() else {
            return false;
        };
        if !reveal.reveal_on_advance || reveal.visible >= reveal.total {
            return false;
        }
        reveal.visible = reveal.total;
        reveal.revealed_all = true;
        true
    }

    pub fn drain_intents(&mut self) -> Vec<NativeRendererIntent> {
        std::mem::take(&mut self.pending_intents)
    }

    pub fn project_now(&mut self) -> Result<NativeRendererProjectionFrame, serde_json::Error> {
        let elapsed = self.received_at.elapsed();
        self.project_at_epoch_ms(self.received_epoch_ms + elapsed.as_secs_f64() * 1000.0)
    }

    pub fn project_at_epoch_ms(
        &mut self,
        now_ms: f64,
    ) -> Result<NativeRendererProjectionFrame, serde_json::Error> {
        let mut frame = self.base_frame.clone();
        let mut local_work_active = false;
        if let Some(view) = frame.get_mut("view").and_then(Value::as_object_mut) {
            let animations = view.get("animations").cloned().unwrap_or(Value::Null);
            local_work_active |= animation::apply_animations(view, &animations, now_ms);
            local_work_active |= self.apply_dialogue(view, now_ms);
            local_work_active |= self.apply_scene_transition(view, now_ms);
            view.remove("animations");
        }
        Ok(NativeRendererProjectionFrame {
            json: serde_json::to_string(&frame)?,
            local_work_active,
        })
    }

    fn sync_dialogue(&mut self, now_ms: f64) {
        let Some(dialogue) = self
            .base_frame
            .pointer("/view/dialogue")
            .and_then(Value::as_object)
        else {
            self.dialogue_reveal = None;
            return;
        };
        if dialogue.get("visible").and_then(Value::as_bool) == Some(false) {
            self.dialogue_reveal = None;
            return;
        }
        let text = dialogue_text(dialogue.get("text"));
        let total = text.graphemes(true).count();
        let typewriter = dialogue.get("typewriter").and_then(Value::as_object);
        if typewriter
            .and_then(|value| value.get("enabled"))
            .and_then(Value::as_bool)
            != Some(true)
        {
            self.dialogue_reveal = None;
            return;
        }
        let key = serde_json::to_string(&json!({
            "revision": dialogue.get("revision"),
            "characterId": dialogue.get("characterId"),
            "text": dialogue.get("text"),
            "typewriter": dialogue.get("typewriter"),
        }))
        .unwrap_or_default();
        if self
            .dialogue_reveal
            .as_ref()
            .map(|value| value.key.as_str())
            != Some(key.as_str())
        {
            self.dialogue_reveal = Some(DialogueReveal {
                key,
                started_at_ms: now_ms,
                total,
                visible: 0,
                reveal_on_advance: typewriter
                    .and_then(|value| value.get("revealOnAdvance"))
                    .and_then(Value::as_bool)
                    .unwrap_or(true),
                revealed_all: total == 0,
            });
        }
        if let Some(reveal) = self.dialogue_reveal.as_mut() {
            reveal.total = total;
            reveal.reveal_on_advance = typewriter
                .and_then(|value| value.get("revealOnAdvance"))
                .and_then(Value::as_bool)
                .unwrap_or(true);
        }
    }

    fn apply_dialogue(&mut self, view: &mut Map<String, Value>, now_ms: f64) -> bool {
        let Some(dialogue) = view.get_mut("dialogue").and_then(Value::as_object_mut) else {
            return false;
        };
        let Some(reveal) = self.dialogue_reveal.as_mut() else {
            return false;
        };
        if reveal.revealed_all {
            return false;
        }
        let duration = dialogue
            .get("typewriter")
            .and_then(Value::as_object)
            .and_then(|value| value.get("durationMs").and_then(Value::as_f64))
            .filter(|value| value.is_finite() && *value > 0.0)
            .or_else(|| {
                dialogue
                    .get("typewriter")
                    .and_then(Value::as_object)
                    .and_then(|value| value.get("charactersPerSecond").and_then(Value::as_f64))
                    .filter(|value| value.is_finite() && *value > 0.0)
                    .map(|cps| reveal.total as f64 / cps * 1000.0)
            })
            .unwrap_or_else(|| reveal.total as f64 / DEFAULT_TYPEWRITER_CPS * 1000.0);
        reveal.visible = ((now_ms - reveal.started_at_ms).max(0.0) / duration * reveal.total as f64)
            .ceil()
            .clamp(0.0, reveal.total as f64) as usize;
        if reveal.visible >= reveal.total {
            reveal.revealed_all = true;
            return false;
        }
        if let Some(text) = dialogue.get_mut("text") {
            slice_text(text, reveal.visible);
        }
        true
    }

    fn start_scene_transition(&mut self, payload: &Value, now_ms: f64) {
        let Some(to_scene) = payload.get("toScene").and_then(Value::as_str) else {
            return;
        };
        let transition = payload.get("transition").and_then(Value::as_object);
        let kind = transition
            .and_then(|value| value.get("type"))
            .and_then(Value::as_str)
            .unwrap_or("instant")
            .to_string();
        let duration_ms = transition
            .and_then(|value| value.get("duration").and_then(Value::as_f64))
            .filter(|value| value.is_finite() && *value >= 0.0)
            .unwrap_or(DEFAULT_TRANSITION_DURATION_MS);
        if kind == "instant" || duration_ms <= 0.0 {
            self.scene_transition = None;
            self.queue_scene_ready(to_scene, now_ms);
            return;
        }
        self.scene_transition = Some(SceneTransition {
            kind,
            to_scene: to_scene.to_string(),
            from_scene: payload
                .get("fromScene")
                .and_then(Value::as_str)
                .map(str::to_string),
            duration_ms,
            started_at_ms: now_ms,
            easing: transition
                .and_then(|value| value.get("easing"))
                .and_then(Value::as_str)
                .map(str::to_string),
        });
    }

    fn apply_scene_transition(&mut self, view: &mut Map<String, Value>, now_ms: f64) -> bool {
        let Some(active) = self.scene_transition.as_ref() else {
            view.remove("sceneTransition");
            return false;
        };
        let progress = ((now_ms - active.started_at_ms) / active.duration_ms).clamp(0.0, 1.0);
        let eased = animation::ease_progress(progress, active.easing.as_deref());
        if progress >= 1.0 {
            let scene = active.to_scene.clone();
            self.scene_transition = None;
            view.remove("sceneTransition");
            self.queue_scene_ready(&scene, now_ms);
            return false;
        }
        view.insert(
            "sceneTransition".to_string(),
            json!({
                "active": true,
                "type": active.kind,
                "fromScene": active.from_scene,
                "toScene": active.to_scene,
                "duration": active.duration_ms,
                "startedAt": active.started_at_ms,
                "progress": progress,
                "easedProgress": eased,
            }),
        );
        true
    }

    fn queue_scene_ready(&mut self, scene_id: &str, timestamp: f64) {
        self.pending_intents.push(NativeRendererIntent {
            r#type: "scene/ready".to_string(),
            payload_json: Some(
                json!({
                    "sceneId": scene_id,
                    "timestamp": timestamp,
                })
                .to_string(),
            ),
        });
    }
}

fn current_epoch_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
        * 1000.0
}

fn dialogue_text(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Object(object)) => object
            .get("blocks")
            .and_then(Value::as_array)
            .map(|blocks| {
                blocks
                    .iter()
                    .filter_map(|block| block.get("spans").and_then(Value::as_array))
                    .flatten()
                    .filter_map(|span| span.get("text").and_then(Value::as_str))
                    .collect::<String>()
            })
            .unwrap_or_default(),
        _ => String::new(),
    }
}

fn slice_text(value: &mut Value, visible: usize) {
    match value {
        Value::String(text) => *text = text.graphemes(true).take(visible).collect(),
        Value::Object(object) => {
            if let Some(blocks) = object.get_mut("blocks").and_then(Value::as_array_mut) {
                let mut remaining = visible;
                for block in blocks {
                    let Some(spans) = block.get_mut("spans").and_then(Value::as_array_mut) else {
                        continue;
                    };
                    for span in spans.iter_mut() {
                        let Some(text) =
                            span.get("text").and_then(Value::as_str).map(str::to_string)
                        else {
                            continue;
                        };
                        let count = text.graphemes(true).count();
                        let next: String = text.graphemes(true).take(remaining).collect();
                        span["text"] = Value::String(next);
                        remaining = remaining.saturating_sub(count);
                        if remaining == 0 {
                            break;
                        }
                    }
                }
            }
        }
        _ => {}
    }
}

pub(crate) fn set_path(object: &mut Map<String, Value>, path: &str, value: Value) {
    let keys: Vec<&str> = path.split('.').filter(|key| !key.is_empty()).collect();
    if keys.is_empty() {
        return;
    }
    let mut cursor = object;
    for key in &keys[..keys.len() - 1] {
        let entry = cursor
            .entry((*key).to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        if !entry.is_object() {
            *entry = Value::Object(Map::new());
        }
        cursor = entry.as_object_mut().expect("object inserted above");
    }
    cursor.insert(keys[keys.len() - 1].to_string(), value);
}

pub(crate) fn numeric_record(value: &Value) -> bool {
    value
        .as_object()
        .map(|record| record.values().all(|value| value.is_number()))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests;
