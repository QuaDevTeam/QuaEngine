mod animation;
pub mod easing;

use std::collections::BTreeMap;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use quajs_native_runtime::NativeRendererIntent;
use serde_json::{json, Map, Value};
use unicode_segmentation::UnicodeSegmentation;

const DEFAULT_TYPEWRITER_CPS: f64 = 36.0;
const DEFAULT_TRANSITION_DURATION_MS: f64 = 320.0;

// Presence transition durations, matching the web renderers.
const DIALOGUE_ENTER_MS: f64 = 220.0;
const DIALOGUE_EXIT_MS: f64 = 170.0;
const CHARACTER_ENTER_MS: f64 = 220.0;
const CHARACTER_EXIT_MS: f64 = 180.0;
const OVERLAY_ENTER_MS: f64 = 180.0;
const OVERLAY_EXIT_MS: f64 = 160.0;

#[derive(Clone, Copy, Debug, PartialEq)]
enum PresencePhase {
    Enter,
    Exit,
}

#[derive(Clone, Debug)]
struct PresenceRecord {
    phase: PresencePhase,
    started_at_ms: f64,
    duration_ms: f64,
    /// Snapshot of the JSON object to re-inject during exit fade.
    snapshot: Option<Value>,
}

impl PresenceRecord {
    fn entering(started_at_ms: f64, duration_ms: f64) -> Self {
        Self {
            phase: PresencePhase::Enter,
            started_at_ms,
            duration_ms,
            snapshot: None,
        }
    }

    fn exiting(started_at_ms: f64, duration_ms: f64, snapshot: Value) -> Self {
        Self {
            phase: PresencePhase::Exit,
            started_at_ms,
            duration_ms,
            snapshot: Some(snapshot),
        }
    }

    fn progress(&self, now_ms: f64) -> f64 {
        if self.duration_ms <= 0.0 {
            return 1.0;
        }
        ((now_ms - self.started_at_ms) / self.duration_ms).clamp(0.0, 1.0)
    }

    fn opacity(&self, now_ms: f64) -> f64 {
        let p = self.progress(now_ms);
        match self.phase {
            PresencePhase::Enter => p,
            PresencePhase::Exit => 1.0 - p,
        }
    }

    fn is_done(&self, now_ms: f64) -> bool {
        self.progress(now_ms) >= 1.0
    }
}

/// Tracks enter/exit presence transitions for dialogue, characters, and overlays.
/// Mirrors the logic in the web renderers' character/dialogue presence plugins.
#[derive(Debug, Default)]
struct PresenceState {
    /// Active dialogue transition record (enter or exit).
    dialogue: Option<PresenceRecord>,
    /// Whether dialogue was visible in the last synced frame.
    dialogue_visible: bool,
    /// Snapshot of the last visible dialogue JSON (used to re-inject during exit).
    dialogue_snapshot: Option<Value>,
    /// Active transitions keyed by character `id`.
    characters: BTreeMap<String, PresenceRecord>,
    /// Snapshots of characters visible in the last synced frame.
    known_characters: BTreeMap<String, Value>,
    /// Active transitions keyed by overlay `elementId`.
    overlays: BTreeMap<String, PresenceRecord>,
    /// Snapshots of overlays present in the last synced frame.
    known_overlays: BTreeMap<String, Value>,
}

impl PresenceState {
    fn has_active_work(&self, now_ms: f64) -> bool {
        self.dialogue.as_ref().is_some_and(|r| !r.is_done(now_ms))
            || self.characters.values().any(|r| !r.is_done(now_ms))
            || self.overlays.values().any(|r| !r.is_done(now_ms))
    }

    /// Number of enter/exit fades still in flight, for the dev performance HUD.
    fn active_transition_count(&self, now_ms: f64) -> usize {
        usize::from(self.dialogue.as_ref().is_some_and(|r| !r.is_done(now_ms)))
            + self
                .characters
                .values()
                .filter(|r| !r.is_done(now_ms))
                .count()
            + self.overlays.values().filter(|r| !r.is_done(now_ms)).count()
    }
}

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
    pub active_transition_count: usize,
    /// Target frame rate extracted from `view.renderer.targetFrameRate`, or
    /// `None` when absent/invalid. The native app threads this into the pacer.
    pub target_frame_rate: Option<u32>,
}

