//! Late application of sampled timeline values. QPK manifests can be resolved
//! after the frame clock runs, so no resource lookup or second clock lives here.
use std::borrow::Cow;

use super::types::{
    CharacterProjection, CharacterSpriteLayerProjection, SpriteLayerAnimationValue,
};
use crate::projection::safety::{
    is_safe_native_z_index, MAX_NATIVE_CHARACTER_LOGICAL_COORDINATE,
    MAX_NATIVE_CHARACTER_ROTATION_DEGREES, MAX_NATIVE_CHARACTER_SCALE,
};
use serde_json::{Map, Value};

pub(crate) const MAX_SPRITE_LAYER_ANIMATION_VALUES: usize = 1024;

pub(crate) fn supported_property(property: &str) -> bool {
    matches!(
        property,
        "offsetX"
            | "offsetY"
            | "scale"
            | "rotation"
            | "opacity"
            | "zIndex"
            | "visible"
            | "blendMode"
    )
}

/// Retain only presentation properties. Asset/mask/frame changes require their
/// owning resource projection and must not turn a timeline into an asset loader.
pub(crate) fn collect_sample(
    view: &mut Map<String, Value>,
    target: &str,
    property: &str,
    value: &Value,
) {
    if !supported_property(property) {
        return;
    }
    let Some(characters) = view.get_mut("characters").and_then(Value::as_array_mut) else {
        return;
    };
    for character in characters {
        let Some(character) = character.as_object_mut() else {
            continue;
        };
        let Some(id) = character.get("id").and_then(Value::as_str) else {
            continue;
        };
        if !target
            .strip_prefix(&format!("spriteLayer:{id}:"))
            .is_some_and(valid_selector)
        {
            continue;
        }
        let samples = character
            .entry("spriteLayerAnimationValues")
            .or_insert_with(|| Value::Array(Vec::new()));
        if let Some(samples) = samples
            .as_array_mut()
            .filter(|samples| samples.len() < MAX_SPRITE_LAYER_ANIMATION_VALUES)
        {
            samples
                .push(serde_json::json!({"target": target, "property": property, "value": value}));
        }
    }
}

fn valid_selector(selector: &str) -> bool {
    fn index(value: &str) -> bool {
        value
            .parse::<usize>()
            .is_ok_and(|index| index.to_string() == value)
    }
    matches!(selector, "base" | "expression")
        || index(selector)
        || selector.strip_prefix("base:").is_some_and(index)
        || selector.strip_prefix("expression:").is_some_and(index)
}

pub(crate) fn project_layers(character: &CharacterProjection) -> Cow<'_, CharacterProjection> {
    if character.sprite_layer_animation_values.is_empty() {
        return Cow::Borrowed(character);
    }
    let mut projected = character.clone();
    if projected.sprite_base.is_none() {
        projected.sprite_base =
            projected
                .sprite
                .as_ref()
                .map(|asset| CharacterSpriteLayerProjection {
                    asset: asset.clone(),
                    ..Default::default()
                });
    }
    let samples = &character.sprite_layer_animation_values;
    if let Some(base) = projected.sprite_base.as_mut() {
        apply_layer(base, &character.id, "base", 0, samples);
    }
    for (index, layer) in projected.sprite_layers.iter_mut().enumerate() {
        apply_layer(layer, &character.id, "expression", index + 1, samples);
    }
    Cow::Owned(projected)
}

fn apply_layer(
    layer: &mut CharacterSpriteLayerProjection,
    id: &str,
    kind: &str,
    index: usize,
    values: &[SpriteLayerAnimationValue],
) {
    // renderer-web deliberately applies these alias groups in this order,
    // independently of the chronological order of different aliases.
    for target in [
        format!("spriteLayer:{id}:{kind}:{index}"),
        format!("spriteLayer:{id}:{kind}"),
        format!("spriteLayer:{id}:{index}"),
    ] {
        for sample in values
            .iter()
            .take(MAX_SPRITE_LAYER_ANIMATION_VALUES)
            .filter(|s| s.target == target)
        {
            apply_value(layer, &sample.property, &sample.value);
        }
    }
}

