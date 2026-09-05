use std::collections::{BTreeMap, BTreeSet};

use crate::projection::common::is_safe_native_dispatch_identifier;
use crate::projection::safety::{
    is_safe_native_ui_surface_node_numbers, is_safe_native_ui_surface_offset,
};
use crate::render_graph::{
    BackdropBlurDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams, DrawCommandVariant,
    DrawInteractionState, DrawTransition, DrawTransitionEasing, DrawTransitionProperty,
    LogicalRect, ShadowDrawStyle,
};

use super::super::style::resolve_opacity;
use super::super::types::{
    UiOverlayProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection,
    UiSurfacePseudoStateProjection, UiSurfaceTransitionEasingProjection,
    UiSurfaceTransitionPropertyProjection,
};
use super::command::{
    scroll_clip_command, surface_background_gradient_command, surface_background_image_command,
    surface_border_edge_commands, surface_box_shadow_commands, surface_node_command,
    surface_scroll_panel_command, surface_text_shadow_commands,
};
use super::helpers::{node_rect, SurfaceNodeOffset};
use super::{SCROLL_CHILD_Z_OFFSET, SCROLL_CLIP_END_Z_OFFSET};

pub(super) fn append_surface_node_commands(
    commands: &mut Vec<DrawCommand>,
    seen_node_ids: &mut BTreeSet<String>,
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    offset: SurfaceNodeOffset,
    inherited_opacity: f32,
) {
    let start = commands.len();
    append_surface_node_commands_inner(
        commands,
        seen_node_ids,
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        inherited_opacity,
    );
    let opacity = node.opacity * resolve_opacity(&node.style, 1.0);
    let blur_radius = node.style.filter.map_or(0.0, |f| f.blur);
    if opacity < 1.0
        || blur_radius > 0.0
        || node.state_styles.values().any(|s| {
            resolve_opacity(&s.style, 1.0) < 1.0 || s.style.filter.is_some_and(|f| f.blur > 0.0)
        })
    {
        let group = crate::render_graph::DrawCompositeGroup {
            id: format!("ui:{}:{}", overlay.element_id, node.id),
            opacity,
            blur_radius,
            z_index: z_base.saturating_add(node.z_index),
        };
        for command in &mut commands[start..] {
            command.composite_groups.insert(0, group.clone());
            for (state, variant) in &mut command.interaction_variants {
                let mut group = group.clone();
                if command.interaction_group_id.as_deref() == Some(group.id.as_str()) {
                    if let Some((_, style)) = node
                        .state_styles
                        .iter()
                        .find(|(key, _)| interaction_state(**key) == *state)
                    {
                        group.opacity = node.opacity * resolve_opacity(&style.style, 1.0);
                        group.blur_radius = style.style.filter.map_or(0.0, |f| f.blur);
                    }
                }
                variant.composite_groups.insert(0, group);
            }
        }
    }
    let radius = super::super::style::resolve_border_radius(&node.style, 0.0);
    if radius <= 0.0
        && node
            .state_styles
            .values()
            .all(|state| super::super::style::resolve_border_radius(&state.style, 0.0) <= 0.0)
    {
        return;
    }
    let clip = crate::render_graph::RoundedClip {
        bounds: node_rect(node.bounds, offset),
        radius,
        corner_radii: Some(super::super::style::resolve_corner_radii(&node.style)),
    };
    let id = format!("ui:{}:{}", overlay.element_id, node.id);
    fn descendant_ids(node: &UiSurfaceNodeProjection, overlay: &str, ids: &mut Vec<String>) {
        for child in &node.children {
            ids.push(format!("ui:{overlay}:{}", child.id));
            descendant_ids(child, overlay, ids);
        }
    }
    let mut descendants = Vec::new();
    descendant_ids(node, &overlay.element_id, &mut descendants);
    for command in &mut commands[start..] {
        let own = (command.id == id || command.id.starts_with(&format!("{id}:")))
            && !descendants.iter().any(|child_id| {
                command.id == *child_id || command.id.starts_with(&format!("{child_id}:"))
            });
        let own_media = own
            && (matches!(
                command.params,
                DrawCommandParams::Image(_) | DrawCommandParams::BackdropBlur(_)
            ) || command.id.contains(":border-"));
        let asymmetric = |r: [f64; 4]| r.iter().any(|value| *value != r[0]);
        let own_asymmetric = own
            && (asymmetric(clip.resolved_radii())
                || node
                    .state_styles
                    .values()
                    .any(|s| asymmetric(super::super::style::resolve_corner_radii(&s.style))))
            && matches!(
                command.params,
                DrawCommandParams::Panel(_)
                    | DrawCommandParams::UiButton(_)
                    | DrawCommandParams::Gradient(_)
            );
        if own_asymmetric {
            fn square(params: &mut DrawCommandParams) {
                match params {
                    DrawCommandParams::Panel(p) => p.corner_radius = 0.0,
                    DrawCommandParams::UiButton(p) => p.corner_radius = 0.0,
                    DrawCommandParams::Gradient(p) => p.corner_radius = 0.0,
                    _ => {}
                }
            }
            square(&mut command.params);
            for variant in command.interaction_variants.values_mut() {
                square(&mut variant.params);
            }
        }
        if own_media
            || own_asymmetric
            || (!own && (node.clip_children || node.kind == UiSurfaceNodeKind::Scroll))
        {
            command.rounded_clips.push(clip);
            for (state, variant) in &mut command.interaction_variants {
                variant.rounded_clips.push(if own_media || own_asymmetric {
                    crate::render_graph::RoundedClip {
                        corner_radii: Some(
                            node.state_styles
                                .iter()
                                .find(|(key, _)| interaction_state(**key) == *state)
                                .map(|(_, state)| {
                                    super::super::style::resolve_corner_radii(&state.style)
                                })
                                .unwrap_or(clip.resolved_radii()),
                        ),
                        bounds: node
                            .state_styles
                            .iter()
                            .find(|(key, _)| interaction_state(**key) == *state)
                            .map(|(_, state)| node_rect(state.bounds, offset))
                            .unwrap_or(clip.bounds),
                        radius: node
                            .state_styles
                            .iter()
                            .find(|(key, _)| interaction_state(**key) == *state)
                            .map(|(_, state)| {
                                super::super::style::resolve_border_radius(&state.style, 0.0)
                            })
                            .unwrap_or(radius),
                    }
                } else {
                    clip
                });
            }
        }
    }
}

