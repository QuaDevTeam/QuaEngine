use crate::projection::common::is_safe_native_dispatch_identifier;
use crate::render_graph::{DrawCommand, DrawCommandKind, LogicalRect};

use super::super::style::resolve_opacity;
use super::super::types::{UiOverlayProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection};
use super::command::{
    scroll_clip_command, surface_background_image_command, surface_node_command,
    surface_scroll_panel_command,
};
use super::helpers::{node_rect, SurfaceNodeOffset};
use super::{SCROLL_CHILD_Z_OFFSET, SCROLL_CLIP_END_Z_OFFSET};

pub(super) fn append_surface_node_commands(
    commands: &mut Vec<DrawCommand>,
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    offset: SurfaceNodeOffset,
    inherited_opacity: f32,
) {
    if !node.visible || !is_safe_native_dispatch_identifier(&node.id) {
        return;
    }

    let effective_opacity = inherited_opacity * node.opacity * resolve_opacity(&node.style, 1.0);
    if is_surface_group_node(node.kind) {
        let child_clip_bounds = node_child_clip_bounds(node, clip_bounds, offset);
        let child_clip_bounds = child_clip_bounds.as_deref().unwrap_or(clip_bounds);
        for child in &node.children {
            append_surface_node_commands(
                commands,
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
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    z_base: i32,
    clip_bounds: &[LogicalRect],
    offset: SurfaceNodeOffset,
    effective_opacity: f32,
) {
    let bounds = node_rect(node.bounds, offset);
    let command_id = format!("ui:{}:{}", overlay.element_id, node.id);
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
    let bounds = node_rect(node.bounds, offset);
    let command_id = format!("ui:{}:{}", overlay.element_id, node.id);
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
