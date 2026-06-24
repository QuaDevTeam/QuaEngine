mod command;
mod helpers;
mod traversal;

use crate::render_graph::DrawCommand;

use super::types::{UiOverlayProjection, UiOverlaySurfaceProjection};
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
    let Some(root) = &surface.root else {
        return Vec::new();
    };

    let mut commands = Vec::new();
    append_surface_node_commands(
        &mut commands,
        overlay,
        root,
        base_z_index + SURFACE_NODE_Z_OFFSET,
        &[],
        ROOT_SURFACE_OPACITY,
    );
    commands
}