fn append_surface_node_commands_inner(
    commands: &mut Vec<DrawCommand>,
    seen_node_ids: &mut BTreeSet<String>,
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    offset: SurfaceNodeOffset,
    inherited_opacity: f32,
) {
    if !node.visible
        || !is_safe_native_dispatch_identifier(&node.id)
        || !is_safe_native_ui_surface_node_numbers(node)
        || !is_safe_native_ui_surface_offset(offset.x, offset.y)
        || !seen_node_ids.insert(node.id.clone())
    {
        return;
    }

    // Node opacity belongs to its subtree composite, never to each child draw.
    // Keeping primitive alpha independent also allows a zero-opacity group to
    // become visible through a pseudo-state without losing its child colors.
    let effective_opacity = inherited_opacity;
    if is_surface_group_node(node.kind) {
        let child_clip_bounds = node_child_clip_bounds(node, clip_bounds, offset);
        let child_clip_bounds = child_clip_bounds.as_deref().unwrap_or(clip_bounds);
        for child in &node.children {
            append_surface_node_commands(
                commands,
                seen_node_ids,
                overlay,
                child,
                z_base,
                child_clip_bounds,
                offset,
                effective_opacity,
            );
        }
        return;
    }

    if node.kind == UiSurfaceNodeKind::Spacer {
        return;
    }

    if node.kind == UiSurfaceNodeKind::Layer {
        let child_z_base = z_base.saturating_add(node.z_index);
        let child_clip_bounds = node_child_clip_bounds(node, clip_bounds, offset);
        let child_clip_bounds = child_clip_bounds.as_deref().unwrap_or(clip_bounds);
        for child in &node.children {
            append_surface_node_commands(
                commands,
                seen_node_ids,
                overlay,
                child,
                child_z_base,
                child_clip_bounds,
                offset,
                effective_opacity,
            );
        }
        return;
    }

    if node.kind == UiSurfaceNodeKind::SafeArea {
        let mut child_clip_bounds = clip_bounds.to_vec();
        child_clip_bounds.push(node_rect(node.bounds, offset));
        for child in &node.children {
            append_surface_node_commands(
                commands,
                seen_node_ids,
                overlay,
                child,
                z_base,
                &child_clip_bounds,
                offset,
                effective_opacity,
            );
        }
        return;
    }

    if node.kind == UiSurfaceNodeKind::Scroll {
        append_scroll_node_commands(
            commands,
            seen_node_ids,
            overlay,
            node,
            z_base,
            clip_bounds,
            offset,
            effective_opacity,
        );
        return;
    }

    append_painted_surface_node_commands(
        commands,
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        inherited_opacity,
    );
    let child_clip_bounds = node_child_clip_bounds(node, clip_bounds, offset);
    let child_clip_bounds = child_clip_bounds.as_deref().unwrap_or(clip_bounds);
    for child in &node.children {
        append_surface_node_commands(
            commands,
            seen_node_ids,
            overlay,
            child,
            z_base,
            child_clip_bounds,
            offset,
            effective_opacity,
        );
    }
}

