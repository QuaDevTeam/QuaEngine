use std::collections::{BTreeMap, BTreeSet};

use crate::render_graph::{DrawCommand, DrawCommandKind, RenderGraph};

use super::record::{NativeResourceKind, ResourceId};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RenderResourcePlan {
    pub requests: Vec<RenderResourceRequest>,
    pub resource_ref_count: usize,
    pub by_kind: BTreeMap<NativeResourceKind, usize>,
}

impl RenderResourcePlan {
    pub fn request(&self, id: impl Into<ResourceId>) -> Option<&RenderResourceRequest> {
        let id = id.into();
        self.requests.iter().find(|request| request.id == id)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RenderResourceRequest {
    pub id: ResourceId,
    pub kind: NativeResourceKind,
    pub command_ids: BTreeSet<String>,
    pub owner_package_ids: BTreeSet<String>,
    pub required_package_ids: BTreeSet<String>,
}

impl RenderResourceRequest {
    pub fn package_ids(&self) -> BTreeSet<String> {
        let mut ids = self.required_package_ids.clone();
        ids.extend(self.owner_package_ids.iter().cloned());
        ids
    }
}

pub fn plan_render_graph_resources(graph: &RenderGraph) -> RenderResourcePlan {
    let mut requests = BTreeMap::<ResourceId, RenderResourceRequest>::new();
    let mut resource_ref_count = 0usize;

    for command in graph.commands() {
        for resource_id in &command.resource_ids {
            resource_ref_count += 1;
            let inferred_kind = infer_resource_kind(resource_id, command);
            let request =
                requests
                    .entry(resource_id.clone())
                    .or_insert_with(|| RenderResourceRequest {
                        id: resource_id.clone(),
                        kind: inferred_kind,
                        command_ids: BTreeSet::new(),
                        owner_package_ids: BTreeSet::new(),
                        required_package_ids: BTreeSet::new(),
                    });

            request.kind = merge_resource_kind(request.kind, inferred_kind);
            request.command_ids.insert(command.id.clone());
            if let Some(owner_package_id) = &command.owner_package_id {
                request.owner_package_ids.insert(owner_package_id.clone());
            }
            request
                .required_package_ids
                .extend(command.required_package_ids.iter().cloned());
        }
    }

    let mut plan = RenderResourcePlan {
        resource_ref_count,
        requests: requests.into_values().collect(),
        ..Default::default()
    };

    for request in &plan.requests {
        *plan.by_kind.entry(request.kind).or_default() += 1;
    }

    plan
}

fn infer_resource_kind(resource_id: &ResourceId, command: &DrawCommand) -> NativeResourceKind {
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
        _ => infer_resource_kind_from_command(command),
    }
}

fn infer_resource_kind_from_command(command: &DrawCommand) -> NativeResourceKind {
    match command.kind {
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

fn merge_resource_kind(
    existing: NativeResourceKind,
    inferred: NativeResourceKind,
) -> NativeResourceKind {
    if existing == inferred {
        existing
    } else if existing == NativeResourceKind::Other {
        inferred
    } else if inferred == NativeResourceKind::Other {
        existing
    } else {
        NativeResourceKind::Other
    }
}

#[cfg(test)]
mod tests;
