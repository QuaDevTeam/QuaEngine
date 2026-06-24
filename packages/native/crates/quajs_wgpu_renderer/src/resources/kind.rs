use crate::render_graph::DrawCommandKind;

use super::record::{NativeResourceKind, ResourceId};

pub(crate) fn infer_resource_kind(
    resource_id: &ResourceId,
    command_kind: DrawCommandKind,
) -> NativeResourceKind {
    match resource_prefix(resource_id) {
        Some(
            "image" | "images" | "character" | "characters" | "sprite" | "sprites" | "texture"
            | "textures",
        ) => NativeResourceKind::Texture,
        Some("video" | "videos") => NativeResourceKind::VideoDecoder,
        Some("audio" | "bgm" | "voice" | "sfx" | "ambient") => NativeResourceKind::AudioBuffer,
        Some("font" | "fonts") => NativeResourceKind::FontFace,
        Some("glyph" | "glyphs") => NativeResourceKind::GlyphAtlas,
        Some("qui" | "ui" | "surface" | "surfaces") => NativeResourceKind::UiAst,
        Some("qss" | "style" | "styles") => NativeResourceKind::QssStyle,
        Some("token" | "tokens") => NativeResourceKind::TokenTable,
        _ => infer_resource_kind_from_command(command_kind),
    }
}

fn infer_resource_kind_from_command(command_kind: DrawCommandKind) -> NativeResourceKind {
    match command_kind {
        DrawCommandKind::Image | DrawCommandKind::NineSlice => NativeResourceKind::Texture,
        DrawCommandKind::VideoFrame => NativeResourceKind::VideoDecoder,
        DrawCommandKind::Text | DrawCommandKind::RichText => NativeResourceKind::FontFace,
        DrawCommandKind::UiSurface => NativeResourceKind::UiAst,
        _ => NativeResourceKind::Other,
    }
}

fn resource_prefix(resource_id: &ResourceId) -> Option<&str> {
    resource_id
        .as_str()
        .split_once(':')
        .map(|(prefix, _)| prefix)
}

#[cfg(test)]
mod tests;
