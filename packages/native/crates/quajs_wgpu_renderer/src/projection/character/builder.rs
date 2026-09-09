use crate::projection::common::{is_safe_native_asset_name, is_safe_native_character_identity};
use crate::projection::safety::{
    is_safe_native_character_position, is_safe_native_opacity, is_safe_native_z_index,
};
use crate::render_graph::{
    CharacterDrawParams, CompositeBlendMode, DrawCommand, DrawCommandKind, DrawCommandParams,
    DrawCompositeGroup, ImageDrawParams, ImageSampling, MediaFit, MediaOrigin, RenderGraph,
    RenderPlane,
};
use crate::resources::ResourceId;
use crate::stage_layout::ResolvedStageLayout;

use super::layout::{resolve_character_anchor, resolve_character_bounds};
use super::types::{CharacterPosition, CharacterProjection};

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

    let character = super::animation::project_layers(character);
    let sprite_asset_name = character.sprite.as_ref()?;
    if !is_safe_native_asset_name(sprite_asset_name) {
        return None;
    }
    if !is_safe_native_character_position(&character.position)
        || !is_safe_native_opacity(character.opacity)
        || !is_safe_native_opacity(character.presence_opacity)
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
    let negative_scale = scale < 0.0;
    let flip_horizontal = false;
    let scale = scale.abs();
    let rotation_degrees = character
        .position
        .rotation
        .filter(|value| value.is_finite())
        .unwrap_or(0.0)
        + if negative_scale { 180.0 } else { 0.0 };
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
    for (index, layer) in character
        .sprite_base
        .iter()
        .chain(character.sprite_layers.iter())
        .enumerate()
    {
        let is_base = character.sprite_base.is_some() && index == 0;
        let layer_index = index.saturating_sub(usize::from(character.sprite_base.is_some()));
        if is_base {
            commands[0].opacity = 0.0;
        }
        if !layer.visible
            || !is_safe_native_asset_name(&layer.asset)
            || !is_safe_native_opacity(layer.opacity)
            || !is_safe_native_z_index(layer.z_index)
            || layer.scale == 0.0
            || !is_safe_native_character_position(&CharacterPosition {
                x: Some(layer.offset_x),
                y: Some(layer.offset_y),
                scale: Some(layer.scale as f64),
                rotation: Some(layer.rotation),
                ..Default::default()
            })
        {
            continue;
        }
        let layer_scale = (layer.scale as f64).abs();
        let layer_rotation = layer.rotation + if layer.scale < 0.0 { 180.0 } else { 0.0 };
        // A layer's transform belongs to the character's local coordinate
        // system. Rotate/reflect its center about the parent's center, then
        // compose its own rotation. Offsets are authored before parent scale.
        let anchor_offset = match layer.anchor.as_deref() {
            Some("left") => -bounds.width * (1.0 - layer_scale) / 2.0,
            Some("right") => bounds.width * (1.0 - layer_scale) / 2.0,
            _ => 0.0,
        };
        let local_x = layer.offset_x * scale + anchor_offset;
        let local_y = layer.offset_y * scale;
        let (sin, cos) = rotation_degrees.to_radians().sin_cos();
        let local_x = if flip_horizontal { -local_x } else { local_x };
        let width = bounds.width * layer_scale;
        let height = bounds.height * layer_scale;
        let mut command = DrawCommand::new(
            if is_base {
                format!("character:{}", character.id)
            } else {
                format!("character:{}:sprite-layer:{}", character.id, layer_index)
            },
            RenderPlane::Subject,
            DrawCommandKind::Image,
            crate::render_graph::LogicalRect {
                x: bounds.x + bounds.width / 2.0 + local_x * cos - local_y * sin - width / 2.0,
                y: bounds.y + bounds.height / 2.0 + local_x * sin + local_y * cos - height / 2.0,
                width,
                height,
            },
        )
        .z_index(layer.z_index)
        .opacity(layer.opacity)
        .resource(character_resource_id(&layer.asset))
        .params(DrawCommandParams::Image(ImageDrawParams {
            asset_type: "characters".into(),
            asset_name: layer.asset.clone(),
            sampling: ImageSampling {
                frame: layer.frame.map(|frame| crate::render_graph::LogicalRect {
                    x: frame.x,
                    y: frame.y,
                    width: frame.width,
                    height: frame.height,
                }),
                flip_horizontal,
                nine_slice: None,
            },
            fit: MediaFit::Contain,
            origin: MediaOrigin::default(),
            source: bounds,
            rotation_degrees: rotation_degrees
                + if flip_horizontal {
                    -layer_rotation
                } else {
                    layer_rotation
                },
            brightness: 1.0,
            saturation: 1.0,
            contrast: 1.0,
            grayscale: 0.0,
            sepia: 0.0,
            hue_rotate_radians: 0.0,
            invert: 0.0,
        }));
        let blend_mode = layer
            .blend_mode
            .as_deref()
            .map(CompositeBlendMode::from_css)
            .unwrap_or_default();
        if layer.mask.is_some() || blend_mode != CompositeBlendMode::Normal {
            let mask = layer
                .mask
                .as_deref()
                .filter(|mask| is_safe_native_asset_name(mask));
            let group = DrawCompositeGroup {
                id: format!("sprite-layer:{}:{}", character.id, index),
                z_index: layer.z_index,
                opacity: layer.opacity,
                blend_mode,
                mask_resource_id: mask.map(|name| format!("characters:{name}")),
                mask_bounds: Some(command.bounds),
                mask_scale: scale * layer_scale,
                mask_rotation: rotation_degrees + layer_rotation,
                mask_layout: crate::render_graph::mask::MaskLayout::parse(
                    Some("0 0"),
                    Some("auto"),
                    Some("no-repeat"),
                )
                .unwrap_or_default(),
                ..Default::default()
            };
            if let Some(mask) = mask {
                command.resource_ids.push(character_resource_id(mask));
            }
            command.opacity = 1.0;
            command.composite_groups.push(group);
        }
        if let Some(package_id) = character.provenance.safe_content_package_id() {
            command = command.owned_by(package_id);
        }
        for package_id in character.provenance.safe_required_runtime_packages() {
            command = command.require_package(package_id);
        }
        if is_base {
            commands[0] = command;
        } else {
            commands.push(command);
        }
    }
    if commands.len() > 1 || character.sprite_base.is_some() {
        // Character opacity belongs to the completed sprite. Applying it to
        // each overlapping expression layer changes the resulting colors.
        // Keep local layer ordering inside the character's stacking context.
        let group = DrawCompositeGroup {
            id: format!("character-sprite:{}", character.id),
            opacity: character.opacity * character.presence_opacity,
            z_index: character.layer,
            ..Default::default()
        };
        if character.sprite_base.is_none() {
            commands[0].opacity = 1.0;
        }
        if character.sprite_base.is_none() {
            commands[0].z_index = 0;
        }
        for command in &mut commands {
            command.composite_groups.insert(0, group.clone());
        }
    }
    Some(commands)
}

fn character_resource_id(asset_name: &str) -> ResourceId {
    ResourceId::new(format!("characters:{asset_name}"))
}