fn append_backdrop_blur(
    commands: &mut Vec<DrawCommand>,
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    offset: SurfaceNodeOffset,
    effective_opacity: f32,
) {
    let bounds = node_rect(node.bounds, offset);
    let command_id = format!("ui:{}:{}", overlay.element_id, node.id);
    if let Some(blur_radius) = node
        .style
        .backdrop_filter
        .as_ref()
        .map(|filter| filter.blur_radius)
        .filter(|value| value.is_finite() && *value > 0.0)
    {
        commands.push(
            DrawCommand::new(
                format!("{command_id}:backdrop-blur"),
                crate::render_graph::RenderPlane::Screen,
                DrawCommandKind::BackdropBlur,
                bounds,
            )
            .z_index(z_base.saturating_add(node.z_index))
            .opacity(effective_opacity)
            .clip_bounds(clip_bounds.iter().copied())
            .params(DrawCommandParams::BackdropBlur(BackdropBlurDrawParams {
                blur_radius,
            })),
        );
    }
}

fn append_scroll_node_commands(
    commands: &mut Vec<DrawCommand>,
    seen_node_ids: &mut BTreeSet<String>,
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    offset: SurfaceNodeOffset,
    effective_opacity: f32,
) {
    let paint_start = commands.len();
    let bounds = node_rect(node.bounds, offset);
    let command_id = format!("ui:{}:{}", overlay.element_id, node.id);
    append_backdrop_blur(
        commands,
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        effective_opacity,
    );
    commands.extend(surface_box_shadow_commands(
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        effective_opacity,
        ShadowDrawStyle::Outer,
    ));
    commands.extend(surface_text_shadow_commands(
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        effective_opacity,
    ));
    commands.extend(surface_background_gradient_command(
        overlay,
        node,
        z_base,
        clip_bounds,
        &command_id,
        bounds,
        effective_opacity,
    ));
    if let Some(command) = surface_background_image_command(
        overlay,
        node,
        z_base,
        clip_bounds,
        &command_id,
        bounds,
        effective_opacity,
    ) {
        commands.push(command);
    }
    commands.push(surface_scroll_panel_command(
        overlay,
        node,
        z_base,
        clip_bounds,
        &command_id,
        bounds,
        effective_opacity,
    ));
    commands.extend(surface_border_edge_commands(
        overlay,
        node,
        z_base,
        clip_bounds,
        &command_id,
        bounds,
        effective_opacity,
    ));
    commands.extend(surface_box_shadow_commands(
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        effective_opacity,
        ShadowDrawStyle::Inset,
    ));
    let mut own_paint = commands.drain(paint_start..).collect();
    normalize_surface_paint(&mut own_paint, node, &command_id);
    commands.extend(own_paint);
    commands.push(scroll_clip_command(
        overlay,
        node,
        z_base.saturating_add(SCROLL_CHILD_Z_OFFSET),
        clip_bounds,
        &format!("{command_id}:clip-start"),
        DrawCommandKind::ClipStart,
        bounds,
    ));

    let mut child_clip_bounds = clip_bounds.to_vec();
    child_clip_bounds.push(bounds);
    let child_z_base = z_base.saturating_add(SCROLL_CHILD_Z_OFFSET * 2);
    let child_offset = offset.scrolled_by(node.scroll_offset_x, node.scroll_offset_y);
    for child in &node.children {
        append_surface_node_commands(
            commands,
            seen_node_ids,
            overlay,
            child,
            child_z_base,
            &child_clip_bounds,
            child_offset,
            effective_opacity,
        );
    }

    commands.push(scroll_clip_command(
        overlay,
        node,
        z_base.saturating_add(SCROLL_CLIP_END_Z_OFFSET),
        clip_bounds,
        &format!("{command_id}:clip-end"),
        DrawCommandKind::ClipEnd,
        bounds,
    ));
}

fn append_painted_surface_node_commands(
    commands: &mut Vec<DrawCommand>,
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    offset: SurfaceNodeOffset,
    effective_opacity: f32,
) {
    let mut node_commands = painted_surface_node_commands(
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        effective_opacity,
    );
    attach_interaction_variants(
        &mut node_commands,
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        effective_opacity,
    );
    commands.extend(node_commands);
}

