use crate::render_graph::{DrawBatchPipeline, DrawCommandKind, DrawCommandParams};
use crate::resources::ResourceId;

use super::super::super::NativeBackendEncoderSkipReason;
use super::super::execution::{WgpuNativeRenderDrawMetadata, WgpuNativeRenderExecutionOperation};
use super::super::physical::WgpuPhysicalRect;
use super::{
    WgpuNativeRenderPrimitive, WgpuNativeRenderPrimitiveBorder, WgpuNativeRenderPrimitiveKind,
    WgpuNativeRenderTextStyle,
};

impl WgpuNativeRenderPrimitive {
    pub(super) fn from_execution_operation(
        operation: &WgpuNativeRenderExecutionOperation,
        scissor: Option<WgpuPhysicalRect>,
        bound_resource_ids: Option<Vec<ResourceId>>,
    ) -> Option<Self> {
        match operation {
            WgpuNativeRenderExecutionOperation::Draw {
                command_id,
                pipeline,
                kind,
                metadata,
                physical_bounds,
                ..
            } => Some(Self::from_draw(
                command_id,
                *pipeline,
                *kind,
                metadata,
                *physical_bounds,
                scissor,
                bound_resource_ids,
            )),
            WgpuNativeRenderExecutionOperation::SkipDraw {
                command_id,
                pipeline,
                kind,
                metadata,
                physical_bounds,
                reason,
                missing_resource_ids,
            } => Some(Self::from_skip(
                command_id,
                *pipeline,
                *kind,
                metadata,
                *physical_bounds,
                *reason,
                missing_resource_ids.clone(),
            )),
            _ => None,
        }
    }

    fn from_draw(
        command_id: &str,
        pipeline: DrawBatchPipeline,
        draw_kind: DrawCommandKind,
        metadata: &WgpuNativeRenderDrawMetadata,
        physical_bounds: WgpuPhysicalRect,
        scissor: Option<WgpuPhysicalRect>,
        bound_resource_ids: Option<Vec<ResourceId>>,
    ) -> Self {
        Self {
            command_id: command_id.to_string(),
            pipeline,
            draw_kind,
            kind: primitive_kind_from_params(draw_kind, &metadata.params),
            logical_bounds: metadata.bounds,
            physical_bounds,
            scissor,
            opacity: metadata.opacity,
            owner_package_id: metadata.owner_package_id.clone(),
            required_package_ids: metadata.required_package_ids.iter().cloned().collect(),
            resource_ids: bound_resource_ids
                .unwrap_or_else(|| resource_ids_from_params(&metadata.params)),
        }
    }

    fn from_skip(
        command_id: &str,
        pipeline: DrawBatchPipeline,
        draw_kind: DrawCommandKind,
        metadata: &WgpuNativeRenderDrawMetadata,
        physical_bounds: WgpuPhysicalRect,
        reason: NativeBackendEncoderSkipReason,
        missing_resource_ids: Vec<ResourceId>,
    ) -> Self {
        Self {
            command_id: command_id.to_string(),
            pipeline,
            draw_kind,
            kind: WgpuNativeRenderPrimitiveKind::Skipped {
                reason,
                missing_resource_ids: missing_resource_ids.clone(),
            },
            logical_bounds: metadata.bounds,
            physical_bounds,
            scissor: None,
            opacity: metadata.opacity,
            owner_package_id: metadata.owner_package_id.clone(),
            required_package_ids: metadata.required_package_ids.iter().cloned().collect(),
            resource_ids: missing_resource_ids,
        }
    }
}