fn apply_value(layer: &mut CharacterSpriteLayerProjection, property: &str, value: &Value) {
    if let Some(n) = value.as_f64().filter(|n| n.is_finite()) {
        match property {
            "offsetX" if n.abs() <= MAX_NATIVE_CHARACTER_LOGICAL_COORDINATE => layer.offset_x = n,
            "offsetY" if n.abs() <= MAX_NATIVE_CHARACTER_LOGICAL_COORDINATE => layer.offset_y = n,
            "rotation" if n.abs() <= MAX_NATIVE_CHARACTER_ROTATION_DEGREES => layer.rotation = n,
            "scale" if n.abs() <= MAX_NATIVE_CHARACTER_SCALE => layer.scale = n as f32,
            "opacity" => layer.opacity = n.clamp(0.0, 1.0) as f32,
            "zIndex"
                if n.fract() == 0.0 && is_safe_native_z_index(n as i32) && n == n as i32 as f64 =>
            {
                layer.z_index = n as i32
            }
            _ => {}
        }
    } else if property == "visible" {
        if let Some(visible) = value.as_bool() {
            layer.visible = visible;
        }
    } else if property == "blendMode" {
        if let Some(mode) = value.as_str().filter(|s| {
            matches!(
                *s,
                "normal"
                    | "multiply"
                    | "screen"
                    | "overlay"
                    | "darken"
                    | "lighten"
                    | "color-dodge"
                    | "color-burn"
                    | "hard-light"
                    | "soft-light"
                    | "difference"
                    | "exclusion"
                    | "hue"
                    | "saturation"
                    | "color"
                    | "luminosity"
            )
        }) {
            layer.blend_mode = Some(mode.to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projection::character::{build_character_commands, CharacterPosition};
    use crate::render_graph::{DrawCommandParams, RenderGraph};
    use crate::stage_layout::{resolve_stage_layout, StageContainerInput, ViewLayoutInput};
    use serde_json::json;

    fn character() -> CharacterProjection {
        CharacterProjection {
            sprite: Some("mira/base.png".into()),
            position: CharacterPosition {
                x: Some(960.0),
                y: Some(600.0),
                width: Some(240.0),
                height: Some(240.0),
                ..Default::default()
            },
            sprite_layers: vec![CharacterSpriteLayerProjection {
                asset: "mira/face.png".into(),
                mask: Some("mira/mask.png".into()),
                ..Default::default()
            }],
            ..CharacterProjection::new("mira:one", "Mira")
        }
    }
    fn sample(target: &str, property: &str, value: Value) -> SpriteLayerAnimationValue {
        SpriteLayerAnimationValue {
            target: format!("spriteLayer:mira:one:{target}"),
            property: property.into(),
            value,
        }
    }
    #[test]
    fn aliases_follow_web_precedence_and_base_counts_as_index_zero() {
        let mut character = character();
        character.sprite_layer_animation_values = vec![
            sample("1", "offsetX", json!(30)),
            sample("expression", "offsetX", json!(20)),
            sample("expression:1", "offsetX", json!(10)),
            sample("0", "opacity", json!(0.25)),
            sample("expression:0", "offsetY", json!(999)),
        ];
        let original = character.clone();
        let projected = project_layers(&character);
        assert_eq!(projected.sprite_layers[0].offset_x, 30.0);
        assert_eq!(projected.sprite_layers[0].offset_y, 0.0);
        assert_eq!(projected.sprite_base.as_ref().unwrap().opacity, 0.25);
        assert_eq!(
            projected.sprite_layers[0].mask.as_deref(),
            Some("mira/mask.png")
        );
        assert_eq!(character, original);
        assert_eq!(project_layers(&character), projected); // no frame-to-frame accumulation
    }
    #[test]
    fn zero_and_negative_scale_and_base_z_index_reach_actual_draw_commands() {
        let mut character = character();
        character.sprite_layer_animation_values = vec![
            sample("base", "scale", json!(0)),
            sample("expression", "scale", json!(-0.5)),
        ];
        let layout = resolve_stage_layout(
            Some(ViewLayoutInput::default()),
            StageContainerInput::default(),
        );
        let commands = build_character_commands(&layout, &[character.clone()]);
        assert_eq!(commands[0].opacity, 0.0);
        assert_eq!(commands[1].bounds.width, 120.0);
        let DrawCommandParams::Image(image) = &commands[1].params else {
            panic!("image");
        };
        assert_eq!(image.rotation_degrees, 180.0);
        assert_eq!(commands[1].composite_groups[1].mask_rotation, 180.0);
        character.sprite_layer_animation_values = vec![sample("base", "zIndex", json!(50))];
        let mut graph = RenderGraph::new(layout);
        graph.extend(build_character_commands(&layout, &[character]));
        assert_eq!(graph.commands().last().unwrap().id, "character:mira:one");
    }
    #[test]
    fn unsupported_resource_fields_and_invalid_style_values_do_not_change_assets_or_geometry() {
        let mut character = character();
        character.sprite_layer_animation_values = vec![
            sample("expression", "asset", json!("../other.png")),
            sample("expression", "mask", json!("../mask.png")),
            sample("expression", "offsetX", json!(1e100)),
            sample("expression", "scale", json!("large")),
            sample("expression", "blendMode", json!("unknown")),
            sample("expression", "zIndex", json!(3.5)),
        ];
        assert_eq!(
            project_layers(&character).sprite_layers,
            character.sprite_layers
        );
        let mut view = json!({"characters":[{"id":"mira"}]});
        collect_sample(
            view.as_object_mut().unwrap(),
            "spriteLayer:mira:base",
            "asset",
            &json!("other.png"),
        );
        assert!(view["characters"][0]
            .get("spriteLayerAnimationValues")
            .is_none());
        for _ in 0..(MAX_SPRITE_LAYER_ANIMATION_VALUES + 10) {
            collect_sample(
                view.as_object_mut().unwrap(),
                "spriteLayer:mira:base",
                "opacity",
                &json!(1),
            );
        }
        assert_eq!(
            view["characters"][0]["spriteLayerAnimationValues"]
                .as_array()
                .unwrap()
                .len(),
            MAX_SPRITE_LAYER_ANIMATION_VALUES
        );
        let mut scoped = json!({"characters":[{"id":"mira"},{"id":"mira:one"}]});
        collect_sample(
            scoped.as_object_mut().unwrap(),
            "spriteLayer:mira:one:base",
            "scale",
            &json!(-1),
        );
        assert!(scoped["characters"][0]
            .get("spriteLayerAnimationValues")
            .is_none());
        assert_eq!(
            scoped["characters"][1]["spriteLayerAnimationValues"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
}
