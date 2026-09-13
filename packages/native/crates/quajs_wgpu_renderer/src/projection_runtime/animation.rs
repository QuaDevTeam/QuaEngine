use serde_json::{Map, Value};

use super::{numeric_record, set_path};

/// Applies every resolved animation track to `view` and returns how many
/// animations are still running. The count feeds the dev performance HUD, and a
/// non-zero count means the renderer still owes more frames.
pub fn apply_animations(view: &mut Map<String, Value>, animations: &Value, now_ms: f64) -> usize {
    let Some(animations) = animations.as_array() else {
        return 0;
    };
    // Supplied timelines replace prior derived samples. Frames with no timeline
    // field may already have been sampled by the fixed-time TS serializer.
    if let Some(characters) = view.get_mut("characters").and_then(Value::as_array_mut) {
        for character in characters.iter_mut().filter_map(Value::as_object_mut) {
            character.remove("spriteLayerAnimationValues");
        }
    }
    let mut active = 0usize;
    for animation in animations {
        let Some(animation) = animation.as_object() else {
            continue;
        };
        if local_is_active(animation, now_ms) {
            active += 1;
        }
        let Some(elapsed) = local_time(animation, now_ms) else {
            continue;
        };
        let Some(tracks) = animation.get("resolvedTracks").and_then(Value::as_array) else {
            continue;
        };
        for track in tracks {
            let Some(track) = track.as_object() else {
                continue;
            };
            let Some(target) = track.get("target").and_then(Value::as_str) else {
                continue;
            };
            let Some(property) = track.get("property").and_then(Value::as_str) else {
                continue;
            };
            let Some(value) = track_value(
                track,
                elapsed,
                animation
                    .get("duration")
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0),
            ) else {
                continue;
            };
            if target.starts_with("spriteLayer:") {
                crate::projection::character::animation::collect_sample(
                    view, target, property, &value,
                );
                continue;
            }
            for target_object in target_objects(view, target) {
                if target.starts_with("richText")
                    && !property.starts_with("style.")
                    && matches!(
                        property,
                        "color"
                            | "fontFamily"
                            | "fontSize"
                            | "fontWeight"
                            | "lineHeight"
                            | "textAlign"
                    )
                {
                    let value = if property == "lineHeight" && value.is_number() {
                        Value::String(value.to_string())
                    } else if property == "fontWeight" && value.is_number() {
                        // Native font selection uses integral OpenType weights.
                        Value::from(value.as_f64().unwrap().round().clamp(1.0, 1000.0) as u16)
                    } else if property == "fontFamily" && value.is_string() {
                        Value::Array(vec![value.clone()])
                    } else {
                        value.clone()
                    };
                    set_path(target_object, &format!("style.{property}"), value);
                } else {
                    set_path(target_object, property, value.clone());
                }
            }
        }
    }
    active
}

fn target_objects<'a>(
    view: &'a mut Map<String, Value>,
    target: &str,
) -> Vec<&'a mut Map<String, Value>> {
    // Match the shared projection roots. Rich text may select the same span id
    // in multiple blocks and must update visible and full-layout documents.
    let mut result = Vec::new();
    if target.starts_with("richText") {
        let parts: Vec<_> = target.split(':').collect();
        let fields = match parts.get(1).copied() {
            Some("dialogue") => ["text", "layoutText"],
            Some("speaker") => ["speaker", "layoutSpeaker"],
            _ => return result,
        };
        let Some(dialogue) = view.get_mut("dialogue").and_then(Value::as_object_mut) else {
            return result;
        };
        for (key, value) in dialogue.iter_mut() {
            if fields.contains(&key.as_str()) {
                result.extend(rich_text_targets(value, &parts));
            }
        }
    } else if matches!(target, "stage:main" | "camera:main") {
        let key = target.split(':').next().unwrap();
        let root = view.entry(key).or_insert_with(|| Value::Object(Map::new()));
        if let Some(object) = root.as_object_mut() {
            result.push(object);
        }
    } else if target == "background:main" {
        if let Some(object) = view.get_mut("background").and_then(Value::as_object_mut) {
            result.push(object);
        }
    } else if let Some(id) = target.strip_prefix("backgroundLayer:") {
        if let Some(layers) = view
            .get_mut("background")
            .and_then(|value| value.get_mut("layers"))
            .and_then(Value::as_array_mut)
        {
            if let Some(object) = layers
                .iter_mut()
                .find(|layer| layer.get("id").and_then(Value::as_str) == Some(id))
                .and_then(Value::as_object_mut)
            {
                result.push(object);
            }
        }
    } else if let Some(id) = target.strip_prefix("character:") {
        if let Some(characters) = view.get_mut("characters").and_then(Value::as_array_mut) {
            if let Some(object) = characters
                .iter_mut()
                .find(|character| character.get("id").and_then(Value::as_str) == Some(id))
                .and_then(Value::as_object_mut)
            {
                result.push(object);
            }
        }
    } else if target == "dialogue:box" {
        if let Some(object) = view.get_mut("dialogue").and_then(Value::as_object_mut) {
            result.push(object);
        }
    } else if target == "choices:panel" {
        if let Some(object) = view.get_mut("choices").and_then(Value::as_object_mut) {
            result.push(object);
        }
    } else if let Some(id) = target.strip_prefix("choice:") {
        if let Some(choices) = view
            .get_mut("choices")
            .and_then(|value| value.get_mut("choices"))
            .and_then(Value::as_array_mut)
        {
            if let Some(object) = choices
                .iter_mut()
                .find(|choice| choice.get("id").and_then(Value::as_str) == Some(id))
                .and_then(Value::as_object_mut)
            {
                result.push(object);
            }
        }
    } else if let Some(id) = target.strip_prefix("effect:") {
        if let Some(effects) = view.get_mut("effects").and_then(Value::as_array_mut) {
            if let Some(object) = effects
                .iter_mut()
                .find(|effect| effect.get("id").and_then(Value::as_str) == Some(id))
                .and_then(Value::as_object_mut)
            {
                result.push(object);
            }
        }
    } else if let Some(id) = target.strip_prefix("ui:") {
        if let Some(overlays) = view
            .get_mut("ui")
            .and_then(|value| value.get_mut("overlays"))
            .and_then(Value::as_array_mut)
        {
            if let Some(object) = overlays
                .iter_mut()
                .find(|overlay| overlay.get("elementId").and_then(Value::as_str) == Some(id))
                .and_then(Value::as_object_mut)
            {
                result.push(object);
            }
        }
    }
    result
}

