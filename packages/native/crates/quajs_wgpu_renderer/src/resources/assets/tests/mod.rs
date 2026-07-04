use std::collections::BTreeSet;

use super::*;
use crate::projection::background::{
    BackgroundMode, BackgroundProjection, BackgroundVideoProjection,
};
use crate::projection::character::CharacterProjection;
use crate::projection::common::PackageProvenance;
use crate::projection::view::{build_view_render_graph, ViewProjection};
use crate::render_graph::{DrawCommand, DrawCommandKind, LogicalRect, RenderGraph, RenderPlane};
use crate::resources::plan_render_graph_resources;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

mod declarative;
mod requests;
mod texture;

fn image_command(id: &str, resource_id: &str) -> DrawCommand {
    DrawCommand::new(id, RenderPlane::Scene, DrawCommandKind::Image, rect()).resource(resource_id)
}

fn rect() -> LogicalRect {
    LogicalRect {
        x: 0.0,
        y: 0.0,
        width: 100.0,
        height: 100.0,
    }
}

fn test_layout() -> ResolvedStageLayout {
    resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(1600.0),
            height: Some(1000.0),
            ..Default::default()
        },
    )
}

fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required
            .into_iter()
            .map(ToString::to_string)
            .collect::<BTreeSet<_>>(),
    }
}

fn set<const N: usize>(items: [&str; N]) -> BTreeSet<String> {
    items.into_iter().map(ToString::to_string).collect()
}
