use std::time::{Duration, Instant};

use crate::frame::PreparedNativeFrame;
use crate::input::{NativePointerInteractionState, NativePointerVisualTransition};
use crate::render_graph::{
    plan_render_passes, BorderDrawParams, DrawCommand, DrawCommandParams, DrawCommandVariant,
    DrawInteractionState, DrawTransition, DrawTransitionEasing, DrawTransitionProperty,
    PanelDrawParams, ShadowDrawParams,
};
use crate::renderer::control_feedback::apply_control_feedback;

pub(super) fn frame_with_interaction_feedback(
    frame: &PreparedNativeFrame,
    interaction: &NativePointerInteractionState,
) -> Option<PreparedNativeFrame> {
    if !interaction.has_visual_feedback() && interaction.visual_transition().is_none() {
        return None;
    }

    frame_with_interaction_feedback_at(frame, interaction, Instant::now())
}

fn frame_with_interaction_feedback_at(
    frame: &PreparedNativeFrame,
    interaction: &NativePointerInteractionState,
    now: Instant,
) -> Option<PreparedNativeFrame> {
    let feedback_commands = frame
        .graph
        .commands()
        .iter()
        .filter_map(|command| {
            interaction_feedback_command(
                command,
                interaction,
                frame.graph.layout.logical_width,
                frame.graph.layout.logical_height,
            )
        })
        .collect::<Vec<_>>();
    let mut feedback_frame = frame.clone();
    let variant_changed = apply_interaction_variants(&mut feedback_frame, interaction, now);
    let control_changed = apply_control_feedback(&mut feedback_frame, &interaction.controls);
    if feedback_commands.is_empty() && !control_changed && !variant_changed {
        return None;
    }
    feedback_frame.graph.extend(feedback_commands);
    feedback_frame.summary = feedback_frame.graph.summary();
    feedback_frame.passes = plan_render_passes(&feedback_frame.graph);
    Some(feedback_frame)
}

pub(super) fn interaction_transition_active(
    frame: &PreparedNativeFrame,
    interaction: &NativePointerInteractionState,
) -> bool {
    let Some(transition) = interaction.visual_transition() else {
        return false;
    };
    let elapsed = transition.started_at.elapsed();
    frame.graph.commands().iter().any(|command| {
        !command.interaction_variants.is_empty()
            && selected_interaction_state_for_snapshot(
                command,
                command.interaction_group_id.as_deref().unwrap_or_default(),
                interaction,
            ) != selected_interaction_state_for_transition(command, transition)
            && command
                .interaction_transitions
                .iter()
                .any(|item| elapsed < Duration::from_secs_f64(item.duration_ms.max(0.0) / 1000.0))
    })
}

fn apply_interaction_variants(
    frame: &mut PreparedNativeFrame,
    interaction: &NativePointerInteractionState,
    now: Instant,
) -> bool {
    let mut changed = false;
    for command in frame.graph.commands_mut() {
        let Some(group_id) = command.interaction_group_id.as_deref() else {
            continue;
        };
        let current_state = selected_interaction_state(command, group_id, interaction);
        let has_transition = interaction.visual_transition().is_some();
        let previous_state = interaction
            .visual_transition()
            .and_then(|transition| selected_interaction_state_for_transition(command, transition));
        let base = DrawCommandVariant::from_command(command);
        let target = current_state
            .and_then(|state| command.interaction_variants.get(&state))
            .unwrap_or(&base);
        let source = previous_state
            .and_then(|state| command.interaction_variants.get(&state))
            .unwrap_or(&base);
        let elapsed = interaction
            .visual_transition()
            .map(|transition| {
                now.checked_duration_since(transition.started_at)
                    .unwrap_or_default()
                    .as_secs_f64()
                    * 1000.0
            })
            .unwrap_or(f64::MAX);
        let variant = if !has_transition || previous_state == current_state {
            target.clone()
        } else {
            interpolate_variant(source, target, &command.interaction_transitions, elapsed)
        };
        let transition_in_progress = previous_state != current_state
            && command
                .interaction_transitions
                .iter()
                .any(|transition| elapsed < transition.duration_ms.max(0.0));
        if variant != base || current_state.is_some() || transition_in_progress {
            apply_command_variant(command, &variant);
            changed = true;
        }
    }
    if changed {
        frame.graph.extend(std::iter::empty());
    }
    changed
}

