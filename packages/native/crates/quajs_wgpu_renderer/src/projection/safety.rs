use crate::projection::audio::{AudioTrackMemoryEstimate, AudioTrackProjection};
use crate::projection::background::layout::resolved_media_origin_str;
use crate::projection::character::CharacterPosition;
use crate::projection::ui::{
    UiOverlayProjection, UiSurfaceBackgroundPositionProjection, UiSurfaceEdgeInsetsProjection,
    UiSurfaceNodeProjection, UiSurfaceNodeRect, UiSurfaceResolvedStyle,
};

pub(crate) const MAX_NATIVE_BACKGROUND_LOGICAL_COORDINATE: f64 = 1_000_000.0;
pub(crate) const MAX_NATIVE_BACKGROUND_LOGICAL_DIMENSION: f64 = 1_000_000.0;
pub(crate) const MAX_NATIVE_BACKGROUND_SCALE: f64 = 1_000.0;
pub(crate) const MAX_NATIVE_BACKGROUND_ROTATION_DEGREES: f64 = 360_000.0;

pub(crate) const MAX_NATIVE_CHARACTER_LOGICAL_COORDINATE: f64 = 1_000_000.0;
pub(crate) const MAX_NATIVE_CHARACTER_LOGICAL_DIMENSION: f64 = 1_000_000.0;
pub(crate) const MAX_NATIVE_CHARACTER_PERCENT: f64 = 100_000.0;
pub(crate) const MAX_NATIVE_CHARACTER_SCALE: f64 = 1_000.0;
pub(crate) const MAX_NATIVE_CHARACTER_ROTATION_DEGREES: f64 = 360_000.0;

pub(crate) const MAX_NATIVE_Z_INDEX: i32 = 1_000_000;
pub(crate) const MAX_NATIVE_STACK_PRIORITY: i32 = 1_000;
pub(crate) const MAX_NATIVE_AUDIO_TRACK_CPU_BYTES: u64 = 2 * 1024 * 1024 * 1024;

pub(crate) const MAX_NATIVE_UI_LOGICAL_COORDINATE: f64 = 1_000_000.0;
pub(crate) const MAX_NATIVE_UI_LOGICAL_DIMENSION: f64 = 1_000_000.0;
pub(crate) const MAX_NATIVE_UI_SCROLL_OFFSET: f64 = 1_000_000.0;
pub(crate) const MAX_NATIVE_UI_STYLE_LOGICAL_VALUE: f64 = 1_000_000.0;

pub(crate) fn is_safe_native_opacity(value: f32) -> bool {
    value.is_finite() && (0.0..=1.0).contains(&value)
}

pub(crate) fn is_safe_native_background_geometry(
    x: f64,
    y: f64,
    width: Option<f64>,
    height: Option<f64>,
    scale: f64,
) -> bool {
    is_safe_coordinate(x, MAX_NATIVE_BACKGROUND_LOGICAL_COORDINATE)
        && is_safe_coordinate(y, MAX_NATIVE_BACKGROUND_LOGICAL_COORDINATE)
        && is_safe_optional_dimension(width, MAX_NATIVE_BACKGROUND_LOGICAL_DIMENSION)
        && is_safe_optional_dimension(height, MAX_NATIVE_BACKGROUND_LOGICAL_DIMENSION)
        && scale.is_finite()
        && scale > 0.0
        && scale <= MAX_NATIVE_BACKGROUND_SCALE
}

pub(crate) fn is_safe_native_background_rotation(rotation: f64) -> bool {
    rotation.is_finite() && rotation.abs() <= MAX_NATIVE_BACKGROUND_ROTATION_DEGREES
}

pub(crate) fn is_safe_native_background_origin(origin: Option<&str>) -> bool {
    let Some(origin) = origin else {
        return true;
    };
    let trimmed = origin.trim();
    !trimmed.is_empty()
        && trimmed == origin
        && origin.len() <= 64
        && !origin.chars().any(char::is_control)
        && !origin.contains(['?', '#', '/', '\\'])
        && !origin.contains("..")
        && !has_uri_scheme(origin)
        && resolved_media_origin_str(origin).is_some()
}

