mod command;
mod helpers;
mod traversal;

use std::collections::BTreeSet;

use crate::projection::common::is_safe_native_dispatch_identifier;
use crate::render_graph::DrawCommand;

use super::types::{UiOverlayProjection, UiOverlaySurfaceProjection};
use helpers::SurfaceNodeOffset;
use traversal::append_surface_node_commands;

const SURFACE_NODE_Z_OFFSET: i32 = 10_000;
const SCROLL_CHILD_Z_OFFSET: i32 = 1;
const SCROLL_CLIP_END_Z_OFFSET: i32 = 1_000_000;
const ROOT_SURFACE_OPACITY: f32 = 1.0;

pub fn build_ui_surface_node_commands(
    overlay: &UiOverlayProjection,
    surface: &UiOverlaySurfaceProjection,
    base_z_index: i32,
) -> Vec<DrawCommand> {
    if !is_safe_native_dispatch_identifier(&overlay.element_id) {
        return Vec::new();
    }

    let Some(root) = &surface.root else {
        return Vec::new();
    };

    let mut commands = Vec::new();
    let mut seen_node_ids = BTreeSet::new();
    append_surface_node_commands(
        &mut commands,
        &mut seen_node_ids,
        overlay,
        root,
        base_z_index + SURFACE_NODE_Z_OFFSET,
        &[],
        SurfaceNodeOffset::default(),
        ROOT_SURFACE_OPACITY,
    );
    commands
}