fn rich_text_targets<'a>(value: &'a mut Value, parts: &[&str]) -> Vec<&'a mut Map<String, Value>> {
    let mut result = Vec::new();
    let Some(document) = value.as_object_mut() else {
        return result;
    };
    if parts == ["richText", "dialogue"] || parts == ["richText", "speaker"] {
        result.push(document);
        return result;
    }
    let Some(id) = parts
        .get(2..)
        .filter(|p| !p.is_empty())
        .map(|p| p.join(":"))
    else {
        return result;
    };
    let Some(blocks) = document.get_mut("blocks").and_then(Value::as_array_mut) else {
        return result;
    };
    for (index, block) in blocks.iter_mut().enumerate() {
        let Some(block) = block.as_object_mut() else {
            continue;
        };
        if parts[0] == "richTextBlock" {
            if rich_text_id_matches(block, index, &id) {
                result.push(block);
            }
        } else if parts[0] == "richTextSpan" {
            // Shared render-core targets a span id (or its index within each
            // block), without a block-id segment. Repeated ids match each block.
            if let Some(spans) = block.get_mut("spans").and_then(Value::as_array_mut) {
                for (index, span) in spans.iter_mut().enumerate() {
                    if let Some(span) = span
                        .as_object_mut()
                        .filter(|s| rich_text_id_matches(s, index, &id))
                    {
                        result.push(span);
                    }
                }
            }
        }
    }
    result
}

fn rich_text_id_matches(object: &Map<String, Value>, index: usize, id: &str) -> bool {
    object
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .map_or_else(|| index.to_string() == id, |value| value == id)
}

fn local_time(animation: &Map<String, Value>, now_ms: f64) -> Option<f64> {
    let started = animation.get("startedAt").and_then(Value::as_f64)?;
    let duration = animation
        .get("duration")
        .and_then(Value::as_f64)
        .unwrap_or(0.0)
        .max(0.0);
    let playback_rate = animation
        .get("playbackRate")
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(1.0);
    let delay = animation
        .get("delay")
        .and_then(Value::as_f64)
        .unwrap_or(0.0)
        .max(0.0);
    if animation.get("state").and_then(Value::as_str) == Some("stopped")
        && animation.get("endedAt").and_then(Value::as_f64).is_none()
    {
        return None;
    }
    let wall = if animation.get("state").and_then(Value::as_str) == Some("paused") {
        animation
            .get("pausedAt")
            .and_then(Value::as_f64)
            .unwrap_or(now_ms)
            - started
    } else if animation.get("state").and_then(Value::as_str) == Some("stopped") {
        animation
            .get("endedAt")
            .and_then(Value::as_f64)
            .unwrap_or(now_ms)
            - started
    } else {
        now_ms - started
    };
    let timeline = (wall * playback_rate).max(0.0);
    if timeline < delay {
        return if matches!(
            animation.get("fill").and_then(Value::as_str),
            Some("backwards") | Some("both")
        ) {
            Some(direction(0.0, duration, 0, animation))
        } else {
            None
        };
    }
    if duration <= 0.0 {
        return Some(0.0);
    }
    let active = timeline - delay;
    let loops = match animation.get("loop") {
        Some(Value::Bool(true)) => f64::INFINITY,
        Some(Value::Number(value)) => value.as_f64().unwrap_or(1.0).max(1.0),
        _ => 1.0,
    };
    if active >= duration * loops {
        return if matches!(
            animation
                .get("fill")
                .and_then(Value::as_str)
                .unwrap_or("forwards"),
            "forwards" | "both"
        ) {
            Some(direction(duration, duration, loops as usize - 1, animation))
        } else {
            None
        };
    }
    let iteration = (active / duration).floor() as usize;
    Some(direction(
        active - iteration as f64 * duration,
        duration,
        iteration,
        animation,
    ))
}