pub(crate) fn is_safe_native_character_position(position: &CharacterPosition) -> bool {
    is_safe_optional_coordinate(position.x, MAX_NATIVE_CHARACTER_LOGICAL_COORDINATE)
        && is_safe_optional_coordinate(position.y, MAX_NATIVE_CHARACTER_LOGICAL_COORDINATE)
        && is_safe_optional_coordinate(position.x_percent, MAX_NATIVE_CHARACTER_PERCENT)
        && is_safe_optional_coordinate(position.y_percent, MAX_NATIVE_CHARACTER_PERCENT)
        && position.scale.is_none_or(|scale| {
            scale.is_finite() && scale > 0.0 && scale <= MAX_NATIVE_CHARACTER_SCALE
        })
        && position.rotation.is_none_or(|rotation| {
            rotation.is_finite() && rotation.abs() <= MAX_NATIVE_CHARACTER_ROTATION_DEGREES
        })
        && is_safe_optional_dimension(position.width, MAX_NATIVE_CHARACTER_LOGICAL_DIMENSION)
        && is_safe_optional_dimension(position.height, MAX_NATIVE_CHARACTER_LOGICAL_DIMENSION)
}

pub(crate) fn is_safe_native_z_index(value: i32) -> bool {
    (-MAX_NATIVE_Z_INDEX..=MAX_NATIVE_Z_INDEX).contains(&value)
}

pub(crate) fn is_safe_native_stack_priority(value: i32) -> bool {
    (-MAX_NATIVE_STACK_PRIORITY..=MAX_NATIVE_STACK_PRIORITY).contains(&value)
}

pub(crate) fn is_safe_native_ui_overlay_numbers(overlay: &UiOverlayProjection) -> bool {
    overlay
        .stack_priority
        .is_none_or(is_safe_native_stack_priority)
        && overlay.z_index.is_none_or(is_safe_native_z_index)
        && overlay.scene.as_ref().is_none_or(|scene| {
            scene.overlay.as_ref().is_none_or(|scene_overlay| {
                scene_overlay
                    .stack_priority
                    .is_none_or(is_safe_native_stack_priority)
                    && scene_overlay.z_index.is_none_or(is_safe_native_z_index)
            })
        })
}

pub(crate) fn is_safe_native_ui_surface_node_numbers(node: &UiSurfaceNodeProjection) -> bool {
    is_safe_native_ui_rect(&node.bounds)
        && is_safe_native_z_index(node.z_index)
        && is_safe_native_opacity(node.opacity)
        && is_safe_native_ui_scroll_offset(node.scroll_offset_x)
        && is_safe_native_ui_scroll_offset(node.scroll_offset_y)
        && is_safe_native_ui_style_numbers(&node.style)
}

pub(crate) fn is_safe_native_ui_surface_offset(x: f64, y: f64) -> bool {
    is_safe_coordinate(x, MAX_NATIVE_UI_LOGICAL_COORDINATE)
        && is_safe_coordinate(y, MAX_NATIVE_UI_LOGICAL_COORDINATE)
}

pub(crate) fn is_safe_native_ui_rect(rect: &UiSurfaceNodeRect) -> bool {
    is_safe_coordinate(rect.x, MAX_NATIVE_UI_LOGICAL_COORDINATE)
        && is_safe_coordinate(rect.y, MAX_NATIVE_UI_LOGICAL_COORDINATE)
        && is_safe_dimension(rect.width, MAX_NATIVE_UI_LOGICAL_DIMENSION)
        && is_safe_dimension(rect.height, MAX_NATIVE_UI_LOGICAL_DIMENSION)
}

pub(crate) fn is_safe_native_ui_scroll_offset(value: f64) -> bool {
    is_safe_coordinate(value, MAX_NATIVE_UI_SCROLL_OFFSET)
}