fn painted_surface_node_commands(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    offset: SurfaceNodeOffset,
    effective_opacity: f32,
) -> Vec<DrawCommand> {
    let mut commands = Vec::new();
    let bounds = node_rect(node.bounds, offset);
    let command_id = format!("ui:{}:{}", overlay.element_id, node.id);
    append_backdrop_blur(
        &mut commands,
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        effective_opacity,
    );
    commands.extend(surface_box_shadow_commands(
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        effective_opacity,
        ShadowDrawStyle::Outer,
    ));
    commands.extend(surface_text_shadow_commands(
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        effective_opacity,
    ));
    commands.extend(surface_background_gradient_command(
        overlay,
        node,
        z_base,
        clip_bounds,
        &command_id,
        bounds,
        effective_opacity,
    ));
    if let Some(command) = surface_background_image_command(
        overlay,
        node,
        z_base,
        clip_bounds,
        &command_id,
        bounds,
        effective_opacity,
    ) {
        commands.push(command);
    }

    if let Some(command) = surface_node_command(
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        effective_opacity,
    ) {
        commands.push(command);
    }
    commands.extend(surface_border_edge_commands(
        overlay,
        node,
        z_base,
        clip_bounds,
        &command_id,
        bounds,
        effective_opacity,
    ));
    commands.extend(surface_box_shadow_commands(
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        effective_opacity,
        ShadowDrawStyle::Inset,
    ));
    normalize_surface_paint(&mut commands, node, &command_id);
    commands
}

// Background color is below background images/gradients; inset and text shadows
// are below foreground glyphs. A button's combined fill/label command must be
// separated when intermediate paint layers exist, or the fill hides its shadow.
fn normalize_surface_paint(
    commands: &mut Vec<DrawCommand>,
    _node: &UiSurfaceNodeProjection,
    id: &str,
) {
    let layered = commands.iter().any(|command| command.id.contains(":background-")
        || command.id.contains(":text-shadow")
        || matches!(&command.params, DrawCommandParams::Shadow(s) if s.style == ShadowDrawStyle::Inset));
    if !layered {
        return;
    }
    if let Some(main) = commands.iter_mut().find(|c| c.id == id) {
        let mut fill = main.clone();
        let paint = match &mut main.params {
            DrawCommandParams::Panel(p) => {
                let color = std::mem::replace(&mut p.fill_color, "transparent".into());
                Some((color, p.corner_radius, p.rotation_degrees))
            }
            DrawCommandParams::UiButton(p) => {
                let color = std::mem::replace(&mut p.background_color, "transparent".into());
                Some((color, p.corner_radius, 0.0))
            }
            _ => None,
        };
        if let Some((color, radius, rotation)) = paint {
            fill.id = format!("{id}:background-fill");
            fill.interactive = false;
            fill.control = None;
            fill.resource_ids.clear();
            fill.params = DrawCommandParams::Panel(crate::render_graph::PanelDrawParams {
                role: "ui-background-fill".into(),
                fill_color: color,
                corner_radius: radius,
                border: Default::default(),
                padding: Default::default(),
                intent: None,
                rotation_degrees: rotation,
            });
            commands.push(fill);
        }
    }
    commands.sort_by_key(surface_paint_rank);
}

fn surface_paint_rank(command: &DrawCommand) -> u8 {
    match &command.params {
        DrawCommandParams::BackdropBlur(_) => 0,
        DrawCommandParams::Shadow(shadow) if shadow.style == ShadowDrawStyle::Outer => 0,
        _ if command.id.ends_with(":background-fill") => 1,
        _ if command.id.contains(":background-") => 2,
        DrawCommandParams::Shadow(_) => 3,
        _ if command.id.contains(":text-shadow") => 4,
        _ if command.id.contains(":border-") => 6,
        _ => 5,
    }
}

