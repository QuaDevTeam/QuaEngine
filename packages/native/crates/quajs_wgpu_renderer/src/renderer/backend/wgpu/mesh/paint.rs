use crate::resources::ResourceId;

use super::super::super::NativeBackendEncoderSkipReason;
use super::super::primitive::{
    WgpuNativeRenderPrimitive, WgpuNativeRenderPrimitiveBorder, WgpuNativeRenderPrimitiveKind,
    WgpuNativeRenderTextStyle,
};
use super::color::{parse_color_literal, WgpuNativeRenderColor, WgpuNativeRenderPaintColor};

#[derive(Clone, Debug, PartialEq)]
pub enum WgpuNativeRenderPaint {
    Solid {
        color: WgpuNativeRenderPaintColor,
        literal: String,
    },
    Texture {
        resource_id: Option<ResourceId>,
        tint: WgpuNativeRenderColor,
    },
    TextPlaceholder {
        text: String,
        color: WgpuNativeRenderPaintColor,
        literal: String,
        style: WgpuNativeRenderTextStyle,
    },
    Skipped {
        reason: NativeBackendEncoderSkipReason,
        missing_resource_ids: Vec<ResourceId>,
    },
    InvalidColor {
        literal: String,
    },
    None,
}

impl WgpuNativeRenderPaint {
    pub(super) fn is_drawable(&self) -> bool {
        matches!(
            self,
            Self::Solid { .. } | Self::Texture { .. } | Self::TextPlaceholder { .. }
        )
    }

    pub(super) fn has_invalid_color(&self) -> bool {
        matches!(self, Self::InvalidColor { .. })
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderQuadBorder {
    pub color: Option<WgpuNativeRenderPaintColor>,
    pub literal: Option<String>,
    pub width: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuNativeRenderTextOverlay {
    pub text: String,
    pub color: WgpuNativeRenderPaintColor,
    pub literal: String,
    pub style: WgpuNativeRenderTextStyle,
}

pub(super) fn paint_from_primitive(
    primitive: &WgpuNativeRenderPrimitive,
) -> (
    WgpuNativeRenderPaint,
    f32,
    Option<WgpuNativeRenderQuadBorder>,
    Option<WgpuNativeRenderTextOverlay>,
) {
    match &primitive.kind {
        WgpuNativeRenderPrimitiveKind::Image { .. }
        | WgpuNativeRenderPrimitiveKind::VideoFallback { .. }
        | WgpuNativeRenderPrimitiveKind::VideoFrame { .. }
        | WgpuNativeRenderPrimitiveKind::Character { .. } => (
            WgpuNativeRenderPaint::Texture {
                resource_id: texture_resource_id(primitive),
                tint: WgpuNativeRenderColor::WHITE,
            },
            0.0,
            None,
            None,
        ),
        WgpuNativeRenderPrimitiveKind::Text { text, color, style } => {
            (text_paint(text, color, style), 0.0, None, None)
        }
        WgpuNativeRenderPrimitiveKind::Panel {
            fill_color,
            corner_radius,
            shadow_blur_radius: _,
            border,
            ..
        } => (
            solid_paint(fill_color),
            *corner_radius as f32,
            quad_border(border),
            None,
        ),
        WgpuNativeRenderPrimitiveKind::UiButton {
            label,
            enabled: _,
            background_color,
            text_color,
            text_style,
            corner_radius,
            border,
        } => (
            solid_paint(background_color),
            *corner_radius as f32,
            quad_border(border),
            text_overlay(label, text_color, text_style),
        ),
        WgpuNativeRenderPrimitiveKind::UiSurface { .. } | WgpuNativeRenderPrimitiveKind::Empty => {
            (WgpuNativeRenderPaint::None, 0.0, None, None)
        }
        WgpuNativeRenderPrimitiveKind::Skipped {
            reason,
            missing_resource_ids,
        } => (
            WgpuNativeRenderPaint::Skipped {
                reason: *reason,
                missing_resource_ids: missing_resource_ids.clone(),
            },
            0.0,
            None,
            None,
        ),
    }
}

fn solid_paint(literal: &str) -> WgpuNativeRenderPaint {
    match parse_color_literal(literal) {
        Some(color) => WgpuNativeRenderPaint::Solid {
            color,
            literal: literal.to_string(),
        },
        None => WgpuNativeRenderPaint::InvalidColor {
            literal: literal.to_string(),
        },
    }
}

fn text_paint(
    text: &str,
    literal: &str,
    style: &WgpuNativeRenderTextStyle,
) -> WgpuNativeRenderPaint {
    match parse_color_literal(literal) {
        Some(color) => WgpuNativeRenderPaint::TextPlaceholder {
            text: text.to_string(),
            color,
            literal: literal.to_string(),
            style: style.clone(),
        },
        None => WgpuNativeRenderPaint::InvalidColor {
            literal: literal.to_string(),
        },
    }
}

fn text_overlay(
    text: &str,
    literal: &str,
    style: &WgpuNativeRenderTextStyle,
) -> Option<WgpuNativeRenderTextOverlay> {
    parse_color_literal(literal).map(|color| WgpuNativeRenderTextOverlay {
        text: text.to_string(),
        color,
        literal: literal.to_string(),
        style: style.clone(),
    })
}

fn quad_border(border: &WgpuNativeRenderPrimitiveBorder) -> Option<WgpuNativeRenderQuadBorder> {
    if border.width <= 0.0 {
        return None;
    }

    Some(WgpuNativeRenderQuadBorder {
        color: border.color.as_deref().and_then(parse_color_literal),
        literal: border.color.clone(),
        width: border.width as f32,
    })
}

fn texture_resource_id(primitive: &WgpuNativeRenderPrimitive) -> Option<ResourceId> {
    match &primitive.kind {
        WgpuNativeRenderPrimitiveKind::VideoFallback {
            poster_asset_name: Some(poster_asset_name),
            ..
        } => primitive
            .resource_ids
            .iter()
            .find(|resource_id| resource_asset_name(resource_id) == poster_asset_name)
            .cloned()
            .or_else(|| Some(ResourceId::from(format!("images:{poster_asset_name}")))),
        WgpuNativeRenderPrimitiveKind::VideoFrame {
            frame_resource_id, ..
        } => primitive
            .resource_ids
            .iter()
            .find(|resource_id| *resource_id == frame_resource_id)
            .cloned()
            .or_else(|| Some(frame_resource_id.clone())),
        _ => primitive.resource_ids.first().cloned(),
    }
}

fn resource_asset_name(resource_id: &ResourceId) -> &str {
    resource_id
        .as_str()
        .split_once(':')
        .map(|(_, asset_name)| asset_name)
        .unwrap_or_else(|| resource_id.as_str())
}
