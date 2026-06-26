use crate::projection::common::PackageProvenance;
use crate::render_graph::{
    DrawCommand, DrawCommandKind, DrawCommandParams, ImageDrawParams, RenderGraph, RenderPlane,
    VideoDrawParams,
};
use crate::resources::ResourceId;
use crate::stage_layout::ResolvedStageLayout;

use super::layout::{full_stage_rect, media_fit, media_origin, resolve_background_bounds};
use super::types::{
    BackgroundLayerProjection, BackgroundMode, BackgroundProjection, BackgroundVideoProjection,
};

pub fn append_background_commands(graph: &mut RenderGraph, background: &BackgroundProjection) {
    graph.extend(build_background_commands(&graph.layout, background));
}

pub fn build_background_commands(
    layout: &ResolvedStageLayout,
    background: &BackgroundProjection,
) -> Vec<DrawCommand> {
    match background.mode {
        BackgroundMode::Image => background
            .asset_name
            .as_deref()
            .map(|asset_name| {
                background_image_command(layout, "background:main", asset_name, background)
            })
            .into_iter()
            .collect(),
        BackgroundMode::Layered => background
            .layers
            .iter()
            .filter(|layer| layer.visible)
            .map(|layer| background_layer_command(layout, layer))
            .collect(),
        BackgroundMode::Video => background
            .video
            .as_ref()
            .map(|video| background_video_command(layout, video))
            .into_iter()
            .collect(),
    }
}

fn background_image_command(
    layout: &ResolvedStageLayout,
    id: &str,
    asset_name: &str,
    background: &BackgroundProjection,
) -> DrawCommand {
    let bounds = resolve_background_bounds(
        layout,
        background.x,
        background.y,
        background.width,
        background.height,
        background.scale,
    );
    let asset_type = background
        .asset_type
        .clone()
        .unwrap_or_else(|| "images".to_string());
    let command = DrawCommand::new(id, RenderPlane::Scene, DrawCommandKind::Image, bounds)
        .opacity(background.opacity)
        .resource(background_resource_id(&asset_type, asset_name))
        .params(DrawCommandParams::Image(ImageDrawParams {
            asset_type,
            asset_name: asset_name.to_string(),
            fit: media_fit(background.fit),
            origin: media_origin(background.origin.as_deref()),
            source: full_stage_rect(layout),
            rotation_degrees: background.rotation,
        }));

    apply_provenance(command, &background.provenance)
}

fn background_layer_command(
    layout: &ResolvedStageLayout,
    layer: &BackgroundLayerProjection,
) -> DrawCommand {
    let bounds = resolve_background_bounds(
        layout,
        layer.x,
        layer.y,
        layer.width,
        layer.height,
        layer.scale,
    );
    let asset_type = layer
        .asset_type
        .clone()
        .unwrap_or_else(|| "images".to_string());
    let command = DrawCommand::new(
        format!("background:layer:{}", layer.id),
        RenderPlane::Scene,
        DrawCommandKind::Image,
        bounds,
    )
    .z_index(layer.z_index)
    .opacity(layer.opacity)
    .resource(background_resource_id(&asset_type, &layer.asset_name))
    .params(DrawCommandParams::Image(ImageDrawParams {
        asset_type,
        asset_name: layer.asset_name.clone(),
        fit: media_fit(layer.fit),
        origin: media_origin(layer.origin.as_deref()),
        source: full_stage_rect(layout),
        rotation_degrees: layer.rotation,
    }));

    apply_provenance(command, &layer.provenance)
}

fn background_video_command(
    layout: &ResolvedStageLayout,
    video: &BackgroundVideoProjection,
) -> DrawCommand {
    let asset_type = "video".to_string();
    let mut command = DrawCommand::new(
        "background:video",
        RenderPlane::Scene,
        DrawCommandKind::VideoFrame,
        full_stage_rect(layout),
    )
    .opacity(video.opacity)
    .params(DrawCommandParams::Video(VideoDrawParams {
        asset_type,
        asset_name: video.asset_name.clone(),
        poster_asset_name: video.poster.clone(),
        fit: media_fit(video.fit),
        origin: media_origin(video.origin.as_deref()),
        source: full_stage_rect(layout),
        fallback_reason: Some("native video decode backend is not active".to_string()),
    }));

    if let Some(poster) = &video.poster {
        command = command.resource(background_resource_id("images", poster));
    }

    apply_provenance(command, &video.provenance)
}

fn apply_provenance(mut command: DrawCommand, provenance: &PackageProvenance) -> DrawCommand {
    if let Some(package_id) = &provenance.content_package_id {
        command = command.owned_by(package_id.clone());
    }

    for package_id in &provenance.required_runtime_packages {
        command = command.require_package(package_id.clone());
    }

    command
}

fn background_resource_id(asset_type: &str, asset_name: &str) -> ResourceId {
    ResourceId::new(format!("{asset_type}:{asset_name}"))
}
