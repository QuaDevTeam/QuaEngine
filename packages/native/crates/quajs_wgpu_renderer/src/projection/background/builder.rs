use crate::projection::common::{
    insert_unique_safe_native_dispatch_identifier, is_safe_native_asset_name,
    is_safe_native_asset_type, is_safe_native_dispatch_identifier, PackageProvenance,
};
use crate::projection::safety::{
    is_safe_native_background_geometry, is_safe_native_background_origin,
    is_safe_native_background_rotation, is_safe_native_opacity, is_safe_native_video_playback_rate,
    is_safe_native_video_volume, is_safe_native_z_index,
};
use crate::render_graph::{
    CompositeBlendMode, CompositeColorFilter, CompositeMaskMode, DrawCommand, DrawCommandKind,
    DrawCommandParams, DrawCompositeGroup, ImageDrawParams, RenderGraph, RenderPlane,
    VideoDrawParams,
};
use crate::resources::ResourceId;
use crate::stage_layout::ResolvedStageLayout;
use crate::video::{VideoBackendFrameResourceMap, BACKGROUND_VIDEO_STREAM_ID};

use super::layout::{full_stage_rect, media_fit, media_origin, resolve_background_bounds};
use super::types::{
    BackgroundCompositionProjection, BackgroundLayerProjection, BackgroundMode,
    BackgroundProjection, BackgroundVideoProjection,
};

pub fn append_background_commands(graph: &mut RenderGraph, background: &BackgroundProjection) {
    graph.extend(build_background_commands_with_video_frame_resources(
        &graph.layout,
        background,
        &VideoBackendFrameResourceMap::new(),
    ));
}

pub fn append_background_commands_with_video_frame_resources(
    graph: &mut RenderGraph,
    background: &BackgroundProjection,
    video_frame_resources: &VideoBackendFrameResourceMap,
) {
    graph.extend(build_background_commands_with_video_frame_resources(
        &graph.layout,
        background,
        video_frame_resources,
    ));
}

pub fn build_background_commands(
    layout: &ResolvedStageLayout,
    background: &BackgroundProjection,
) -> Vec<DrawCommand> {
    build_background_commands_with_video_frame_resources(
        layout,
        background,
        &VideoBackendFrameResourceMap::new(),
    )
}

pub fn build_background_commands_with_video_frame_resources(
    layout: &ResolvedStageLayout,
    background: &BackgroundProjection,
    video_frame_resources: &VideoBackendFrameResourceMap,
) -> Vec<DrawCommand> {
    if !is_safe_native_opacity(background.opacity) {
        return Vec::new();
    }
    let mut commands: Vec<DrawCommand> = match background.mode {
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
            .and_then(|video| {
                background_video_command(layout, background, video, video_frame_resources)
            })
            .into_iter()
            .collect(),
        // Unknown / future modes produce no draw commands rather than failing.
        BackgroundMode::Unknown => Vec::new(),
    };
    if background.mode == BackgroundMode::Layered {
        // Web's transformed layered root is a stacking context even at full
        // opacity: children blend with siblings, never with external content.
        let mut group = composition_group(
            "background:root",
            0,
            background.opacity,
            background.composition.as_ref(),
        );
        if group.mask_resource_id.is_some() {
            group.mask_bounds = Some(full_stage_rect(layout));
        }
        for command in &mut commands {
            command.composite_groups.insert(0, group.clone());
            if let Some(id) = &group.mask_resource_id {
                if !command.resource_ids.iter().any(|r| r.as_str() == id) {
                    command.resource_ids.push(ResourceId::new(id));
                }
            }
            // Preserve the layer owner while retaining parent dependencies.
            if let Some(id) = background.provenance.safe_content_package_id() {
                command.required_package_ids.insert(id.to_string());
            }
            for id in background.provenance.safe_required_runtime_packages() {
                command.required_package_ids.insert(id.to_string());
            }
        }
    }
    commands
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
            brightness: 1.0,
            saturation: 1.0,
            contrast: 1.0,
            grayscale: 0.0,
            sepia: 0.0,
            hue_rotate_radians: 0.0,
            invert: 0.0,
        }));

    Some(apply_mask_resource(
        apply_composition(
            apply_provenance(command, &background.provenance),
            background.composition.as_ref(),
            background.scale,
        ),
        background.composition.as_ref(),
    ))
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
        brightness: 1.0,
        saturation: 1.0,
        contrast: 1.0,
        grayscale: 0.0,
        sepia: 0.0,
        hue_rotate_radians: 0.0,
        invert: 0.0,
    }));

    Some(apply_mask_resource(
        apply_composition(
            apply_provenance(command, &layer.provenance),
            layer.composition.as_ref(),
            layer.scale,
        ),
        layer.composition.as_ref(),
    ))
}

