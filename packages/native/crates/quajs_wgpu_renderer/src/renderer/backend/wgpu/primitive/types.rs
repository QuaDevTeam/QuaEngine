use crate::render_graph::{
    BorderDrawParams, DrawBatchPipeline, DrawCommandKind, EdgeInsetsDrawParam, FontStyleDrawParam,
    FontWeightDrawParam, LogicalRect, MediaFit, MediaOrigin, TextAlign, TextDecorationDrawParam,
    TextDrawParams, TextOverflowDrawParam, TextTransformDrawParam, UiButtonDrawParams,
    WhiteSpaceDrawParam,
};
use crate::resources::ResourceId;

use super::super::super::NativeBackendEncoderSkipReason;
use super::super::physical::WgpuPhysicalRect;

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderPrimitive {
    pub command_id: String,
    pub pipeline: DrawBatchPipeline,
    pub draw_kind: DrawCommandKind,
    pub kind: WgpuNativeRenderPrimitiveKind,
    pub logical_bounds: LogicalRect,
    pub physical_bounds: WgpuPhysicalRect,
    pub scissor: Option<WgpuPhysicalRect>,
    pub opacity: f32,
    pub owner_package_id: Option<String>,
    pub required_package_ids: Vec<String>,
    pub resource_ids: Vec<ResourceId>,
}

impl WgpuNativeRenderPrimitive {
    pub fn is_visible(&self) -> bool {
        !self.physical_bounds.is_empty()
            && self.scissor.map_or(true, |rect| !rect.is_empty())
            && self.opacity > 0.0
            && !matches!(
                self.kind,
                WgpuNativeRenderPrimitiveKind::Empty
                    | WgpuNativeRenderPrimitiveKind::Skipped { .. }
            )
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderTextStyle {
    pub font_family: Vec<String>,
    pub font_size: f64,
    pub font_style: FontStyleDrawParam,
    pub font_weight: Option<FontWeightDrawParam>,
    pub letter_spacing: f64,
    pub line_height: f64,
    pub align: TextAlign,
    pub vertical_align: WgpuNativeRenderVerticalAlign,
    pub text_decoration: TextDecorationDrawParam,
    pub text_overflow: TextOverflowDrawParam,
    pub text_transform: TextTransformDrawParam,
    pub white_space: WhiteSpaceDrawParam,
    pub padding: EdgeInsetsDrawParam,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum WgpuNativeRenderVerticalAlign {
    Top,
    #[default]
    Middle,
    Bottom,
}

impl From<&TextDrawParams> for WgpuNativeRenderTextStyle {
    fn from(params: &TextDrawParams) -> Self {
        Self::from_text_params(params, 1.0)
    }
}

impl WgpuNativeRenderTextStyle {
    pub fn from_text_params(params: &TextDrawParams, physical_scale: f64) -> Self {
        Self {
            font_family: params.font_family.clone(),
            font_size: params.font_size * physical_scale,
            font_style: params.font_style,
            font_weight: params.font_weight.clone(),
            letter_spacing: params.letter_spacing * physical_scale,
            line_height: params.line_height * physical_scale,
            align: params.align,
            vertical_align: if params.role == "dialogue-text" {
                WgpuNativeRenderVerticalAlign::Top
            } else {
                WgpuNativeRenderVerticalAlign::Middle
            },
            text_decoration: params.text_decoration,
            text_overflow: params.text_overflow,
            text_transform: params.text_transform,
            white_space: params.white_space,
            padding: scale_edge_insets(params.padding, physical_scale),
        }
    }

    pub fn from_button_params(params: &UiButtonDrawParams, physical_scale: f64) -> Self {
        Self {
            font_family: params.font_family.clone(),
            font_size: params.font_size * physical_scale,
            font_style: params.font_style,
            font_weight: params.font_weight.clone(),
            letter_spacing: params.letter_spacing * physical_scale,
            line_height: params.line_height * physical_scale,
            align: params.align,
            vertical_align: WgpuNativeRenderVerticalAlign::Middle,
            text_decoration: params.text_decoration,
            text_overflow: params.text_overflow,
            text_transform: params.text_transform,
            white_space: params.white_space,
            padding: scale_edge_insets(params.padding, physical_scale),
        }
    }
}

impl From<&UiButtonDrawParams> for WgpuNativeRenderTextStyle {
    fn from(params: &UiButtonDrawParams) -> Self {
        Self::from_button_params(params, 1.0)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum WgpuNativeRenderPrimitiveKind {
    Image {
        asset_type: String,
        asset_name: String,
        fit: MediaFit,
        origin: MediaOrigin,
        source: LogicalRect,
        rotation_degrees: f64,
    },
    VideoFallback {
        asset_type: String,
        asset_name: String,
        poster_asset_name: Option<String>,
        looped: Option<bool>,
        muted: Option<bool>,
        volume: Option<f32>,
        playback_rate: Option<f32>,
        seek_ms: Option<f64>,
        offset_ms: Option<f64>,
        fit: MediaFit,
        origin: MediaOrigin,
        source: LogicalRect,
        fallback_reason: Option<String>,
    },
    VideoFrame {
        asset_type: String,
        asset_name: String,
        frame_resource_id: ResourceId,
        looped: Option<bool>,
        muted: Option<bool>,
        volume: Option<f32>,
        playback_rate: Option<f32>,
        seek_ms: Option<f64>,
        offset_ms: Option<f64>,
        fit: MediaFit,
        origin: MediaOrigin,
        source: LogicalRect,
    },
    Character {
        character_id: String,
        sprite_asset_name: String,
        rotation_degrees: f64,
    },
    Text {
        text: String,
        color: String,
        style: WgpuNativeRenderTextStyle,
    },
    Panel {
        fill_color: String,
        corner_radius: f64,
        border: WgpuNativeRenderPrimitiveBorder,
    },
    UiButton {
        label: String,
        enabled: bool,
        background_color: String,
        text_color: String,
        text_style: WgpuNativeRenderTextStyle,
        corner_radius: f64,
        border: WgpuNativeRenderPrimitiveBorder,
    },
    UiSurface {
        element_id: String,
        surface_key: Option<String>,
        interactive: bool,
    },
    Empty,
    Skipped {
        reason: NativeBackendEncoderSkipReason,
        missing_resource_ids: Vec<ResourceId>,
    },
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderPrimitiveBorder {
    pub color: Option<String>,
    pub width: f64,
}

impl From<&BorderDrawParams> for WgpuNativeRenderPrimitiveBorder {
    fn from(border: &BorderDrawParams) -> Self {
        Self::from_draw_params(border, 1.0)
    }
}

impl WgpuNativeRenderPrimitiveBorder {
    pub fn from_draw_params(border: &BorderDrawParams, physical_scale: f64) -> Self {
        Self {
            color: border.color.clone(),
            width: border.width * physical_scale,
        }
    }
}

fn scale_edge_insets(insets: EdgeInsetsDrawParam, physical_scale: f64) -> EdgeInsetsDrawParam {
    EdgeInsetsDrawParam {
        top: insets.top * physical_scale,
        right: insets.right * physical_scale,
        bottom: insets.bottom * physical_scale,
        left: insets.left * physical_scale,
    }
}
