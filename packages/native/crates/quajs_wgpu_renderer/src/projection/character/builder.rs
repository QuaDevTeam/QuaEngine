use crate::projection::common::{is_safe_native_asset_name, is_safe_native_character_identity};
use crate::projection::safety::{
    is_safe_native_character_position, is_safe_native_opacity, is_safe_native_z_index,
};
use crate::render_graph::{
    CharacterDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams, ImageDrawParams,
    MediaFit, MediaOrigin, RenderGraph, RenderPlane,
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
                let commands = character_commands(layout, character)?;
                seen_character_ids
                    .insert(character.id.clone())
                    .then_some(commands)
            }
        })
        .flatten()
        .collect()
}

fn character_commands(
    layout: &ResolvedStageLayout,
    character: &CharacterProjection,
) -> Option<Vec<DrawCommand>> {
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

    let mut commands = vec![command];
    for (index, layer) in character.sprite_layers.iter().enumerate() {
        if !layer.visible
            || !is_safe_native_asset_name(&layer.asset)
            || !is_safe_native_opacity(layer.opacity)
            || !layer.scale.is_finite()
            || layer.scale.abs() <= f32::EPSILON
        {
            continue;
        }
        let scale = layer.scale.abs() as f64;
        let mut command = DrawCommand::new(
            format!("character:{}:sprite-layer:{}", character.id, index),
            RenderPlane::Subject,
            DrawCommandKind::Image,
            crate::render_graph::LogicalRect {
                x: bounds.x + layer.offset_x,
                y: bounds.y + layer.offset_y,
                width: bounds.width * scale,
                height: bounds.height * scale,
            },
        )
        .z_index(character.layer.saturating_add(layer.z_index))
        .opacity((character.opacity * character.presence_opacity * layer.opacity).clamp(0.0, 1.0))
        .resource(character_resource_id(&layer.asset))
        .params(DrawCommandParams::Image(ImageDrawParams {
            asset_type: "characters".to_string(),
            asset_name: layer.asset.clone(),
            fit: MediaFit::Contain,
            origin: MediaOrigin::default(),
            source: bounds,
            rotation_degrees: rotation_degrees + layer.rotation,
            brightness: 1.0,
            saturation: 1.0,
            contrast: 1.0,
            grayscale: 0.0,
            sepia: 0.0,
            hue_rotate_radians: 0.0,
            invert: 0.0,
        }));
        if let Some(package_id) = character.provenance.safe_content_package_id() {
            command = command.owned_by(package_id);
        }
        for package_id in character.provenance.safe_required_runtime_packages() {
            command = command.require_package(package_id);
        }
        commands.push(command);
    }
    Some(commands)
}

fn character_resource_id(asset_name: &str) -> ResourceId {
    ResourceId::new(format!("characters:{asset_name}"))
}