pub(crate) fn is_safe_native_ui_style_numbers(style: &UiSurfaceResolvedStyle) -> bool {
    style.opacity.is_none_or(is_safe_native_opacity)
        && is_safe_native_ui_background_position(style.background_position)
        && is_safe_optional_logical_value(style.border_radius, MAX_NATIVE_UI_STYLE_LOGICAL_VALUE)
        && is_safe_optional_logical_value(style.border_width, MAX_NATIVE_UI_STYLE_LOGICAL_VALUE)
        && is_safe_optional_logical_value(style.font_size, MAX_NATIVE_UI_STYLE_LOGICAL_VALUE)
        && is_safe_optional_logical_value(style.letter_spacing, MAX_NATIVE_UI_STYLE_LOGICAL_VALUE)
        && is_safe_optional_logical_value(style.line_height, MAX_NATIVE_UI_STYLE_LOGICAL_VALUE)
        && is_safe_native_ui_padding(style.padding)
}

pub(crate) fn is_safe_native_audio_track_numbers(track: &AudioTrackProjection) -> bool {
    is_safe_native_opacity(track.volume) && is_safe_native_audio_memory(&track.memory)
}

pub(crate) fn is_safe_native_audio_memory(memory: &AudioTrackMemoryEstimate) -> bool {
    memory.buffer_cpu_bytes <= MAX_NATIVE_AUDIO_TRACK_CPU_BYTES
        && memory.stream_cpu_bytes <= MAX_NATIVE_AUDIO_TRACK_CPU_BYTES
        && memory.handle_cpu_bytes <= MAX_NATIVE_AUDIO_TRACK_CPU_BYTES
}

fn is_safe_optional_coordinate(value: Option<f64>, max_abs: f64) -> bool {
    value.is_none_or(|value| is_safe_coordinate(value, max_abs))
}

fn is_safe_coordinate(value: f64, max_abs: f64) -> bool {
    value.is_finite() && value.abs() <= max_abs
}

fn is_safe_optional_dimension(value: Option<f64>, max: f64) -> bool {
    value.is_none_or(|value| is_safe_dimension(value, max))
}

fn is_safe_dimension(value: f64, max: f64) -> bool {
    value.is_finite() && value >= 0.0 && value <= max
}

fn is_safe_optional_logical_value(value: Option<f64>, max: f64) -> bool {
    value.is_none_or(|value| is_safe_logical_value(value, max))
}

fn is_safe_logical_value(value: f64, max: f64) -> bool {
    value.is_finite() && value >= 0.0 && value <= max
}

fn is_safe_native_ui_background_position(
    value: Option<UiSurfaceBackgroundPositionProjection>,
) -> bool {
    value.is_none_or(|position| {
        is_safe_normalized_value(position.x) && is_safe_normalized_value(position.y)
    })
}

fn is_safe_native_ui_padding(value: Option<UiSurfaceEdgeInsetsProjection>) -> bool {
    value.is_none_or(|padding| {
        is_safe_logical_value(padding.top, MAX_NATIVE_UI_STYLE_LOGICAL_VALUE)
            && is_safe_logical_value(padding.right, MAX_NATIVE_UI_STYLE_LOGICAL_VALUE)
            && is_safe_logical_value(padding.bottom, MAX_NATIVE_UI_STYLE_LOGICAL_VALUE)
            && is_safe_logical_value(padding.left, MAX_NATIVE_UI_STYLE_LOGICAL_VALUE)
    })
}

fn is_safe_normalized_value(value: f64) -> bool {
    value.is_finite() && (0.0..=1.0).contains(&value)
}

fn has_uri_scheme(value: &str) -> bool {
    let Some(index) = value.find(':') else {
        return false;
    };
    let scheme = &value[..index];
    !scheme.is_empty()
        && scheme.chars().enumerate().all(|(index, char)| {
            if index == 0 {
                char.is_ascii_alphabetic()
            } else {
                char.is_ascii_alphanumeric() || matches!(char, '+' | '-' | '.')
            }
        })
}