fn background_video_command(
    layout: &ResolvedStageLayout,
    background: &BackgroundProjection,
    video: &BackgroundVideoProjection,
    video_frame_resources: &VideoBackendFrameResourceMap,
) -> Option<DrawCommand> {
    if !is_safe_native_opacity(video.opacity)
        || !is_safe_native_background_origin(video.origin.as_deref())
        || !is_safe_native_video_volume(video.volume)
        || !is_safe_native_video_playback_rate(video.playback_rate)
    {
        return None;
    }

    let asset_type = "video".to_string();
    let frame_resource_id = video_frame_resources
        .get(BACKGROUND_VIDEO_STREAM_ID)
        .map(|frame| frame.resource_id.clone());
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
    .opacity(background.opacity)
    .params(DrawCommandParams::Video(VideoDrawParams {
        asset_type,
        asset_name: video.asset_name.clone(),
        frame_resource_id: frame_resource_id.clone(),
        poster_asset_name: poster_asset_name.clone(),
        looped: video.looped,
        muted: video.muted,
        volume: video.volume,
        playback_rate: video.playback_rate,
        seek_ms: video.seek_ms,
        offset_ms: video.offset_ms,
        fit: media_fit(background.fit),
        origin: media_origin(background.origin.as_deref()),
        source: full_stage_rect(layout),
        fallback_reason: frame_resource_id
            .is_none()
            .then(|| "native video decode backend is not active".to_string()),
    }));

    if let Some(frame_resource_id) = frame_resource_id {
        command = command.resource(frame_resource_id);
    } else if let Some(poster) = &poster_asset_name {
        command = command.resource(background_resource_id("images", poster));
    }

    let command = apply_provenance(command, &video.provenance);
    Some(apply_mask_resource(
        apply_composition(command, background.composition.as_ref(), 1.0),
        background.composition.as_ref(),
    ))
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

fn apply_composition(
    mut command: DrawCommand,
    composition: Option<&BackgroundCompositionProjection>,
    scale: f64,
) -> DrawCommand {
    if let Some(composition) = composition {
        let mut group = composition_group(
            &command.id,
            command.z_index,
            command.opacity,
            Some(composition),
        );
        if let Some(shadow) = &mut group.drop_shadow {
            shadow.sigma *= scale;
            shadow.offset = shadow.offset.map(|n| n * scale);
            if let DrawCommandParams::Image(image) = &command.params {
                let (sin, cos) = image.rotation_degrees.to_radians().sin_cos();
                let [x, y] = shadow.offset;
                shadow.offset = [x * cos - y * sin, x * sin + y * cos];
            }
        }
        if group.mask_resource_id.is_some() {
            group.mask_bounds = Some(command.bounds);
            group.mask_scale = scale;
            if let DrawCommandParams::Image(image) = &command.params {
                group.mask_rotation = image.rotation_degrees;
            }
        }
        if composition.isolation
            || group.blend_mode != CompositeBlendMode::Normal
            || group.blur_radius > 0.0
            || group.color_filter != CompositeColorFilter::default()
            || group.mask_resource_id.is_some()
            || group.drop_shadow.is_some()
        {
            // Alpha belongs to the group, not to each pixel before the filter.
            command.opacity = 1.0;
            command.composite_groups.push(group);
        }
    }
    command
}

fn apply_mask_resource(
    mut command: DrawCommand,
    composition: Option<&BackgroundCompositionProjection>,
) -> DrawCommand {
    let Some(mask) = composition.and_then(|value| value.mask.as_ref()) else {
        return command;
    };
    let Some(asset_name) = mask
        .asset_name
        .as_deref()
        .filter(|value| is_safe_native_asset_name(value))
    else {
        return command;
    };
    let Some(asset_type) = resolve_background_asset_type(mask.asset_type.as_deref()) else {
        return command;
    };
    // Include the mask in QPK lookup and package unload guards. The compositor
    // samples it separately from the source image.
    command = command.resource(background_resource_id(&asset_type, asset_name));
    command
}

fn composition_group(
    id: &str,
    z_index: i32,
    opacity: f32,
    composition: Option<&BackgroundCompositionProjection>,
) -> DrawCompositeGroup {
    let filter = composition
        .and_then(|c| c.filter.as_ref())
        .cloned()
        .unwrap_or_default();
    DrawCompositeGroup {
        id: id.to_string(),
        z_index,
        opacity,
        blur_radius: filter.blur,
        blend_mode: CompositeBlendMode::from_css(
            composition
                .and_then(|c| c.blend_mode.as_deref())
                .unwrap_or("normal"),
        ),
        color_filter: CompositeColorFilter {
            brightness: filter.brightness as f32,
            contrast: filter.contrast as f32,
            saturation: filter.saturate as f32,
            hue_rotate_radians: filter.hue_rotate.to_radians() as f32,
            grayscale: filter.grayscale as f32,
            sepia: filter.sepia as f32,
            invert: filter.invert as f32,
        },
        drop_shadow: filter
            .drop_shadow
            .as_deref()
            .and_then(super::shadow::parse_drop_shadow),
        mask_resource_id: composition.and_then(|c| c.mask.as_ref()).and_then(|mask| {
            let name = mask
                .asset_name
                .as_deref()
                .filter(|name| is_safe_native_asset_name(name))?;
            let asset_type = resolve_background_asset_type(mask.asset_type.as_deref())?;
            Some(
                background_resource_id(&asset_type, name)
                    .as_str()
                    .to_string(),
            )
        }),
        mask_mode: match composition
            .and_then(|c| c.mask.as_ref())
            .and_then(|mask| mask.mode.as_deref())
            .map(str::to_ascii_lowercase)
            .as_deref()
        {
            Some("luminance") => CompositeMaskMode::Luminance,
            _ => CompositeMaskMode::Alpha,
        },
        mask_bounds: None,
        mask_layout: composition
            .and_then(|c| c.mask.as_ref())
            .and_then(|m| {
                crate::render_graph::mask::MaskLayout::parse(
                    m.position.as_deref(),
                    m.size.as_deref(),
                    m.repeat.as_deref(),
                )
                .ok()
            })
            .unwrap_or_default(),
        mask_scale: 1.0,
        mask_rotation: 0.0,
    }
}
