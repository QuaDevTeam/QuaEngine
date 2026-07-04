use crate::projection::common::{
    insert_unique_safe_native_dispatch_identifier, is_safe_native_asset_name,
    is_safe_native_asset_type, is_safe_native_dispatch_identifier, PackageProvenance,
};
use crate::projection::safety::{
    is_safe_native_background_geometry, is_safe_native_background_origin,
    is_safe_native_background_rotation, is_safe_native_opacity, is_safe_native_z_index,
};
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
            .filter(|asset_name| is_safe_native_asset_name(asset_name))
            .and_then(|asset_name| {
                background_image_command(layout, "background:main", asset_name, background)
            })
            .into_iter()
            .collect(),
        BackgroundMode::Layered => background
            .layers
            .iter()
            .filter_map({
                let mut seen_layer_ids = std::collections::BTreeSet::new();
                move |layer| {
                    if !layer.visible
                        || !is_safe_native_dispatch_identifier(&layer.id)
                        || !is_safe_native_asset_name(&layer.asset_name)
                    {
                        return None;
                    }
                    let command = background_layer_command(layout, layer)?;
                    insert_unique_safe_native_dispatch_identifier(&mut seen_layer_ids, &layer.id)
                        .then_some(command)
                }
            })
            .collect(),
        BackgroundMode::Video => background
            .video
            .as_ref()
            .filter(|video| is_safe_native_asset_name(&video.asset_name))
            .and_then(|video| background_video_command(layout, video))
            .into_iter()
            .collect(),
    }
}

fn background_image_command(
    layout: &ResolvedStageLayout,
    id: &str,
    asset_name: &str,
    background: &BackgroundProjection,
) -> Option<DrawCommand> {
    if !is_safe_native_background_geometry(
        background.x,
        background.y,
        background.width,
        background.height,
        background.scale,
    ) || !is_safe_native_opacity(background.opacity)
        || !is_safe_native_background_rotation(background.rotation)
        || !is_safe_native_background_origin(background.origin.as_deref())
    {
        return None;
    }

    let bounds = resolve_background_bounds(
        layout,
        background.x,
        background.y,
        background.width,
        background.height,
        background.scale,
    );
    let asset_type = resolve_background_asset_type(background.asset_type.as_deref())?;
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

    Some(apply_provenance(command, &background.provenance))
}

fn background_layer_command(
    layout: &ResolvedStageLayout,
    layer: &BackgroundLayerProjection,
) -> Option<DrawCommand> {
    if !is_safe_native_background_geometry(layer.x, layer.y, layer.width, layer.height, layer.scale)
        || !is_safe_native_opacity(layer.opacity)
        || !is_safe_native_background_rotation(layer.rotation)
        || !is_safe_native_background_origin(layer.origin.as_deref())
        || !is_safe_native_z_index(layer.z_index)
    {
        return None;
    }

    let bounds = resolve_background_bounds(
        layout,
        layer.x,
        layer.y,
        layer.width,
        layer.height,
        layer.scale,
    );
    let asset_type = resolve_background_asset_type(layer.asset_type.as_deref())?;
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

    Some(apply_provenance(command, &layer.provenance))
}

fn background_video_command(
    layout: &ResolvedStageLayout,
    video: &BackgroundVideoProjection,
) -> Option<DrawCommand> {
    if !is_safe_native_opacity(video.opacity)
        || !is_safe_native_background_origin(video.origin.as_deref())
    {
        return None;
    }

    let asset_type = "video".to_string();
    let poster_asset_name = video
        .poster
        .as_deref()
        .filter(|poster| is_safe_native_asset_name(poster))
        .map(ToString::to_string);
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
        poster_asset_name: poster_asset_name.clone(),
        fit: media_fit(video.fit),
        origin: media_origin(video.origin.as_deref()),
        source: full_stage_rect(layout),
        fallback_reason: Some("native video decode backend is not active".to_string()),
    }));

    if let Some(poster) = &poster_asset_name {
        command = command.resource(background_resource_id("images", poster));
    }

    Some(apply_provenance(command, &video.provenance))
}

fn apply_provenance(mut command: DrawCommand, provenance: &PackageProvenance) -> DrawCommand {
    if let Some(package_id) = provenance.safe_content_package_id() {
        command = command.owned_by(package_id);
    }

    for package_id in provenance.safe_required_runtime_packages() {
        command = command.require_package(package_id);
    }

    command
}

fn background_resource_id(asset_type: &str, asset_name: &str) -> ResourceId {
    ResourceId::new(format!("{asset_type}:{asset_name}"))
}

fn resolve_background_asset_type(asset_type: Option<&str>) -> Option<String> {
    match asset_type {
        Some(asset_type) if is_safe_native_asset_type(asset_type) => Some(asset_type.to_string()),
        Some(_) => None,
        None => Some("images".to_string()),
    }
}
