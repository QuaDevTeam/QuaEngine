use crate::projection::common::PackageProvenance;
use crate::render_graph::{DrawCommand, LogicalRect, RendererIntent};

use super::super::types::{UiIntentProjection, UiOverlayProjection, UiSurfaceNodeProjection};

pub(super) fn renderer_intent(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    intent: &UiIntentProjection,
) -> RendererIntent {
    RendererIntent {
        event: intent.event.clone(),
        choice_id: None,
        element_id: Some(format!("{}:{}", overlay.element_id, node.id)),
        action: intent.action.clone(),
    }
}

pub(super) fn node_rect(rect: super::super::types::UiSurfaceNodeRect) -> LogicalRect {
    LogicalRect {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    }
}

pub(super) fn apply_provenance(
    mut command: DrawCommand,
    provenance: &PackageProvenance,
) -> DrawCommand {
    if let Some(package_id) = &provenance.content_package_id {
        command = command.owned_by(package_id.clone());
    }

    for package_id in &provenance.required_runtime_packages {
        command = command.require_package(package_id.clone());
    }

    command
}
