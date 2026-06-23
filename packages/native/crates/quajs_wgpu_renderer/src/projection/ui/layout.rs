use std::cmp::Ordering;

use crate::render_graph::LogicalRect;
use crate::stage_layout::ResolvedStageLayout;

use super::types::{UiOverlayProjection, UiOverlayRenderMode, UiOverlaySurfaceProjection};

const OVERLAY_STACK_Z_INDEX_STRIDE: i32 = 1_000_000;
const DEFAULT_UI_Z_INDEX: i32 = 0;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedUiOverlayPlacement {
    pub overlay_stack: String,
    pub stack_priority: i32,
    pub z_index: i32,
    pub effective_z_index: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct UiOverlayPlacementDefaults {
    overlay_stack: &'static str,
    stack_priority: i32,
    z_index: i32,
}

pub fn ui_overlay_bounds(layout: &ResolvedStageLayout) -> LogicalRect {
    LogicalRect {
        x: 0.0,
        y: 0.0,
        width: layout.logical_width,
        height: layout.logical_height,
    }
}

pub fn resolve_ui_overlay_placement(overlay: &UiOverlayProjection) -> ResolvedUiOverlayPlacement {
    let defaults = default_ui_overlay_placement(&overlay.element_id);
    let scene_overlay = overlay
        .scene
        .as_ref()
        .and_then(|scene| scene.overlay.as_ref());
    let overlay_stack = normalize_overlay_stack(
        overlay
            .overlay_stack
            .as_deref()
            .or_else(|| scene_overlay.and_then(|overlay| overlay.overlay_stack.as_deref())),
        defaults.overlay_stack,
    );
    let stack_priority = overlay
        .stack_priority
        .or_else(|| scene_overlay.and_then(|overlay| overlay.stack_priority))
        .unwrap_or_else(|| {
            stack_priority_for_overlay_stack(&overlay_stack, defaults.stack_priority)
        });
    let z_index = overlay
        .z_index
        .or_else(|| scene_overlay.and_then(|overlay| overlay.z_index))
        .unwrap_or(defaults.z_index);

    ResolvedUiOverlayPlacement {
        overlay_stack,
        stack_priority,
        z_index,
        effective_z_index: stack_priority
            .saturating_mul(OVERLAY_STACK_Z_INDEX_STRIDE)
            .saturating_add(z_index),
    }
}

pub fn compare_ui_overlay_projection(
    left: &UiOverlayProjection,
    right: &UiOverlayProjection,
) -> Ordering {
    let left_placement = resolve_ui_overlay_placement(left);
    let right_placement = resolve_ui_overlay_placement(right);

    (
        left_placement.stack_priority,
        left_placement.z_index,
        left.element_id.as_str(),
    )
        .cmp(&(
            right_placement.stack_priority,
            right_placement.z_index,
            right.element_id.as_str(),
        ))
}

pub fn ui_overlay_render_mode(overlay: &UiOverlayProjection) -> UiOverlayRenderMode {
    if overlay.render_mode == UiOverlayRenderMode::RenderOnly
        || overlay
            .scene
            .as_ref()
            .is_some_and(|scene| scene.render_mode == UiOverlayRenderMode::RenderOnly)
    {
        UiOverlayRenderMode::RenderOnly
    } else {
        UiOverlayRenderMode::Ui
    }
}

pub fn ui_overlay_render_mode_name(render_mode: UiOverlayRenderMode) -> &'static str {
    match render_mode {
        UiOverlayRenderMode::Ui => "ui",
        UiOverlayRenderMode::RenderOnly => "render-only",
    }
}

pub fn ui_overlay_is_interactive(overlay: &UiOverlayProjection) -> bool {
    if !overlay.visible {
        return false;
    }

    if overlay
        .scene
        .as_ref()
        .is_some_and(|scene| scene.render_mode == UiOverlayRenderMode::RenderOnly)
    {
        return overlay
            .scene
            .as_ref()
            .and_then(|scene| scene.interactive)
            .unwrap_or(false);
    }

    if let Some(interactive) = overlay.interactive {
        return interactive;
    }

    if ui_overlay_render_mode(overlay) == UiOverlayRenderMode::RenderOnly {
        return overlay
            .scene
            .as_ref()
            .and_then(|scene| scene.interactive)
            .unwrap_or(false);
    }

    true
}

pub fn ui_overlay_surface(overlay: &UiOverlayProjection) -> Option<&UiOverlaySurfaceProjection> {
    if overlay
        .scene
        .as_ref()
        .is_some_and(|scene| scene.render_mode == UiOverlayRenderMode::RenderOnly)
    {
        return overlay
            .scene
            .as_ref()
            .and_then(|scene| scene.surface.as_ref())
            .or(overlay.surface.as_ref());
    }

    overlay.surface.as_ref().or_else(|| {
        overlay
            .scene
            .as_ref()
            .and_then(|scene| scene.surface.as_ref())
    })
}

fn default_ui_overlay_placement(element_id: &str) -> UiOverlayPlacementDefaults {
    if element_id == "confirm" || element_id == "titleConfirm" {
        UiOverlayPlacementDefaults {
            overlay_stack: "modal",
            stack_priority: 200,
            z_index: DEFAULT_UI_Z_INDEX,
        }
    } else {
        UiOverlayPlacementDefaults {
            overlay_stack: "overlay",
            stack_priority: 100,
            z_index: DEFAULT_UI_Z_INDEX,
        }
    }
}

fn normalize_overlay_stack(value: Option<&str>, fallback: &str) -> String {
    let normalized = value.unwrap_or(fallback).trim();
    if normalized.is_empty() {
        fallback.to_string()
    } else {
        normalized.to_string()
    }
}

fn stack_priority_for_overlay_stack(overlay_stack: &str, fallback: i32) -> i32 {
    match overlay_stack {
        "hud" => 0,
        "overlay" => 100,
        "modal" => 200,
        "toast" => 300,
        _ => fallback,
    }
}