fn primitive_kind_from_params(
    draw_kind: DrawCommandKind,
    params: &DrawCommandParams,
) -> WgpuNativeRenderPrimitiveKind {
    match params {
        DrawCommandParams::Image(params) => WgpuNativeRenderPrimitiveKind::Image {
            asset_type: params.asset_type.clone(),
            asset_name: params.asset_name.clone(),
            fit: params.fit,
            origin: params.origin,
            source: params.source,
            rotation_degrees: params.rotation_degrees,
        },
        DrawCommandParams::Video(params) => match &params.frame_resource_id {
            Some(frame_resource_id) if params.fallback_reason.is_none() => {
                WgpuNativeRenderPrimitiveKind::VideoFrame {
                    asset_type: params.asset_type.clone(),
                    asset_name: params.asset_name.clone(),
                    frame_resource_id: frame_resource_id.clone(),
                    looped: params.looped,
                    muted: params.muted,
                    volume: params.volume,
                    playback_rate: params.playback_rate,
                    fit: params.fit,
                    origin: params.origin,
                    source: params.source,
                }
            }
            _ => WgpuNativeRenderPrimitiveKind::VideoFallback {
                asset_type: params.asset_type.clone(),
                asset_name: params.asset_name.clone(),
                poster_asset_name: params.poster_asset_name.clone(),
                looped: params.looped,
                muted: params.muted,
                volume: params.volume,
                playback_rate: params.playback_rate,
                fit: params.fit,
                origin: params.origin,
                source: params.source,
                fallback_reason: params.fallback_reason.clone(),
            },
        },
        DrawCommandParams::Character(params) => WgpuNativeRenderPrimitiveKind::Character {
            character_id: params.character_id.clone(),
            sprite_asset_name: params.sprite_asset_name.clone(),
            rotation_degrees: params.rotation_degrees,
        },
        DrawCommandParams::Text(params) => WgpuNativeRenderPrimitiveKind::Text {
            text: params.text.clone(),
            color: params.color.clone(),
            style: WgpuNativeRenderTextStyle::from(params),
        },
        DrawCommandParams::Panel(params) => WgpuNativeRenderPrimitiveKind::Panel {
            fill_color: params.fill_color.clone(),
            corner_radius: params.corner_radius,
            border: WgpuNativeRenderPrimitiveBorder::from(&params.border),
        },
        DrawCommandParams::UiButton(params) => WgpuNativeRenderPrimitiveKind::UiButton {
            label: params.label.clone(),
            enabled: params.enabled,
            background_color: params.background_color.clone(),
            text_color: params.text_color.clone(),
            text_style: WgpuNativeRenderTextStyle::from(params),
            corner_radius: params.corner_radius,
            border: WgpuNativeRenderPrimitiveBorder::from(&params.border),
        },
        DrawCommandParams::UiSurface(params) => WgpuNativeRenderPrimitiveKind::UiSurface {
            element_id: params.element_id.clone(),
            surface_key: params.surface_key.clone(),
            interactive: params.interactive,
        },
        DrawCommandParams::None => primitive_kind_from_draw_kind(draw_kind),
    }
}

fn primitive_kind_from_draw_kind(draw_kind: DrawCommandKind) -> WgpuNativeRenderPrimitiveKind {
    match draw_kind {
        DrawCommandKind::Rect | DrawCommandKind::RoundedRect => {
            WgpuNativeRenderPrimitiveKind::Panel {
                fill_color: "#ffffff".to_string(),
                corner_radius: 0.0,
                border: WgpuNativeRenderPrimitiveBorder::default(),
            }
        }
        _ => WgpuNativeRenderPrimitiveKind::Empty,
    }
}

fn resource_ids_from_params(params: &DrawCommandParams) -> Vec<ResourceId> {
    match params {
        DrawCommandParams::Image(params) => {
            optional_resource_id(&params.asset_type, &params.asset_name)
                .into_iter()
                .collect()
        }
        DrawCommandParams::Video(params) => {
            let mut resources = params.frame_resource_id.iter().cloned().collect::<Vec<_>>();
            if resources.is_empty() {
                resources.extend(optional_resource_id(&params.asset_type, &params.asset_name));
            }
            if params.frame_resource_id.is_none() {
                if let Some(poster_asset_name) = &params.poster_asset_name {
                    resources.extend(optional_resource_id("images", poster_asset_name));
                }
            }
            resources
        }
        DrawCommandParams::Character(params) => {
            optional_resource_id("characters", &params.sprite_asset_name)
                .into_iter()
                .collect()
        }
        DrawCommandParams::Text(params) => params
            .font_family
            .iter()
            .filter_map(|font| optional_resource_id("fonts", font))
            .collect(),
        DrawCommandParams::UiSurface(params) => params
            .surface_key
            .iter()
            .filter_map(|surface_key| optional_resource_id("surface", surface_key))
            .collect(),
        DrawCommandParams::Panel(_) | DrawCommandParams::UiButton(_) | DrawCommandParams::None => {
            Vec::new()
        }
    }
}

fn optional_resource_id(asset_type: &str, asset_name: &str) -> Option<ResourceId> {
    let asset_type = asset_type.trim();
    let asset_name = asset_name.trim();
    if asset_type.is_empty() || asset_name.is_empty() {
        return None;
    }

    Some(ResourceId::from(format!("{asset_type}:{asset_name}")))
}