fn selected_interaction_state(
    command: &DrawCommand,
    group_id: &str,
    interaction: &NativePointerInteractionState,
) -> Option<DrawInteractionState> {
    let hovered = interaction.hovered_command_id() == Some(group_id);
    let focused = interaction.focused_command_id() == Some(group_id);
    let pressed = hovered && interaction.is_pressed(group_id);
    if pressed
        && command
            .interaction_variants
            .contains_key(&DrawInteractionState::Active)
    {
        return Some(DrawInteractionState::Active);
    }
    if hovered
        && command
            .interaction_variants
            .contains_key(&DrawInteractionState::Hover)
    {
        return Some(DrawInteractionState::Hover);
    }
    if focused
        && command
            .interaction_variants
            .contains_key(&DrawInteractionState::FocusVisible)
    {
        return Some(DrawInteractionState::FocusVisible);
    }
    if focused
        && command
            .interaction_variants
            .contains_key(&DrawInteractionState::Focus)
    {
        return Some(DrawInteractionState::Focus);
    }
    None
}

fn selected_interaction_state_for_transition(
    command: &DrawCommand,
    transition: &NativePointerVisualTransition,
) -> Option<DrawInteractionState> {
    let hovered =
        transition.hovered_command_id.as_deref() == command.interaction_group_id.as_deref();
    let focused =
        transition.focused_command_id.as_deref() == command.interaction_group_id.as_deref();
    let pressed = hovered
        && transition
            .pressed_command_ids
            .contains(command.interaction_group_id.as_deref().unwrap_or_default());
    select_state_for_flags(command, hovered, focused, pressed)
}

fn selected_interaction_state_for_snapshot(
    command: &DrawCommand,
    group_id: &str,
    interaction: &NativePointerInteractionState,
) -> Option<DrawInteractionState> {
    select_state_for_flags(
        command,
        interaction.hovered_command_id() == Some(group_id),
        interaction.focused_command_id() == Some(group_id),
        interaction.is_pressed(group_id),
    )
}

fn select_state_for_flags(
    command: &DrawCommand,
    hovered: bool,
    focused: bool,
    pressed: bool,
) -> Option<DrawInteractionState> {
    if pressed
        && command
            .interaction_variants
            .contains_key(&DrawInteractionState::Active)
    {
        return Some(DrawInteractionState::Active);
    }
    if hovered
        && command
            .interaction_variants
            .contains_key(&DrawInteractionState::Hover)
    {
        return Some(DrawInteractionState::Hover);
    }
    if focused
        && command
            .interaction_variants
            .contains_key(&DrawInteractionState::FocusVisible)
    {
        return Some(DrawInteractionState::FocusVisible);
    }
    if focused
        && command
            .interaction_variants
            .contains_key(&DrawInteractionState::Focus)
    {
        return Some(DrawInteractionState::Focus);
    }
    None
}

fn interpolate_variant(
    source: &DrawCommandVariant,
    target: &DrawCommandVariant,
    transitions: &[DrawTransition],
    elapsed_ms: f64,
) -> DrawCommandVariant {
    let transform_progress =
        transition_progress(transitions, DrawTransitionProperty::Transform, elapsed_ms);
    let opacity_progress =
        transition_progress(transitions, DrawTransitionProperty::Opacity, elapsed_ms);
    let mut result = target.clone();
    result.bounds = lerp_rect(source.bounds, target.bounds, transform_progress);
    result.clip_bounds = lerp_rects(&source.clip_bounds, &target.clip_bounds, transform_progress);
    result.opacity = lerp_f32(source.opacity, target.opacity, opacity_progress);
    result.params = interpolate_params(&source.params, &target.params, transitions, elapsed_ms);
    result
}

fn transition_progress(
    transitions: &[DrawTransition],
    property: DrawTransitionProperty,
    elapsed_ms: f64,
) -> f64 {
    let transition = transitions
        .iter()
        .find(|transition| transition.property == property)
        .or_else(|| {
            transitions
                .iter()
                .find(|transition| transition.property == DrawTransitionProperty::All)
        });
    let Some(transition) = transition else {
        return 1.0;
    };
    if transition.duration_ms <= 0.0 {
        return 1.0;
    }
    let delayed_elapsed = (elapsed_ms - transition.delay_ms.max(0.0)).max(0.0);
    let progress = (delayed_elapsed / transition.duration_ms).clamp(0.0, 1.0);
    ease_progress(progress, transition.easing)
}