fn local_is_active(animation: &Map<String, Value>, now_ms: f64) -> bool {
    let Some(started) = animation.get("startedAt").and_then(Value::as_f64) else {
        return false;
    };
    if matches!(
        animation.get("state").and_then(Value::as_str),
        Some("paused") | Some("stopped")
    ) {
        return false;
    }
    let duration = animation
        .get("duration")
        .and_then(Value::as_f64)
        .unwrap_or(0.0)
        .max(0.0);
    let delay = animation
        .get("delay")
        .and_then(Value::as_f64)
        .unwrap_or(0.0)
        .max(0.0);
    let loops = match animation.get("loop") {
        Some(Value::Bool(true)) => f64::INFINITY,
        Some(Value::Number(value)) => value.as_f64().unwrap_or(1.0).max(1.0),
        _ => 1.0,
    };
    let playback_rate = animation
        .get("playbackRate")
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(1.0);
    now_ms < started + (delay + duration * loops) / playback_rate
}

fn direction(local: f64, duration: f64, iteration: usize, animation: &Map<String, Value>) -> f64 {
    let direction = animation
        .get("direction")
        .and_then(Value::as_str)
        .unwrap_or("normal");
    let reversed = direction == "reverse"
        || (direction == "alternate" && iteration % 2 == 1)
        || (direction == "alternate-reverse" && iteration % 2 == 0);
    if reversed {
        duration - local
    } else {
        local
    }
}

