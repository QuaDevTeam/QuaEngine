use crate::projection::common::{is_safe_native_dispatch_identifier, PackageProvenance};
use crate::render_graph::{DrawCommand, LogicalRect, RendererIntent};

use super::super::types::{UiIntentProjection, UiOverlayProjection, UiSurfaceNodeProjection};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(super) struct SurfaceNodeOffset {
    pub x: f64,
    pub y: f64,
}

impl SurfaceNodeOffset {
    pub fn scrolled_by(self, x: f64, y: f64) -> Self {
        Self {
            x: self.x - x,
            y: self.y - y,
        }
    }
}

pub(super) fn renderer_intent(
    overlay: &UiOverlayProjection,
    node: &UiSurfaceNodeProjection,
    intent: &UiIntentProjection,
) -> Option<RendererIntent> {
    if !is_projectable_native_ui_intent_event(&intent.event) {
        return None;
    }

    let action = match intent.action.as_deref() {
        Some(action) if is_safe_native_dispatch_identifier(action) => Some(action.to_string()),
        Some(_) => return None,
        None => None,
    };
    let choice_id = match intent.choice_id.as_deref() {
        Some(choice_id) if is_safe_native_dispatch_identifier(choice_id) => {
            Some(choice_id.to_string())
        }
        Some(_) => return None,
        None if intent.event == "choice/select" => return None,
        None => None,
    };
    let metadata = intent
        .metadata
        .iter()
        .filter(|(key, _)| is_safe_native_dispatch_identifier(key))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();

    Some(RendererIntent {
        event: intent.event.clone(),
        choice_id,
        element_id: Some(format!("{}:{}", overlay.element_id, node.id)),
        action,
        metadata,
    })
}

fn is_projectable_native_ui_intent_event(event: &str) -> bool {
    matches!(event, "ui/intent" | "choice/select")
}

pub(super) fn node_rect(
    rect: super::super::types::UiSurfaceNodeRect,
    offset: SurfaceNodeOffset,
) -> LogicalRect {
    LogicalRect {
        x: rect.x + offset.x,
        y: rect.y + offset.y,
        width: rect.width,
        height: rect.height,
    }
}

pub(super) fn apply_provenance(
    mut command: DrawCommand,
    provenance: &PackageProvenance,
) -> DrawCommand {
    if let Some(package_id) = provenance.safe_content_package_id() {
        command = command.owned_by(package_id);
    }

    for package_id in provenance.safe_required_runtime_packages() {
        command = command.require_package(package_id);
    }

    command
}