/// Hover/press transitions mirror the browser's native CSS `transition`
/// engine, so the keywords resolve to the CSS-specified bezier control points
/// and are solved exactly (x-solve, then y). Delegates to the shared
/// `projection_runtime::easing` CSS-spec solver so both paths use identical
/// arithmetic.
fn ease_progress(value: f64, easing: DrawTransitionEasing) -> f64 {
    let value = value.clamp(0.0, 1.0);
    let [x1, y1, x2, y2] = match easing {
        DrawTransitionEasing::Linear => return value,
        DrawTransitionEasing::Ease => [0.25, 0.1, 0.25, 1.0],
        DrawTransitionEasing::EaseIn => [0.42, 0.0, 1.0, 1.0],
        DrawTransitionEasing::EaseOut => [0.0, 0.0, 0.58, 1.0],
        DrawTransitionEasing::EaseInOut => [0.42, 0.0, 0.58, 1.0],
        DrawTransitionEasing::CubicBezier(points) => points,
    };
    crate::projection_runtime::easing::css_bezier(value, x1, y1, x2, y2)
}

fn interpolate_params(
    source: &DrawCommandParams,
    target: &DrawCommandParams,
    transitions: &[DrawTransition],
    elapsed_ms: f64,
) -> DrawCommandParams {
    let color_progress =
        transition_progress(transitions, DrawTransitionProperty::Color, elapsed_ms);
    let background_progress = transition_progress(
        transitions,
        DrawTransitionProperty::BackgroundColor,
        elapsed_ms,
    );
    let border_progress =
        transition_progress(transitions, DrawTransitionProperty::BorderColor, elapsed_ms);
    let shadow_progress =
        transition_progress(transitions, DrawTransitionProperty::BoxShadow, elapsed_ms);
    let filter_progress =
        transition_progress(transitions, DrawTransitionProperty::Filter, elapsed_ms);
    // `transform` / `scale` / `translate` transitions all collapse onto the
    // Transform channel in the surface traversal, so rotation rides along here.
    let transform_progress =
        transition_progress(transitions, DrawTransitionProperty::Transform, elapsed_ms);
    match (source, target) {
        (DrawCommandParams::Panel(source), DrawCommandParams::Panel(target)) => {
            let mut result = target.clone();
            result.fill_color =
                blend_color(&source.fill_color, &target.fill_color, background_progress);
            result.border = blend_border(&source.border, &target.border, border_progress);
            result.corner_radius = lerp_f64(
                source.corner_radius,
                target.corner_radius,
                background_progress,
            );
            result.rotation_degrees = lerp_f64(
                source.rotation_degrees,
                target.rotation_degrees,
                transform_progress,
            );
            DrawCommandParams::Panel(result)
        }
        (DrawCommandParams::UiButton(source), DrawCommandParams::UiButton(target)) => {
            let mut result = target.clone();
            result.background_color = blend_color(
                &source.background_color,
                &target.background_color,
                background_progress,
            );
            result.text_color = blend_color(&source.text_color, &target.text_color, color_progress);
            result.border = blend_border(&source.border, &target.border, border_progress);
            result.corner_radius = lerp_f64(
                source.corner_radius,
                target.corner_radius,
                background_progress,
            );
            DrawCommandParams::UiButton(result)
        }
        (DrawCommandParams::Text(source), DrawCommandParams::Text(target)) => {
            let mut result = target.clone();
            result.color = blend_color(&source.color, &target.color, color_progress);
            result.rotation_degrees = lerp_f64(
                source.rotation_degrees,
                target.rotation_degrees,
                transform_progress,
            );
            DrawCommandParams::Text(result)
        }
        (DrawCommandParams::Image(source), DrawCommandParams::Image(target)) => {
            let mut result = target.clone();
            result.brightness         = lerp_f64(source.brightness, target.brightness, filter_progress);
            result.saturation         = lerp_f64(source.saturation, target.saturation, filter_progress);
            result.contrast           = lerp_f64(source.contrast, target.contrast, filter_progress);
            result.grayscale          = lerp_f64(source.grayscale, target.grayscale, filter_progress);
            result.sepia              = lerp_f64(source.sepia, target.sepia, filter_progress);
            result.hue_rotate_radians = lerp_f64(source.hue_rotate_radians, target.hue_rotate_radians, filter_progress);
            result.invert             = lerp_f64(source.invert, target.invert, filter_progress);
            result.rotation_degrees = lerp_f64(
                source.rotation_degrees,
                target.rotation_degrees,
                transform_progress,
            );
            DrawCommandParams::Image(result)
        }
        (DrawCommandParams::Shadow(source), DrawCommandParams::Shadow(target)) => {
            DrawCommandParams::Shadow(interpolate_shadow(source, target, shadow_progress))
        }
        (DrawCommandParams::Gradient(source), DrawCommandParams::Gradient(target)) => {
            let mut result = target.clone();
            result.start_color = blend_color(
                &source.start_color,
                &target.start_color,
                background_progress,
            );
            result.end_color =
                blend_color(&source.end_color, &target.end_color, background_progress);
            DrawCommandParams::Gradient(result)
        }
        _ => target.clone(),
    }
}