#[derive(Debug)]
pub struct NativeRendererProjectionRuntime {
    base_frame: Value,
    received_at: Instant,
    received_epoch_ms: f64,
    dialogue_reveal: Option<DialogueReveal>,
    scene_transition: Option<SceneTransition>,
    pending_intents: Vec<NativeRendererIntent>,
    cached_static_projection_json: Option<String>,
    presence: PresenceState,
    /// Renderer-local scroll offsets keyed by `"<elementId>/<nodeId>"`. The
    /// engine owns scroll *content*; the pointer-driven offset is transient
    /// renderer state, like the typewriter reveal, so wheel input does not need
    /// a round trip through QuickJS to move a scroll panel.
    scroll_offsets: BTreeMap<String, (f64, f64)>,
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
            cached_static_projection_json: None,
            presence: PresenceState::default(),
            scroll_offsets: BTreeMap::new(),
        };
        runtime.sync_dialogue(epoch);
        runtime.sync_presence(epoch);
        Ok(runtime)
    }

    pub fn replace_frame_json(&mut self, input: &str) -> Result<(), serde_json::Error> {
        self.base_frame = serde_json::from_str(input)?;
        self.received_at = Instant::now();
        self.received_epoch_ms = current_epoch_ms();
        self.cached_static_projection_json = None;
        self.sync_dialogue(self.received_epoch_ms);
        self.sync_presence(self.received_epoch_ms);
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
                self.cached_static_projection_json = None;
                self.sync_dialogue(self.received_epoch_ms);
                self.sync_presence(self.received_epoch_ms);
                Ok(true)
            }
            "scene/change" => {
                // Discard per-overlay scroll positions from the previous scene; they
                // are renderer-local state keyed by elementId/nodeId, which may not
                // exist in the incoming scene's overlay tree.
                if !self.scroll_offsets.is_empty() {
                    self.scroll_offsets.clear();
                    self.cached_static_projection_json = None;
                }
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

    pub fn font_prewarm_texts(&self) -> Vec<String> {
        let text = self
            .base_frame
            .pointer("/view/dialogue/text")
            .map(|value| dialogue_text(Some(value)))
            .unwrap_or_default();
        if text.is_empty() {
            Vec::new()
        } else {
            vec![text]
        }
    }

    pub fn project_now(&mut self) -> Result<NativeRendererProjectionFrame, serde_json::Error> {
        let elapsed = self.received_at.elapsed();
        self.project_at_epoch_ms(self.received_epoch_ms + elapsed.as_secs_f64() * 1000.0)
    }

    pub fn project_at_epoch_ms(
        &mut self,
        now_ms: f64,
    ) -> Result<NativeRendererProjectionFrame, serde_json::Error> {
        let has_animations = self
            .base_frame
            .pointer("/view/animations")
            .and_then(Value::as_array)
            .is_some_and(|animations| !animations.is_empty());
        let has_dialogue_work = self
            .dialogue_reveal
            .as_ref()
            .is_some_and(|reveal| !reveal.revealed_all);
        let has_presence_work = self.presence.has_active_work(now_ms);
        if !has_animations
            && !has_dialogue_work
            && !has_presence_work
            && self.scene_transition.is_none()
        {
            let target_frame_rate = self.read_target_frame_rate();
            if let Some(json) = self.cached_static_projection_json.clone() {
                return Ok(NativeRendererProjectionFrame {
                    json,
                    local_work_active: false,
                    active_transition_count: 0,
                    target_frame_rate,
                });
            }
            let mut frame = self.base_frame.clone();
            if let Some(view) = frame.get_mut("view").and_then(Value::as_object_mut) {
                view.remove("animations");
                apply_scroll_offsets(view, &self.scroll_offsets);
            }
            let json = serde_json::to_string(&frame)?;
            self.cached_static_projection_json = Some(json.clone());
            return Ok(NativeRendererProjectionFrame {
                json,
                local_work_active: false,
                active_transition_count: 0,
                target_frame_rate,
            });
        }
        let presence_transitions = self.presence.active_transition_count(now_ms);
        let dialogue_transitions = usize::from(has_dialogue_work);
        let scene_transitions = usize::from(self.scene_transition.is_some());
        let mut frame = self.base_frame.clone();
        let mut local_work_active = false;
        let mut animation_transitions = 0;
        if let Some(view) = frame.get_mut("view").and_then(Value::as_object_mut) {
            let animations = view.get("animations").cloned().unwrap_or(Value::Null);
            animation_transitions = animation::apply_animations(view, &animations, now_ms);
            local_work_active |= animation_transitions > 0;
            local_work_active |= self.apply_dialogue(view, now_ms);
            local_work_active |= self.apply_presence(view, now_ms);
            local_work_active |= self.apply_scene_transition(view, now_ms);
            apply_scroll_offsets(view, &self.scroll_offsets);
            view.remove("animations");
        }
        Ok(NativeRendererProjectionFrame {
            json: serde_json::to_string(&frame)?,
            local_work_active,
            active_transition_count: animation_transitions
                + presence_transitions
                + dialogue_transitions
                + scene_transitions,
            target_frame_rate: self.read_target_frame_rate(),
        })
    }

    /// Reads `view.renderer.targetFrameRate` from the base frame. Returns
    /// `None` for absent, non-numeric, non-finite, or out-of-range values.
    pub fn read_target_frame_rate(&self) -> Option<u32> {
        let fps = self
            .base_frame
            .pointer("/view/renderer/targetFrameRate")
            .and_then(Value::as_f64)?;
        if !fps.is_finite() || fps < 1.0 || fps > 240.0 {
            return None;
        }
        Some(fps.round() as u32)
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

    /// Scrolls the innermost scroll container in the current overlay tree that
    /// contains the given client-coordinate point.  `client_x`/`client_y` are
    /// in CSS logical pixels relative to the surface origin.  Returns `true`
    /// when a scroll node was found and its offset actually changed.
    pub fn scroll_at_client(
        &mut self,
        client_x: f64,
        client_y: f64,
        delta_x: f64,
        delta_y: f64,
    ) -> bool {
        if delta_x == 0.0 && delta_y == 0.0 {
            return false;
        }
        // Walk view.ui.overlays to find the innermost Scroll node under the point.
        let Some(overlays) = self
            .base_frame
            .pointer("/view/ui/overlays")
            .and_then(Value::as_array)
        else {
            return false;
        };
        // Build a candidate list: (elementId, nodeId, max_scroll_x, max_scroll_y,
        //                          current_offset_x, current_offset_y, depth)
        let mut best: Option<(String, f64, f64, f64, f64)> = None;
        for overlay in overlays {
            let element_id = overlay.get("elementId").and_then(Value::as_str).unwrap_or("");
            if let Some(surface) = overlay.get("surface") {
                if let Some(root) = surface.get("root") {
                    find_scroll_node(root, client_x, client_y, element_id, 0.0, 0.0, &mut best);
                }
            }
        }
        let Some((key, _json_cur_x, _json_cur_y, max_x, max_y)) = best else {
            return false;
        };
        // The authoritative current offset lives in `self.scroll_offsets`, not
        // in the base-frame JSON (which never has scrollOffsetX/Y written back).
        let (cur_x, cur_y) = self.scroll_offsets.get(&key).copied().unwrap_or((0.0, 0.0));
        let new_x = (cur_x + delta_x).clamp(0.0, max_x.max(0.0));
        let new_y = (cur_y + delta_y).clamp(0.0, max_y.max(0.0));
        if (new_x - cur_x).abs() < 0.01 && (new_y - cur_y).abs() < 0.01 {
            return false;
        }
        self.scroll_offsets.insert(key, (new_x, new_y));
        self.cached_static_projection_json = None;
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

    /// Diffs the new `base_frame` against the last known presence state and
    /// starts enter/exit transitions for dialogue, characters, and overlays.
    /// Must be called after `base_frame` is updated.
    fn sync_presence(&mut self, now_ms: f64) {
        // --- Dialogue ---
        let new_dialogue_visible = self
            .base_frame
            .pointer("/view/dialogue")
            .and_then(Value::as_object)
            .map(|d| d.get("visible").and_then(Value::as_bool) != Some(false))
            .unwrap_or(false);
        let new_dialogue_snapshot = if new_dialogue_visible {
            self.base_frame.pointer("/view/dialogue").cloned()
        } else {
            None
        };

        if new_dialogue_visible && !self.presence.dialogue_visible {
            // Invisible → visible: enter transition.
            self.presence.dialogue = Some(PresenceRecord::entering(now_ms, DIALOGUE_ENTER_MS));
        } else if !new_dialogue_visible && self.presence.dialogue_visible {
            // Visible → invisible: exit transition using the last snapshot.
            if let Some(snapshot) = self.presence.dialogue_snapshot.take() {
                self.presence.dialogue =
                    Some(PresenceRecord::exiting(now_ms, DIALOGUE_EXIT_MS, snapshot));
            } else {
                self.presence.dialogue = None;
            }
        }
        if let Some(s) = new_dialogue_snapshot {
            self.presence.dialogue_snapshot = Some(s);
        }
        self.presence.dialogue_visible = new_dialogue_visible;

        // --- Characters ---
        let new_characters: BTreeMap<String, Value> = self
            .base_frame
            .pointer("/view/characters")
            .and_then(Value::as_array)
            .map(|chars| {
                chars
                    .iter()
                    .filter_map(|c| {
                        let id = c.get("id").and_then(Value::as_str)?;
                        if c.get("visible").and_then(Value::as_bool) == Some(false) {
                            return None;
                        }
                        Some((id.to_string(), c.clone()))
                    })
                    .collect()
            })
            .unwrap_or_default();

        // Characters that were known and are now gone → exit.
        let old_char_ids: Vec<(String, Value)> = self
            .presence
            .known_characters
            .iter()
            .filter(|(id, _)| !new_characters.contains_key(*id))
            .map(|(id, snap)| (id.clone(), snap.clone()))
            .collect();
        for (id, snapshot) in old_char_ids {
            let already_exiting = self
                .presence
                .characters
                .get(&id)
                .is_some_and(|r| r.phase == PresencePhase::Exit);
            if !already_exiting {
                self.presence.characters.insert(
                    id,
                    PresenceRecord::exiting(now_ms, CHARACTER_EXIT_MS, snapshot),
                );
            }
        }
        // New characters → enter.
        let new_char_ids: Vec<String> = new_characters
            .keys()
            .filter(|id| !self.presence.known_characters.contains_key(*id))
            .cloned()
            .collect();
        for id in new_char_ids {
            let should_enter = self
                .presence
                .characters
                .get(&id)
                .map_or(true, |r| r.phase == PresencePhase::Exit);
            if should_enter {
                self.presence
                    .characters
                    .insert(id, PresenceRecord::entering(now_ms, CHARACTER_ENTER_MS));
            }
        }
        self.presence.known_characters = new_characters;

        // --- Overlays ---
        let new_overlays: BTreeMap<String, Value> = self
            .base_frame
            .pointer("/view/ui/overlays")
            .and_then(Value::as_array)
            .map(|overlays| {
                overlays
                    .iter()
                    .filter_map(|o| {
                        let id = o.get("elementId").and_then(Value::as_str)?;
                        Some((id.to_string(), o.clone()))
                    })
                    .collect()
            })
            .unwrap_or_default();

        // Overlays that were known and are now gone → exit.
        let old_overlay_ids: Vec<(String, Value)> = self
            .presence
            .known_overlays
            .iter()
            .filter(|(id, _)| !new_overlays.contains_key(*id))
            .map(|(id, snap)| (id.clone(), snap.clone()))
            .collect();
        for (id, snapshot) in old_overlay_ids {
            let already_exiting = self
                .presence
                .overlays
                .get(&id)
                .is_some_and(|r| r.phase == PresencePhase::Exit);
            if !already_exiting {
                self.presence.overlays.insert(
                    id,
                    PresenceRecord::exiting(now_ms, OVERLAY_EXIT_MS, snapshot),
                );
            }
        }
        // New overlays → enter.
        let new_overlay_ids: Vec<String> = new_overlays
            .keys()
            .filter(|id| !self.presence.known_overlays.contains_key(*id))
            .cloned()
            .collect();
        for id in new_overlay_ids {
            let should_enter = self
                .presence
                .overlays
                .get(&id)
                .map_or(true, |r| r.phase == PresencePhase::Exit);
            if should_enter {
                self.presence
                    .overlays
                    .insert(id, PresenceRecord::entering(now_ms, OVERLAY_ENTER_MS));
            }
        }
        self.presence.known_overlays = new_overlays;
    }

    /// Injects `presenceOpacity` into dialogue, characters, and overlays that
    /// are currently in an enter/exit transition.  Exiting items are
    /// re-injected from their stored snapshot so the renderer keeps them
    /// visible while they fade out.  Returns `true` while any transition is
    /// still running.
    fn apply_presence(&mut self, view: &mut Map<String, Value>, now_ms: f64) -> bool {
        let mut active = false;

        // --- Dialogue ---
        if let Some(record) = self.presence.dialogue.clone() {
            let opacity = record.opacity(now_ms);
            let done = record.is_done(now_ms);
            match record.phase {
                PresencePhase::Enter => {
                    if !done {
                        active = true;
                        if let Some(d) = view.get_mut("dialogue").and_then(Value::as_object_mut) {
                            d.insert("presenceOpacity".to_string(), json!(opacity));
                        }
                    }
                }
                PresencePhase::Exit => {
                    if let Some(mut snapshot) = record.snapshot.clone() {
                        if let Some(obj) = snapshot.as_object_mut() {
                            obj.insert("presenceOpacity".to_string(), json!(opacity));
                            obj.insert("visible".to_string(), json!(true));
                        }
                        view.insert("dialogue".to_string(), snapshot);
                        if !done {
                            active = true;
                        }
                    }
                }
            }
            if done {
                self.presence.dialogue = None;
            }
        }

        // --- Characters ---
        let char_records: Vec<(String, PresenceRecord)> = self
            .presence
            .characters
            .iter()
            .map(|(id, r)| (id.clone(), r.clone()))
            .collect();
        let mut done_chars: Vec<String> = Vec::new();
        for (id, record) in &char_records {
            let opacity = record.opacity(now_ms);
            let done = record.is_done(now_ms);
            match record.phase {
                PresencePhase::Enter => {
                    if !done {
                        active = true;
                        if let Some(characters) =
                            view.get_mut("characters").and_then(Value::as_array_mut)
                        {
                            if let Some(c) = characters
                                .iter_mut()
                                .find(|c| c.get("id").and_then(Value::as_str) == Some(id.as_str()))
                                .and_then(Value::as_object_mut)
                            {
                                c.insert("presenceOpacity".to_string(), json!(opacity));
                            }
                        }
                    }
                }
                PresencePhase::Exit => {
                    if let Some(mut snapshot) = record.snapshot.clone() {
                        if let Some(obj) = snapshot.as_object_mut() {
                            obj.insert("presenceOpacity".to_string(), json!(opacity));
                            obj.insert("visible".to_string(), json!(true));
                        }
                        let characters = view
                            .entry("characters".to_string())
                            .or_insert_with(|| json!([]));
                        if let Some(arr) = characters.as_array_mut() {
                            if let Some(c) = arr
                                .iter_mut()
                                .find(|c| c.get("id").and_then(Value::as_str) == Some(id.as_str()))
                                .and_then(Value::as_object_mut)
                            {
                                c.insert("presenceOpacity".to_string(), json!(opacity));
                                c.insert("visible".to_string(), json!(true));
                            } else {
                                arr.push(snapshot);
                            }
                        }
                        if !done {
                            active = true;
                        }
                    }
                }
            }
            if done {
                done_chars.push(id.clone());
            }
        }
        for id in done_chars {
            self.presence.characters.remove(&id);
        }

        // --- Overlays ---
        let overlay_records: Vec<(String, PresenceRecord)> = self
            .presence
            .overlays
            .iter()
            .map(|(id, r)| (id.clone(), r.clone()))
            .collect();
        let mut done_overlays: Vec<String> = Vec::new();
        for (id, record) in &overlay_records {
            let opacity = record.opacity(now_ms);
            let done = record.is_done(now_ms);
            match record.phase {
                PresencePhase::Enter => {
                    if !done {
                        active = true;
                        if let Some(overlays) = view
                            .get_mut("ui")
                            .and_then(|ui| ui.get_mut("overlays"))
                            .and_then(Value::as_array_mut)
                        {
                            if let Some(o) = overlays
                                .iter_mut()
                                .find(|o| {
                                    o.get("elementId").and_then(Value::as_str) == Some(id.as_str())
                                })
                                .and_then(Value::as_object_mut)
                            {
                                o.insert("presenceOpacity".to_string(), json!(opacity));
                            }
                        }
                    }
                }
                PresencePhase::Exit => {
                    if let Some(mut snapshot) = record.snapshot.clone() {
                        if let Some(obj) = snapshot.as_object_mut() {
                            obj.insert("presenceOpacity".to_string(), json!(opacity));
                        }
                        if let Some(ui) = view.get_mut("ui").and_then(Value::as_object_mut) {
                            let overlays = ui
                                .entry("overlays".to_string())
                                .or_insert_with(|| json!([]));
                            if let Some(arr) = overlays.as_array_mut() {
                                if let Some(o) = arr
                                    .iter_mut()
                                    .find(|o| {
                                        o.get("elementId").and_then(Value::as_str)
                                            == Some(id.as_str())
                                    })
                                    .and_then(Value::as_object_mut)
                                {
                                    o.insert("presenceOpacity".to_string(), json!(opacity));
                                } else {
                                    arr.push(snapshot);
                                }
                            }
                        }
                        if !done {
                            active = true;
                        }
                    }
                }
            }
            if done {
                done_overlays.push(id.clone());
            }
        }
        for id in done_overlays {
            self.presence.overlays.remove(&id);
        }

        active
    }
}

/// Depth-first search for the innermost `"Scroll"` node that contains
/// `(hit_x, hit_y)`.  `acc_*` carry the accumulated scroll offsets of
/// ancestor scroll nodes so the hit-test uses the node's rendered position.
/// Writes `(key, cur_x, cur_y, content_extent_x, content_extent_y)` into
/// `best` when a candidate is found.
fn find_scroll_node(
    node: &Value,
    hit_x: f64,
    hit_y: f64,
    element_id: &str,
    acc_scroll_x: f64,
    acc_scroll_y: f64,
    best: &mut Option<(String, f64, f64, f64, f64)>,
) {
    let bounds = match (
        node.get("bounds").and_then(|b| b.get("x")).and_then(Value::as_f64),
        node.get("bounds").and_then(|b| b.get("y")).and_then(Value::as_f64),
        node.get("bounds").and_then(|b| b.get("width")).and_then(Value::as_f64),
        node.get("bounds").and_then(|b| b.get("height")).and_then(Value::as_f64),
    ) {
        (Some(x), Some(y), Some(w), Some(h)) => (x, y, w, h),
        _ => return,
    };
    let (x, y, w, h) = bounds;
    // The node's rendered position accounts for ancestor scroll offsets.
    let rendered_x = x - acc_scroll_x;
    let rendered_y = y - acc_scroll_y;
    let inside = hit_x >= rendered_x
        && hit_x <= rendered_x + w
        && hit_y >= rendered_y
        && hit_y <= rendered_y + h;
    let is_scroll = node.get("kind").and_then(Value::as_str) == Some("Scroll");
    let node_id = node.get("id").and_then(Value::as_str).unwrap_or("");
    let (next_acc_x, next_acc_y) = if is_scroll {
        let cur_x = node
            .get("scrollOffsetX")
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        let cur_y = node
            .get("scrollOffsetY")
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        if inside && !node_id.is_empty() {
            // Estimate content extent from children bounds.
            let extent_x = children_max_right(node, acc_scroll_x) - x;
            let extent_y = children_max_bottom(node, acc_scroll_y) - y;
            let max_x = (extent_x - w).max(0.0);
            let max_y = (extent_y - h).max(0.0);
            let key = format!("{element_id}/{node_id}");
            *best = Some((key, cur_x, cur_y, max_x, max_y));
        }
        (acc_scroll_x + cur_x, acc_scroll_y + cur_y)
    } else {
        (acc_scroll_x, acc_scroll_y)
    };
    if let Some(children) = node.get("children").and_then(Value::as_array) {
        for child in children {
            find_scroll_node(child, hit_x, hit_y, element_id, next_acc_x, next_acc_y, best);
        }
    }
}

fn children_max_right(node: &Value, acc_x: f64) -> f64 {
    node.get("children")
        .and_then(Value::as_array)
        .map(|children| {
            children
                .iter()
                .filter_map(|child| {
                    let x = child.get("bounds").and_then(|b| b.get("x")).and_then(Value::as_f64)?;
                    let w = child.get("bounds").and_then(|b| b.get("width")).and_then(Value::as_f64)?;
                    Some(x + w - acc_x)
                })
                .fold(0.0_f64, f64::max)
        })
        .unwrap_or(0.0)
}

fn children_max_bottom(node: &Value, acc_y: f64) -> f64 {
    node.get("children")
        .and_then(Value::as_array)
        .map(|children| {
            children
                .iter()
                .filter_map(|child| {
                    let y = child.get("bounds").and_then(|b| b.get("y")).and_then(Value::as_f64)?;
                    let h = child.get("bounds").and_then(|b| b.get("height")).and_then(Value::as_f64)?;
                    Some(y + h - acc_y)
                })
                .fold(0.0_f64, f64::max)
        })
        .unwrap_or(0.0)
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
                        // Once the budget is exhausted every subsequent span must be
                        // cleared, not left with its original text.
                        if remaining == 0 {
                            span["text"] = Value::String(String::new());
                            continue;
                        }
                        let Some(text) =
                            span.get("text").and_then(Value::as_str).map(str::to_string)
                        else {
                            continue;
                        };
                        // Single-pass: collect graphemes once, then both count and
                        // slice from the same Vec — avoids a second O(n) scan.
                        let graphemes: Vec<&str> = text.graphemes(true).collect();
                        let count = graphemes.len();
                        let next: String = graphemes.into_iter().take(remaining).collect();
                        span["text"] = Value::String(next);
                        remaining = remaining.saturating_sub(count);
                    }
                }
            }
        }
        _ => {}
    }
}

