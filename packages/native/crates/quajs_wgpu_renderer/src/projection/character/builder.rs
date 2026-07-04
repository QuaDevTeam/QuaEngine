use crate::projection::common::{
    insert_unique_safe_native_dispatch_identifier, is_safe_native_asset_name,
    is_safe_native_dispatch_identifier,
};
use crate::render_graph::{
    CharacterDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams, RenderGraph, RenderPlane,
};
use crate::resources::ResourceId;
use crate::stage_layout::ResolvedStageLayout;

use super::layout::{resolve_character_anchor, resolve_character_bounds};
use super::types::CharacterProjection;

pub fn append_character_commands(graph: &mut RenderGraph, characters: &[CharacterProjection]) {
    graph.extend(build_character_commands(&graph.layout, characters));
}

pub fn build_character_commands(
    layout: &ResolvedStageLayout,
    characters: &[CharacterProjection],
) -> Vec<DrawCommand> {
    characters
        .iter()
        .filter(|character| character.visible)
        .filter_map({
            let mut seen_character_ids = std::collections::BTreeSet::new();
            move |character| {
                let command = character_command(layout, character)?;
                insert_unique_safe_native_dispatch_identifier(
                    &mut seen_character_ids,
                    &character.id,
                )
                .then_some(command)
            }
        })
        .collect()
}

fn character_command(
    layout: &ResolvedStageLayout,
    character: &CharacterProjection,
) -> Option<DrawCommand> {
    if !is_safe_native_dispatch_identifier(&character.id) {
        return None;
    }

    let sprite_asset_name = character.sprite.as_ref()?;
    if !is_safe_native_asset_name(sprite_asset_name) {
        return None;
    }

    let bounds = resolve_character_bounds(layout, &character.position);
    let anchor = resolve_character_anchor(&character.position);
    let scale = character
        .position
        .scale
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(1.0);
    let rotation_degrees = character
        .position
        .rotation
        .filter(|value| value.is_finite())
        .unwrap_or(0.0);
    let mut command = DrawCommand::new(
        format!("character:{}", character.id),
        RenderPlane::Subject,
        DrawCommandKind::Image,
        bounds,
    )
    .z_index(character.layer)
    .opacity(character.opacity)
    .resource(character_resource_id(sprite_asset_name))
    .params(DrawCommandParams::Character(CharacterDrawParams {
        character_id: character.id.clone(),
        character_name: character.name.clone(),
        sprite_asset_name: sprite_asset_name.clone(),
        expression: character.expression.clone(),
        anchor,
        scale,
        rotation_degrees,
    }));

    if let Some(package_id) = character.provenance.safe_content_package_id() {
        command = command.owned_by(package_id);
    }

    for package_id in character.provenance.safe_required_runtime_packages() {
        command = command.require_package(package_id);
    }

    Some(command)
}

fn character_resource_id(asset_name: &str) -> ResourceId {
    ResourceId::new(format!("characters:{asset_name}"))
}