fn interpolate_shadow(
    source: &ShadowDrawParams,
    target: &ShadowDrawParams,
    progress: f64,
) -> ShadowDrawParams {
    let mut result = target.clone();
    result.source_bounds = lerp_rect(source.source_bounds, target.source_bounds, progress);
    result.offset_x = lerp_f64(source.offset_x, target.offset_x, progress);
    result.offset_y = lerp_f64(source.offset_y, target.offset_y, progress);
    result.blur_radius = lerp_f64(source.blur_radius, target.blur_radius, progress);
    result.spread_radius = lerp_f64(source.spread_radius, target.spread_radius, progress);
    result.corner_radius = lerp_f64(source.corner_radius, target.corner_radius, progress);
    result.color = blend_color(&source.color, &target.color, progress);
    result
}

fn blend_border(
    source: &BorderDrawParams,
    target: &BorderDrawParams,
    progress: f64,
) -> BorderDrawParams {
    BorderDrawParams {
        color: blend_optional_color(source.color.as_deref(), target.color.as_deref(), progress),
        width: lerp_f64(source.width, target.width, progress),
    }
}

fn lerp_rect(
    source: crate::render_graph::LogicalRect,
    target: crate::render_graph::LogicalRect,
    progress: f64,
) -> crate::render_graph::LogicalRect {
    crate::render_graph::LogicalRect {
        x: lerp_f64(source.x, target.x, progress),
        y: lerp_f64(source.y, target.y, progress),
        width: lerp_f64(source.width, target.width, progress),
        height: lerp_f64(source.height, target.height, progress),
    }
}

fn lerp_rects(
    source: &[crate::render_graph::LogicalRect],
    target: &[crate::render_graph::LogicalRect],
    progress: f64,
) -> Vec<crate::render_graph::LogicalRect> {
    if source.len() != target.len() {
        return target.to_vec();
    }
    source
        .iter()
        .zip(target)
        .map(|(source, target)| lerp_rect(*source, *target, progress))
        .collect()
}

fn lerp_f64(source: f64, target: f64, progress: f64) -> f64 {
    source + (target - source) * progress
}

fn lerp_f32(source: f32, target: f32, progress: f64) -> f32 {
    lerp_f64(source as f64, target as f64, progress) as f32
}

#[derive(Clone, Copy)]
struct RgbaColor {
    r: f64,
    g: f64,
    b: f64,
    a: f64,
}

fn blend_optional_color(
    source: Option<&str>,
    target: Option<&str>,
    progress: f64,
) -> Option<String> {
    match (source, target) {
        (None, None) => None,
        (Some(source), Some(target)) => Some(blend_color(source, target, progress)),
        (None, Some(target)) => Some(blend_color("rgba(0,0,0,0)", target, progress)),
        (Some(source), None) => {
            if progress >= 1.0 {
                None
            } else {
                Some(blend_color(source, "rgba(0,0,0,0)", progress))
            }
        }
    }
}

