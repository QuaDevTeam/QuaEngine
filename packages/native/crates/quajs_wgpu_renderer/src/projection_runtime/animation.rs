use serde_json::{Map, Value};

use super::{numeric_record, set_path};

pub fn apply_animations(view: &mut Map<String, Value>, animations: &Value, now_ms: f64) -> bool {
    let Some(animations) = animations.as_array() else {
        return false;
    };
    let mut active = false;
    for animation in animations {
        let Some(animation) = animation.as_object() else {
            continue;
        };
        let Some(elapsed) = local_time(animation, now_ms) else {
            continue;
        };
        if local_is_active(animation, now_ms) {
            active = true;
        }
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
            for target_object in target_objects(view, target) {
                set_path(target_object, property, value.clone());
            }
        }
    }
    active
}

fn target_objects<'a>(
    view: &'a mut Map<String, Value>,
    target: &str,
) -> Vec<&'a mut Map<String, Value>> {
    // Rust's borrow checker cannot return multiple nested mutable references from a
    // generic tree walk. The renderer targets are a bounded set of projection roots,
    // so each branch returns at most one object and nested list items are handled
    // directly below.
    let mut result = Vec::new();
    if target == "background:main" {
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
            animation.get("fill").and_then(Value::as_str),
            Some("forwards") | Some("both")
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
    now_ms < started + delay + duration * loops
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
                ease_progress(
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

pub fn ease_progress(progress: f64, easing: Option<&str>) -> f64 {
    let p = progress.clamp(0.0, 1.0);
    match easing {
        Some("linear") => p,
        Some("ease-in") | Some("easeIn") | Some("quad-in") | Some("quadIn") => p * p,
        Some("ease-out") | Some("easeOut") | Some("quad-out") | Some("quadOut") => {
            1.0 - (1.0 - p) * (1.0 - p)
        }
        Some("ease-in-out") | Some("easeInOut") | Some("quad-in-out") | Some("quadInOut") => {
            if p < 0.5 {
                2.0 * p * p
            } else {
                1.0 - ((-2.0 * p + 2.0).powi(2)) / 2.0
            }
        }
        Some("cubic-in") | Some("cubicIn") | Some("easeInCubic") => p.powi(3),
        Some("cubic-out") | Some("cubicOut") | Some("easeOutCubic") => 1.0 - (1.0 - p).powi(3),
        Some(value) if value.starts_with("cubic-bezier(") => p,
        _ => p,
    }
}
