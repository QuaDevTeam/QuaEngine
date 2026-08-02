use crate::projection::common::{
    is_safe_native_asset_name, is_safe_native_character_identity,
};
use crate::projection::safety::{
    is_safe_native_character_position, is_safe_native_opacity, is_safe_native_z_index,
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
                if !is_safe_native_character_identity(&character.id) {
                    return None;
                }
                let command = character_command(layout, character)?;
                seen_character_ids
                    .insert(character.id.clone())
                    .then_some(command)
            }
        })
        .collect()
}

fn character_command(
    layout: &ResolvedStageLayout,
    character: &CharacterProjection,
) -> Option<DrawCommand> {
    if !is_safe_native_character_identity(&character.id) {
        return None;
    }

    let sprite_asset_name = character.sprite.as_ref()?;
    if !is_safe_native_asset_name(sprite_asset_name) {
        return None;
    }
    if !is_safe_native_character_position(&character.position)
        || !is_safe_native_opacity(character.opacity)
        || !is_safe_native_z_index(character.layer)
    {
        return None;
    }

    let bounds = resolve_character_bounds(layout, &character.position);
    let anchor = resolve_character_anchor(&character.position);
    let scale = character
        .position
        .scale
        .filter(|value| value.is_finite() && value.abs() > 0.0)
        .unwrap_or(1.0);
    let flip_horizontal = scale < 0.0;
    let scale = scale.abs();
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
    .opacity(character.opacity * character.presence_opacity)
    .resource(character_resource_id(sprite_asset_name))
    .params(DrawCommandParams::Character(CharacterDrawParams {
        character_id: character.id.clone(),
        character_name: character.name.clone(),
        sprite_asset_name: sprite_asset_name.clone(),
        expression: character.expression.clone(),
        anchor,
        scale,
        rotation_degrees,
        flip_horizontal,
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