fn blend_color(source: &str, target: &str, progress: f64) -> String {
    if progress <= 0.0 {
        return source.to_string();
    }
    if progress >= 1.0 {
        return target.to_string();
    }
    let (Some(source), Some(target)) = (parse_color(source), parse_color(target)) else {
        return if progress >= 0.5 {
            target.to_string()
        } else {
            source.to_string()
        };
    };
    let source_alpha = source.a;
    let target_alpha = target.a;
    let alpha = lerp_f64(source_alpha, target_alpha, progress);
    // CSS interpolates transition colors in sRGB, premultiplied by alpha. Doing
    // this in linear light would make mid-transition hover/press frames diverge
    // from the Web target even though both endpoints agree.
    let source_rgb = [source.r, source.g, source.b];
    let target_rgb = [target.r, target.g, target.b];
    let mut rgb = [0.0; 3];
    for index in 0..3 {
        let source_premultiplied = source_rgb[index] * source_alpha;
        let target_premultiplied = target_rgb[index] * target_alpha;
        rgb[index] = if alpha > 0.00001 {
            lerp_f64(source_premultiplied, target_premultiplied, progress) / alpha
        } else {
            0.0
        };
    }
    format!(
        "rgba({},{},{},{:.4})",
        (rgb[0].clamp(0.0, 1.0) * 255.0).round(),
        (rgb[1].clamp(0.0, 1.0) * 255.0).round(),
        (rgb[2].clamp(0.0, 1.0) * 255.0).round(),
        alpha.clamp(0.0, 1.0)
    )
}

fn parse_color(value: &str) -> Option<RgbaColor> {
    let value = value.trim().to_ascii_lowercase();
    if value == "transparent" {
        return Some(RgbaColor {
            r: 0.0,
            g: 0.0,
            b: 0.0,
            a: 0.0,
        });
    }
    let value = match value.as_str() {
        "black" => "#000000",
        "white" => "#ffffff",
        "red" => "#ff0000",
        "green" => "#008000",
        "blue" => "#0000ff",
        _ => value.as_str(),
    };
    if let Some(hex) = value.strip_prefix('#') {
        let expanded = match hex.len() {
            3 => format!(
                "{}{}{}{}{}{}",
                &hex[0..1],
                &hex[0..1],
                &hex[1..2],
                &hex[1..2],
                &hex[2..3],
                &hex[2..3]
            ),
            4 => format!(
                "{}{}{}{}{}{}{}{}",
                &hex[0..1],
                &hex[0..1],
                &hex[1..2],
                &hex[1..2],
                &hex[2..3],
                &hex[2..3],
                &hex[3..4],
                &hex[3..4]
            ),
            6 | 8 => hex.to_string(),
            _ => return None,
        };
        let parse = |range: std::ops::Range<usize>| {
            u8::from_str_radix(&expanded[range], 16)
                .ok()
                .map(|value| value as f64 / 255.0)
        };
        return Some(RgbaColor {
            r: parse(0..2)?,
            g: parse(2..4)?,
            b: parse(4..6)?,
            a: if expanded.len() == 8 {
                parse(6..8)?
            } else {
                1.0
            },
        });
    }
    let (prefix, suffix) = if let Some(value) = value.strip_prefix("rgba(") {
        ("rgba", value.strip_suffix(')')?)
    } else if let Some(value) = value.strip_prefix("rgb(") {
        ("rgb", value.strip_suffix(')')?)
    } else {
        return None;
    };
    let parts = suffix.split(',').map(str::trim).collect::<Vec<_>>();
    if (prefix == "rgb" && parts.len() != 3) || (prefix == "rgba" && parts.len() != 4) {
        return None;
    }
    let channel = |value: &str| {
        value
            .parse::<f64>()
            .ok()
            .filter(|value| (0.0..=255.0).contains(value))
            .map(|value| value / 255.0)
    };
    let alpha = if parts.len() == 4 {
        parts[3]
            .parse::<f64>()
            .ok()
            .filter(|value| (0.0..=1.0).contains(value))?
    } else {
        1.0
    };
    Some(RgbaColor {
        r: channel(parts[0])?,
        g: channel(parts[1])?,
        b: channel(parts[2])?,
        a: alpha,
    })
}

fn apply_command_variant(command: &mut DrawCommand, variant: &DrawCommandVariant) {
    command.bounds = variant.bounds;
    command.clip_bounds = variant.clip_bounds.clone();
    command.kind = variant.kind;
    command.opacity = variant.opacity;
    command.params = variant.params.clone();
    command.resource_ids = variant.resource_ids.clone();
    command.z_index = variant.z_index;
}