/// Writes the renderer-local scroll offsets stored in `scroll_offsets` into
/// the matching `Scroll` nodes in the projected view JSON so the renderer
/// deserialises the correct `scroll_offset_x`/`scroll_offset_y` values.
///
/// The `scroll_offsets` map uses the key `"{element_id}/{node_id}"`.  We walk
/// every UI overlay's surface tree and patch any node whose composite key
/// appears in the map.
fn apply_scroll_offsets(view: &mut Map<String, Value>, scroll_offsets: &BTreeMap<String, (f64, f64)>) {
    if scroll_offsets.is_empty() {
        return;
    }
    let Some(overlays) = view
        .get_mut("ui")
        .and_then(|ui| ui.get_mut("overlays"))
        .and_then(Value::as_array_mut)
    else {
        return;
    };
    for overlay in overlays.iter_mut() {
        let Some(element_id) = overlay
            .get("elementId")
            .and_then(Value::as_str)
            .map(str::to_string)
        else {
            continue;
        };
        let Some(root) = overlay
            .get_mut("surface")
            .and_then(|s| s.get_mut("root"))
        else {
            continue;
        };
        inject_scroll_offsets_into_node(root, &element_id, scroll_offsets);
    }
}

/// Recursively walks a surface node tree and injects scroll offsets for any
/// node whose `"{element_id}/{node.id}"` key is present in `scroll_offsets`.
fn inject_scroll_offsets_into_node(
    node: &mut Value,
    element_id: &str,
    scroll_offsets: &BTreeMap<String, (f64, f64)>,
) {
    let node_id = match node.get("id").and_then(Value::as_str) {
        Some(id) => id.to_string(),
        None => return,
    };
    let key = format!("{element_id}/{node_id}");
    if let Some(&(offset_x, offset_y)) = scroll_offsets.get(&key) {
        if let Some(obj) = node.as_object_mut() {
            // Only write non-zero offsets — zero is the serde default and writing
            // it wastes JSON bytes without changing behaviour.
            if offset_x != 0.0 {
                obj.insert("scrollOffsetX".to_string(), json!(offset_x));
            } else {
                obj.remove("scrollOffsetX");
            }
            if offset_y != 0.0 {
                obj.insert("scrollOffsetY".to_string(), json!(offset_y));
            } else {
                obj.remove("scrollOffsetY");
            }
        }
    }
    if let Some(children) = node.get_mut("children").and_then(Value::as_array_mut) {
        for child in children.iter_mut() {
            inject_scroll_offsets_into_node(child, element_id, scroll_offsets);
        }
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
