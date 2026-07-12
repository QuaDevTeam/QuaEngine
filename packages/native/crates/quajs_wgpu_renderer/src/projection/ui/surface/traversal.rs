use std::collections::{BTreeMap, BTreeSet};

use crate::projection::common::is_safe_native_dispatch_identifier;
use crate::projection::safety::{
    is_safe_native_ui_surface_node_numbers, is_safe_native_ui_surface_offset,
};
use crate::render_graph::{
    DrawCommand, DrawCommandKind, DrawCommandVariant, DrawInteractionState, DrawTransition,
    DrawTransitionEasing, DrawTransitionProperty, LogicalRect, ShadowDrawStyle,
};

use super::super::style::resolve_opacity;
use super::super::types::{
    UiOverlayProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection,
    UiSurfacePseudoStateProjection, UiSurfaceTransitionEasingProjection,
    UiSurfaceTransitionPropertyProjection,
};
use super::command::{
    scroll_clip_command, surface_background_gradient_command, surface_background_image_command,
    surface_box_shadow_commands, surface_node_command, surface_scroll_panel_command,
    surface_text_shadow_commands,
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
    if !node.visible
        || !is_safe_native_dispatch_identifier(&node.id)
        || !is_safe_native_ui_surface_node_numbers(node)
        || !is_safe_native_ui_surface_offset(offset.x, offset.y)
        || !seen_node_ids.insert(node.id.clone())
    {
        return;
    }

    let effective_opacity = inherited_opacity * node.opacity * resolve_opacity(&node.style, 1.0);
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
        effective_opacity,
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
    let bounds = node_rect(node.bounds, offset);
    let command_id = format!("ui:{}:{}", overlay.element_id, node.id);
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
    if let Some(command) = surface_background_gradient_command(
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
    commands.extend(surface_box_shadow_commands(
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        effective_opacity,
        ShadowDrawStyle::Inset,
    ));
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
    if let Some(command) = surface_background_gradient_command(
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
    commands.extend(surface_box_shadow_commands(
        overlay,
        node,
        z_base,
        clip_bounds,
        offset,
        effective_opacity,
        ShadowDrawStyle::Inset,
    ));
    commands
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
            easing: match transition.easing {
                UiSurfaceTransitionEasingProjection::Ease => DrawTransitionEasing::Ease,
                UiSurfaceTransitionEasingProjection::EaseIn => DrawTransitionEasing::EaseIn,
                UiSurfaceTransitionEasingProjection::EaseInOut => DrawTransitionEasing::EaseInOut,
                UiSurfaceTransitionEasingProjection::EaseOut => DrawTransitionEasing::EaseOut,
                UiSurfaceTransitionEasingProjection::Linear => DrawTransitionEasing::Linear,
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