fn interaction_feedback_command(
    command: &DrawCommand,
    interaction: &NativePointerInteractionState,
    logical_width: f64,
    logical_height: f64,
) -> Option<DrawCommand> {
    if !command.interactive
        || !command.interaction_variants.is_empty()
        || covers_stage_background(command, logical_width, logical_height)
    {
        return None;
    }

    let hovered = interaction.hovered_command_id() == Some(command.id.as_str());
    let focused = interaction.focused_command_id() == Some(command.id.as_str());
    let pressed = hovered && interaction.is_pressed(&command.id);
    if !hovered && !focused && !pressed {
        return None;
    }

    // The feedback overlay shares the source node's geometry, so it has to pick up
    // the node's rotation as well or the highlight would sit axis-aligned over a
    // rotated node. `UiButton` has no rotation of its own today.
    let (corner_radius, rotation_degrees) = match &command.params {
        DrawCommandParams::UiButton(params) => (params.corner_radius, 0.0),
        DrawCommandParams::Panel(params) => (params.corner_radius, params.rotation_degrees),
        _ => return None,
    };
    let fill_color = if pressed {
        "rgba(255,255,255,0.14)"
    } else if hovered {
        "rgba(255,255,255,0.07)"
    } else {
        "transparent"
    };
    let border = if focused {
        BorderDrawParams {
            color: Some("rgba(245,226,190,0.78)".to_string()),
            width: 2.0,
        }
    } else {
        BorderDrawParams::default()
    };

    Some(
        DrawCommand::new(
            format!("{}::interaction", command.id),
            command.plane,
            command.kind,
            command.bounds,
        )
        .z_index(command.z_index)
        .opacity(command.opacity)
        .clip_bounds(command.clip_bounds.iter().copied())
        .params(DrawCommandParams::Panel(PanelDrawParams {
            role: if pressed {
                "interaction-pressed"
            } else if hovered && focused {
                "interaction-hover-focus"
            } else if hovered {
                "interaction-hover"
            } else {
                "interaction-focus"
            }
            .to_string(),
            corner_radius,
            fill_color: fill_color.to_string(),
            border,
            padding: Default::default(),
            intent: None,
            rotation_degrees,
        })),
    )
}

