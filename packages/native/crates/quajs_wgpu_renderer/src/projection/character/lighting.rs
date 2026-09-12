use serde::{Deserialize, Serialize};

use super::{layout::resolve_character_bounds, CharacterProjection};
use crate::render_graph::{composite::CompositeCharacterLighting, DrawCompositeGroup, RenderGraph};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct CharacterLightingProjection {
    #[serde(default = "white")]
    pub ambient: [f32; 3],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shade: Option<CharacterShadeProjection>,
}

#[cfg(test)]
mod tests {
    use crate::projection::view::{build_view_render_graph, ViewProjection};
    use crate::stage_layout::{resolve_stage_layout, StageContainerInput};

    #[test]
    fn grades_the_completed_sprite_once_and_retains_package_resources() {
        let view: ViewProjection = serde_json::from_value(serde_json::json!({
            "background": {"mode":"image", "characterLighting": {"ambient":[1.02,0.98,0.92],
                "shade":{"color":[0.9,0.94,1],"from":[0.2,0],"to":[0.8,1]}}},
            "characters": [{"id":"mara","name":"Mara","sprite":"neutral.png","opacity":0.5,
                "position":{"x":960,"y":1200,"width":640,"height":1280,"rotation":12},
                "spriteLayers":[{"asset":"smile.png","opacity":0.7}],
                "provenance":{"contentPackageId":"chapter-two","requiredRuntimePackages":["chapter-two"]}}]
        })).unwrap();
        let layout = resolve_stage_layout(None, StageContainerInput::default());
        let graph = build_view_render_graph(layout, &view);
        let characters: Vec<_> = graph
            .commands()
            .iter()
            .filter(|c| c.id.starts_with("character:"))
            .collect();
        assert_eq!(characters.len(), 2);
        let group = &characters[0].composite_groups[0];
        assert_eq!(group.opacity, 0.5);
        assert_eq!(
            group.character_lighting.as_ref().unwrap().bounds.height,
            1280.0
        );
        assert_eq!(characters[1].composite_groups[0], *group);
        assert_eq!(characters[1].opacity, 0.7);
        assert_eq!(
            characters[1].owner_package_id.as_deref(),
            Some("chapter-two")
        );
        let mut unlit = view.clone();
        unlit.background.as_mut().unwrap().character_lighting = None;
        let restored = build_view_render_graph(layout, &unlit);
        assert!(restored
            .commands()
            .iter()
            .flat_map(|c| &c.composite_groups)
            .all(|g| g.character_lighting.is_none()));
        assert_eq!(
            graph
                .commands()
                .iter()
                .flat_map(|c| &c.resource_ids)
                .collect::<Vec<_>>(),
            restored
                .commands()
                .iter()
                .flat_map(|c| &c.resource_ids)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn neutral_lighting_adds_no_compositor_surface() {
        let view: ViewProjection = serde_json::from_value(serde_json::json!({
            "background":{"mode":"image","characterLighting":{}},
            "characters":[{"id":"mara","name":"Mara","sprite":"neutral.png"}]
        }))
        .unwrap();
        let graph = build_view_render_graph(
            resolve_stage_layout(None, StageContainerInput::default()),
            &view,
        );
        assert!(graph
            .commands()
            .iter()
            .all(|c| c.composite_groups.is_empty()));
    }
}

fn white() -> [f32; 3] {
    [1.0; 3]
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct CharacterShadeProjection {
    pub color: [f32; 3],
    pub from: [f32; 2],
    pub to: [f32; 2],
}

impl CharacterLightingProjection {
    pub fn is_valid(&self) -> bool {
        self.ambient
            .iter()
            .all(|v| v.is_finite() && (0.0..=1.5).contains(v))
            && self.shade.as_ref().is_none_or(|s| {
                s.color
                    .iter()
                    .chain(&s.from)
                    .chain(&s.to)
                    .all(|v| v.is_finite() && (0.0..=1.0).contains(v))
            })
    }
}

/// Apply once to the completed sprite, before parent opacity/motion. No new
/// image variants or texture reads; the existing compositor owns the surface.
pub(crate) fn apply_character_lighting(
    graph: &mut RenderGraph,
    characters: &[CharacterProjection],
    lighting: Option<&CharacterLightingProjection>,
) {
    let Some(lighting) = lighting.filter(|l| l.is_valid()) else {
        return;
    };
    if lighting.ambient == white() && lighting.shade.as_ref().is_none_or(|s| s.color == white()) {
        return;
    }
    for character in characters.iter().filter(|c| c.visible) {
        let prefix = format!("character:{}", character.id);
        let bounds = resolve_character_bounds(&graph.layout, &character.position);
        let grade = CompositeCharacterLighting {
            ambient: lighting.ambient,
            // Web's SVG stop-color is rounded to 8-bit sRGB.
            shade_color: lighting
                .shade
                .as_ref()
                .map_or(white(), |s| s.color.map(|v| (v * 255.0).round() / 255.0)),
            from: lighting.shade.as_ref().map_or([0.0; 2], |s| s.from),
            to: lighting.shade.as_ref().map_or([1.0; 2], |s| s.to),
            bounds,
            rotation_radians: (character.position.rotation.unwrap_or(0.0)
                + if character.position.scale.is_some_and(|s| s < 0.0) {
                    180.0
                } else {
                    0.0
                })
            .to_radians() as f32,
        };
        for command in graph
            .commands_mut()
            .iter_mut()
            .filter(|c| c.id == prefix || c.id.starts_with(&format!("{prefix}:sprite-layer:")))
        {
            if let Some(group) = command
                .composite_groups
                .first_mut()
                .filter(|g| g.id == format!("character-sprite:{}", character.id))
            {
                group.character_lighting = Some(grade.clone());
            } else {
                let group = DrawCompositeGroup {
                    id: format!("character-lighting:{}", character.id),
                    opacity: command.opacity,
                    z_index: command.z_index,
                    character_lighting: Some(grade.clone()),
                    ..Default::default()
                };
                command.opacity = 1.0;
                command.composite_groups.insert(0, group);
            }
        }
    }
}