fn track_value(track: &Map<String, Value>, elapsed: f64, duration: f64) -> Option<Value> {
    let frames = track.get("keyframes").and_then(Value::as_array)?;
    if frames.is_empty() {
        return None;
    }
    if frames.len() == 1 {
        return frames[0].get("value").cloned();
    }
    let mut frames = frames.clone();
    frames.sort_by(|left, right| {
        at(left.get("at"), duration)
            .partial_cmp(&at(right.get("at"), duration))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    if elapsed <= at(frames[0].get("at"), duration) {
        return frames[0].get("value").cloned();
    }
    for index in 1..frames.len() {
        let previous = &frames[index - 1];
        let next = &frames[index];
        let previous_at = at(previous.get("at"), duration);
        let next_at = at(next.get("at"), duration);
        if elapsed <= next_at {
            if elapsed == next_at {
                return next.get("value").cloned();
            }
            if matches!(
                track.get("interpolation").and_then(Value::as_str),
                Some("step") | Some("discrete")
            ) {
                return previous.get("value").cloned();
            }
            let progress = if next_at == previous_at {
                1.0
            } else {
                (elapsed - previous_at) / (next_at - previous_at)
            };
            return interpolate(
                previous.get("value")?,
                next.get("value")?,
                timeline_ease_progress(
                    progress,
                    next.get("easing")
                        .and_then(Value::as_str)
                        .or_else(|| previous.get("easing").and_then(Value::as_str)),
                ),
                track.get("interpolation").and_then(Value::as_str),
            );
        }
    }
    frames.last().and_then(|frame| frame.get("value").cloned())
}

fn at(value: Option<&Value>, duration: f64) -> f64 {
    match value {
        Some(Value::Number(number)) => number.as_f64().unwrap_or(0.0),
        Some(Value::String(value)) => {
            value.trim_end_matches('%').parse::<f64>().unwrap_or(0.0) / 100.0 * duration
        }
        _ => 0.0,
    }
}

fn interpolate(
    from: &Value,
    to: &Value,
    progress: f64,
    interpolation: Option<&str>,
) -> Option<Value> {
    let p = progress.clamp(0.0, 1.0);
    if let (Some(left), Some(right)) = (from.as_f64(), to.as_f64()) {
        return Some(Value::from(left + (right - left) * p));
    }
    if matches!(interpolation, Some("array") | Some("vector")) {
        if let (Some(left), Some(right)) = (from.as_array(), to.as_array()) {
            if left.len() != right.len() {
                return Some(to.clone());
            }
            return Some(Value::Array(
                left.iter()
                    .zip(right)
                    .map(|(a, b)| interpolate(a, b, p, None).unwrap_or_else(|| b.clone()))
                    .collect(),
            ));
        }
        if numeric_record(from) && numeric_record(to) {
            let mut result = to.as_object().cloned().unwrap_or_default();
            for (key, right) in to.as_object()? {
                if let (Some(left), Some(right)) =
                    (from.get(key).and_then(Value::as_f64), right.as_f64())
                {
                    result.insert(key.clone(), Value::from(left + (right - left) * p));
                }
            }
            return Some(Value::Object(result));
        }
    }
    if interpolation == Some("color") {
        if let (Some(left), Some(right)) = (parse_color(from.as_str()?), parse_color(to.as_str()?))
        {
            let rgba = left
                .iter()
                .zip(right)
                .map(|(left, right)| left + (right - left) * p)
                .collect::<Vec<_>>();
            let alpha = rgba[3];
            if alpha >= 0.999 {
                return Some(Value::String(format!(
                    "rgb({}, {}, {})",
                    rgba[0].round() as i64,
                    rgba[1].round() as i64,
                    rgba[2].round() as i64
                )));
            }
            return Some(Value::String(format!(
                "rgba({}, {}, {}, {:.3})",
                rgba[0].round() as i64,
                rgba[1].round() as i64,
                rgba[2].round() as i64,
                alpha
            )));
        }
    }
    Some(to.clone())
}

fn parse_color(value: &str) -> Option<[f64; 4]> {
    let value = value.trim();
    if let Some(hex) = value.strip_prefix('#') {
        let expanded = match hex.len() {
            3 | 4 => hex
                .chars()
                .flat_map(|char| [char, char])
                .collect::<String>(),
            6 | 8 => hex.to_string(),
            _ => return None,
        };
        let channel = |start: usize| {
            u8::from_str_radix(&expanded[start..start + 2], 16)
                .ok()
                .map(f64::from)
        };
        return Some([
            channel(0)?,
            channel(2)?,
            channel(4)?,
            if expanded.len() == 8 {
                channel(6)? / 255.0
            } else {
                1.0
            },
        ]);
    }
    let body = value
        .strip_prefix("rgb(")
        .or_else(|| value.strip_prefix("rgba("))
        .and_then(|value| value.strip_suffix(')'))?;
    let channels = body.split(',').map(str::trim).collect::<Vec<_>>();
    if channels.len() < 3 {
        return None;
    }
    Some([
        channels[0].parse().ok()?,
        channels[1].parse().ok()?,
        channels[2].parse().ok()?,
        channels
            .get(3)
            .and_then(|value| value.parse().ok())
            .unwrap_or(1.0),
    ])
}

// Engine timeline keywords follow render-core. CSS interaction/presence easing
// still uses the CSS solver below; the two contracts deliberately differ.
fn timeline_ease_progress(progress: f64, easing: Option<&str>) -> f64 {
    ease_progress(
        progress,
        match easing {
            Some("ease-in") => Some("quad-in"),
            Some("ease-out") => Some("quad-out"),
            Some("ease-in-out") => Some("quad-in-out"),
            _ => easing,
        },
    )
}

pub fn ease_progress(progress: f64, easing: Option<&str>) -> f64 {
    let p = progress.clamp(0.0, 1.0);
    let Some(easing) = easing else {
        return p;
    };
    // CSS standard keywords and cubic-bezier / steps functions delegate to the
    // shared CSS-spec solver so that both the timeline path and the
    // interaction-feedback transition path produce identical bezier outputs.
    if let Some(value) = super::easing::ease_for_css_keyword(p, easing) {
        return value;
    }
    // render-core / legacy aliases that have no CSS standard equivalent.
    match easing {
        "easeIn" | "quad-in" | "quadIn" => p * p,
        "easeOut" | "quad-out" | "quadOut" => 1.0 - (1.0 - p) * (1.0 - p),
        "easeInOut" | "quad-in-out" | "quadInOut" => {
            if p < 0.5 {
                2.0 * p * p
            } else {
                1.0 - ((-2.0 * p + 2.0).powi(2)) / 2.0
            }
        }
        "cubic-in" | "cubicIn" | "easeInCubic" => p.powi(3),
        "cubic-out" | "cubicOut" | "easeOutCubic" => 1.0 - (1.0 - p).powi(3),
        "cubic-in-out" | "cubicInOut" | "easeInOutCubic" => {
            if p < 0.5 {
                4.0 * p.powi(3)
            } else {
                1.0 - ((-2.0 * p + 2.0).powi(3)) / 2.0
            }
        }
        // Unknown keyword → linear, matching render-core fallback.
        _ => p,
    }
}