fn covers_stage_background(command: &DrawCommand, logical_width: f64, logical_height: f64) -> bool {
    command.bounds.width >= logical_width * 0.9 && command.bounds.height >= logical_height * 0.9
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::{
        resolve_pointer_event_with_interaction, NativePointerEvent, NativePointerEventPhase,
        PointerIntentResolution, RendererIntentHit,
    };
    use crate::render_graph::{
        DrawCommandKind, FontStyleDrawParam, LogicalRect, RenderGraph, RenderPlane, RendererIntent,
        TextAlign, TextDecorationDrawParam, TextOverflowDrawParam, TextTransformDrawParam,
        UiButtonDrawParams, WhiteSpaceDrawParam,
    };
    use crate::stage_layout::{
        resolve_stage_layout, StageClientPoint, StageClientRectOrigin, StageContainerInput,
        StageHitTestPoint,
    };

    #[test]
    fn evaluates_css_transition_easing_keywords_as_true_bezier_curves() {
        // Reference values from the canonical WebKit UnitBezier solver; the
        // hover/press path must match the browser's CSS transition engine.
        let close = |actual: f64, expected: f64| {
            assert!(
                (actual - expected).abs() <= 1e-6,
                "expected {expected}, got {actual}"
            );
        };
        close(
            ease_progress(0.1, DrawTransitionEasing::Ease),
            0.094_796_306,
        );
        close(
            ease_progress(0.25, DrawTransitionEasing::Ease),
            0.408_510_593,
        );
        close(
            ease_progress(0.5, DrawTransitionEasing::Ease),
            0.802_403_388,
        );
        close(
            ease_progress(0.75, DrawTransitionEasing::Ease),
            0.960_458_978,
        );
        close(
            ease_progress(0.9, DrawTransitionEasing::Ease),
            0.994_316_478,
        );
        let expo = DrawTransitionEasing::CubicBezier([0.19, 1.0, 0.22, 1.0]);
        close(ease_progress(0.1, expo), 0.479_754_619);
        close(ease_progress(0.5, expo), 0.977_824_592);
        close(ease_progress(0.9, expo), 0.999_911_198);
        close(ease_progress(0.0, expo), 0.0);
        close(ease_progress(1.0, expo), 1.0);
        close(ease_progress(0.5, DrawTransitionEasing::Linear), 0.5);
    }

    #[test]
    fn appends_hover_and_focus_paint_without_mutating_the_projected_frame() {
        let frame = fixture_frame();
        let mut interaction = NativePointerInteractionState::new();
        resolve_pointer_event_with_interaction(
            &mut interaction,
            NativePointerEvent::new(
                NativePointerEventPhase::Press,
                StageClientPoint::default(),
                StageClientRectOrigin::default(),
            ),
            fixture_pointer(),
        );

        let feedback = frame_with_interaction_feedback(&frame, &interaction).unwrap();

        assert_eq!(frame.graph.commands().len(), 1);
        assert_eq!(feedback.graph.commands().len(), 2);
        let command = feedback
            .graph
            .commands()
            .iter()
            .find(|command| command.id == "button::interaction")
            .unwrap();
        match &command.params {
            DrawCommandParams::Panel(params) => {
                assert_eq!(params.role, "interaction-pressed");
                assert_eq!(params.fill_color, "rgba(255,255,255,0.14)");
                assert_eq!(params.border.width, 2.0);
            }
            params => panic!("unexpected feedback params: {params:?}"),
        }
    }

    #[test]
    fn skips_full_stage_interactive_backdrops() {
        let layout = resolve_stage_layout(None, StageContainerInput::default());
        let mut graph = RenderGraph::new(layout);
        graph.push(
            DrawCommand::new(
                "backdrop",
                RenderPlane::Screen,
                DrawCommandKind::UiSurface,
                LogicalRect {
                    x: 0.0,
                    y: 0.0,
                    width: layout.logical_width,
                    height: layout.logical_height,
                },
            )
            .interactive(true)
            .params(DrawCommandParams::Panel(PanelDrawParams {
                role: "backdrop".to_string(),
                corner_radius: 0.0,
                fill_color: "#000000".to_string(),
                border: Default::default(),
                padding: Default::default(),
                intent: Some(RendererIntent {
                    event: "ui/intent".to_string(),
                    choice_id: None,
                    element_id: Some("backdrop".to_string()),
                    action: Some("close".to_string()),
                    metadata: Default::default(),
                }),
                rotation_degrees: 0.0,
            })),
        );
        let frame = PreparedNativeFrame {
            summary: graph.summary(),
            resources: Default::default(),
            assets: Default::default(),
            passes: plan_render_passes(&graph),
            graph,
        };
        let mut interaction = NativePointerInteractionState::new();
        resolve_pointer_event_with_interaction(
            &mut interaction,
            NativePointerEvent::new(
                NativePointerEventPhase::Press,
                StageClientPoint::default(),
                StageClientRectOrigin::default(),
            ),
            PointerIntentResolution {
                point: StageHitTestPoint {
                    x: 20.0,
                    y: 20.0,
                    inside_viewport: true,
                    inside_stage: true,
                },
                intent: Some(RendererIntentHit {
                    command_id: "backdrop".to_string(),
                    intent: RendererIntent {
                        event: "ui/intent".to_string(),
                        choice_id: None,
                        element_id: Some("backdrop".to_string()),
                        action: Some("close".to_string()),
                        metadata: Default::default(),
                    },
                }),
            },
        );

        assert!(frame_with_interaction_feedback(&frame, &interaction).is_none());
    }

    #[test]
    fn interpolates_declared_hover_bounds_and_colors_without_generic_feedback() {
        let mut frame = fixture_frame();
        let base = frame.graph.commands()[0].clone();
        let mut target = base.clone();
        target.bounds.x = 40.0;
        if let DrawCommandParams::UiButton(params) = &mut target.params {
            params.background_color = "#804020".to_string();
            params.text_color = "#ffe8b3".to_string();
        }
        let command = &mut frame.graph.commands_mut()[0];
        command.interaction_group_id = Some("button".to_string());
        command.interaction_variants.insert(
            DrawInteractionState::Hover,
            DrawCommandVariant::from_command(&target),
        );
        command.interaction_transitions = vec![
            DrawTransition {
                property: DrawTransitionProperty::Transform,
                duration_ms: 1_000.0,
                delay_ms: 0.0,
                easing: DrawTransitionEasing::Linear,
            },
            DrawTransition {
                property: DrawTransitionProperty::BackgroundColor,
                duration_ms: 1_000.0,
                delay_ms: 0.0,
                easing: DrawTransitionEasing::Linear,
            },
            DrawTransition {
                property: DrawTransitionProperty::Color,
                duration_ms: 1_000.0,
                delay_ms: 0.0,
                easing: DrawTransitionEasing::Linear,
            },
        ];

        let mut interaction = NativePointerInteractionState::new();
        resolve_pointer_event_with_interaction(
            &mut interaction,
            NativePointerEvent::new(
                NativePointerEventPhase::Move,
                StageClientPoint::default(),
                StageClientRectOrigin::default(),
            ),
            fixture_pointer(),
        );
        let started_at = interaction.visual_transition().unwrap().started_at;
        let feedback = frame_with_interaction_feedback_at(
            &frame,
            &interaction,
            started_at + Duration::from_millis(500),
        )
        .unwrap();

        assert_eq!(frame.graph.commands()[0].bounds.x, 20.0);
        assert_eq!(feedback.graph.commands().len(), 1);
        let command = &feedback.graph.commands()[0];
        assert_eq!(command.bounds.x, 30.0);
        match &command.params {
            DrawCommandParams::UiButton(params) => {
                assert_ne!(params.background_color, "#202020");
                assert_ne!(params.background_color, "#804020");
                assert!(params.background_color.starts_with("rgba("));
                assert_ne!(params.text_color, "#ffffff");
                assert_ne!(params.text_color, "#ffe8b3");
            }
            params => panic!("unexpected feedback params: {params:?}"),
        }
        assert!(interaction_transition_active(&frame, &interaction));

        let completed = frame_with_interaction_feedback_at(
            &frame,
            &interaction,
            started_at + Duration::from_millis(1_000),
        )
        .unwrap();
        assert_eq!(completed.graph.commands()[0].bounds.x, 40.0);
    }

    fn fixture_frame() -> PreparedNativeFrame {
        let layout = resolve_stage_layout(None, StageContainerInput::default());
        let mut graph = RenderGraph::new(layout);
        graph.push(
            DrawCommand::new(
                "button",
                RenderPlane::Screen,
                DrawCommandKind::UiSurface,
                LogicalRect {
                    x: 20.0,
                    y: 20.0,
                    width: 180.0,
                    height: 56.0,
                },
            )
            .interactive(true)
            .params(DrawCommandParams::UiButton(UiButtonDrawParams {
                label: "Continue".to_string(),
                enabled: true,
                role: "button".to_string(),
                background_color: "#202020".to_string(),
                text_color: "#ffffff".to_string(),
                corner_radius: 4.0,
                border: Default::default(),
                font_family: Vec::new(),
                font_size: 20.0,
                font_style: FontStyleDrawParam::Normal,
                font_weight: None,
                letter_spacing: 0.0,
                line_height: 24.0,
                align: TextAlign::Center,
                text_decoration: TextDecorationDrawParam::None,
                text_overflow: TextOverflowDrawParam::Clip,
                text_transform: TextTransformDrawParam::None,
                white_space: WhiteSpaceDrawParam::Normal,
                padding: Default::default(),
                intent: Some(RendererIntent {
                    event: "ui/intent".to_string(),
                    choice_id: None,
                    element_id: Some("button".to_string()),
                    action: Some("continue".to_string()),
                    metadata: Default::default(),
                }),
            })),
        );
        PreparedNativeFrame {
            summary: graph.summary(),
            resources: Default::default(),
            assets: Default::default(),
            passes: plan_render_passes(&graph),
            graph,
        }
    }

    fn fixture_pointer() -> PointerIntentResolution {
        PointerIntentResolution {
            point: StageHitTestPoint {
                x: 40.0,
                y: 40.0,
                inside_viewport: true,
                inside_stage: true,
            },
            intent: Some(RendererIntentHit {
                command_id: "button".to_string(),
                intent: RendererIntent {
                    event: "ui/intent".to_string(),
                    choice_id: None,
                    element_id: Some("button".to_string()),
                    action: Some("continue".to_string()),
                    metadata: Default::default(),
                },
            }),
        }
    }
}