fn attach_interaction_variants(
    base_commands: &mut Vec<DrawCommand>,
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    offset: SurfaceNodeOffset,
    effective_opacity: f32,
) {
    if node.state_styles.is_empty() {
        return;
    }

    let group_id = format!("ui:{}:{}", overlay.element_id, node.id);
    let transitions = node
        .transitions
        .iter()
        .map(|transition| DrawTransition {
            property: match transition.property {
                UiSurfaceTransitionPropertyProjection::All => DrawTransitionProperty::All,
                UiSurfaceTransitionPropertyProjection::BackgroundColor => {
                    DrawTransitionProperty::BackgroundColor
                }
                UiSurfaceTransitionPropertyProjection::BorderColor => {
                    DrawTransitionProperty::BorderColor
                }
                UiSurfaceTransitionPropertyProjection::BoxShadow => {
                    DrawTransitionProperty::BoxShadow
                }
                UiSurfaceTransitionPropertyProjection::Color => DrawTransitionProperty::Color,
                UiSurfaceTransitionPropertyProjection::Filter => DrawTransitionProperty::Filter,
                UiSurfaceTransitionPropertyProjection::Opacity => DrawTransitionProperty::Opacity,
                UiSurfaceTransitionPropertyProjection::Scale
                | UiSurfaceTransitionPropertyProjection::Transform
                | UiSurfaceTransitionPropertyProjection::Translate => {
                    DrawTransitionProperty::Transform
                }
            },
            duration_ms: transition.duration_ms,
            delay_ms: transition.delay_ms,
            easing: match transition.easing {
                UiSurfaceTransitionEasingProjection::Ease => DrawTransitionEasing::Ease,
                UiSurfaceTransitionEasingProjection::EaseIn => DrawTransitionEasing::EaseIn,
                UiSurfaceTransitionEasingProjection::EaseInOut => DrawTransitionEasing::EaseInOut,
                UiSurfaceTransitionEasingProjection::EaseOut => DrawTransitionEasing::EaseOut,
                UiSurfaceTransitionEasingProjection::Linear => DrawTransitionEasing::Linear,
                UiSurfaceTransitionEasingProjection::CubicBezier(points) => {
                    DrawTransitionEasing::CubicBezier(points)
                }
            },
        })
        .collect::<Vec<_>>();
    let state_commands = node
        .state_styles
        .iter()
        .map(|(state, state_style)| {
            let mut state_node = node.clone();
            state_node.bounds = state_style.bounds;
            state_node.style = state_style.style.clone();
            state_node.state_styles.clear();
            state_node.transitions.clear();
            (
                interaction_state(*state),
                painted_surface_node_commands(
                    overlay,
                    &state_node,
                    z_base,
                    clip_bounds,
                    offset,
                    effective_opacity,
                ),
            )
        })
        .collect::<BTreeMap<_, _>>();

    let mut ordered_ids = base_commands
        .iter()
        .map(|command| command.id.clone())
        .collect::<Vec<_>>();
    for commands in state_commands.values() {
        for command in commands {
            if !ordered_ids.contains(&command.id) {
                ordered_ids.push(command.id.clone());
            }
        }
    }
    let base_by_id = base_commands
        .drain(..)
        .map(|command| (command.id.clone(), command))
        .collect::<BTreeMap<_, _>>();

    for id in ordered_ids {
        let seed = base_by_id.get(&id).cloned().or_else(|| {
            state_commands
                .values()
                .find_map(|commands| commands.iter().find(|command| command.id == id).cloned())
        });
        let Some(mut command) = seed else {
            continue;
        };
        if !base_by_id.contains_key(&id) {
            command.opacity = 0.0;
            command.interactive = false;
        }
        command.interaction_group_id = Some(group_id.clone());
        command.interaction_transitions = transitions.clone();
        for (state, commands) in &state_commands {
            let variant = commands
                .iter()
                .find(|variant| variant.id == id)
                .map(DrawCommandVariant::from_command)
                .unwrap_or_else(|| DrawCommandVariant::hidden_from_command(&command));
            for resource in &variant.resource_ids {
                if !command.resource_ids.contains(resource) {
                    command.resource_ids.push(resource.clone());
                }
            }
            command.interaction_variants.insert(*state, variant);
        }
        base_commands.push(command);
    }
    base_commands.sort_by_key(surface_paint_rank);
}

fn interaction_state(state: UiSurfacePseudoStateProjection) -> DrawInteractionState {
    match state {
        UiSurfacePseudoStateProjection::Active => DrawInteractionState::Active,
        UiSurfacePseudoStateProjection::Focus => DrawInteractionState::Focus,
        UiSurfacePseudoStateProjection::FocusVisible => DrawInteractionState::FocusVisible,
        UiSurfacePseudoStateProjection::Hover => DrawInteractionState::Hover,
    }
}

fn node_child_clip_bounds(
    node: &UiSurfaceNodeProjection,
    clip_bounds: &[LogicalRect],
    offset: SurfaceNodeOffset,
) -> Option<Vec<LogicalRect>> {
    if !node.clip_children {
        return None;
    }

    let mut child_clip_bounds = clip_bounds.to_vec();
    child_clip_bounds.push(node_rect(node.bounds, offset));
    Some(child_clip_bounds)
}

fn is_surface_group_node(kind: UiSurfaceNodeKind) -> bool {
    matches!(
        kind,
        UiSurfaceNodeKind::Column
            | UiSurfaceNodeKind::Fragment
            | UiSurfaceNodeKind::Grid
            | UiSurfaceNodeKind::Row
            | UiSurfaceNodeKind::Stack
    )
}
