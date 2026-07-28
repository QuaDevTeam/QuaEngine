use serde::{Deserialize, Serialize};

use crate::projection::common::{is_safe_native_dispatch_identifier, PackageProvenance};
use crate::render_graph::{
    BorderDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams, EdgeInsetsDrawParam,
    LogicalRect, PanelDrawParams, RenderGraph, RenderPlane,
};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectProjection {
    pub id: String,
    #[serde(rename = "type")]
    pub effect_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intensity: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scale: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
}

pub fn append_effect_commands(graph: &mut RenderGraph, effects: &[EffectProjection]) {
    for effect in effects {
        if !is_valid_effect(effect) {
            continue;
        }
        if effect.effect_type == "shake" {
            apply_shake(graph, effect);
            continue;
        }
        if let Some(command) = overlay_command(graph, effect) {
            graph.push(command);
        }
    }
}

fn overlay_command(graph: &RenderGraph, effect: &EffectProjection) -> Option<DrawCommand> {
    if !matches!(
        effect.effect_type.as_str(),
        "fade_in" | "fade_out" | "flash"
    ) {
        return None;
    }
    let opacity = effect
        .opacity
        .or(effect.intensity)
        .unwrap_or(1.0)
        .clamp(0.0, 1.0);
    if opacity <= 0.0 {
        return None;
    }
    let color = effect
        .color
        .as_deref()
        .filter(|color| is_safe_effect_color(color))
        .unwrap_or(if effect.effect_type == "flash" {
            "#ffffff"
        } else {
            "#000000"
        });
    let layout = &graph.layout;
    let mut command = DrawCommand::new(
        format!("effect:{}", effect.id),
        RenderPlane::Screen,
        DrawCommandKind::Rect,
        LogicalRect {
            x: 0.0,
            y: 0.0,
            width: layout.logical_width,
            height: layout.logical_height,
        },
    )
    .z_index(9_000)
    .opacity(opacity as f32)
    .params(DrawCommandParams::Panel(PanelDrawParams {
        role: format!("effect:{}", effect.effect_type),
        corner_radius: 0.0,
        fill_color: color.to_string(),
        border: BorderDrawParams::default(),
        padding: EdgeInsetsDrawParam::default(),
        intent: None,
        rotation_degrees: 0.0,
    }));
    command = apply_provenance(command, &effect.provenance);
    Some(command)
}

fn apply_shake(graph: &mut RenderGraph, effect: &EffectProjection) {
    let x = effect.x.unwrap_or(effect.intensity.unwrap_or(0.0));
    let y = effect.y.unwrap_or(0.0);
    let scale = effect.scale.unwrap_or(1.0);
    if !x.is_finite() || !y.is_finite() || !scale.is_finite() || scale <= 0.0 {
        return;
    }
    let target = effect.target.as_deref().unwrap_or("stage");
    for command in graph.commands_mut() {
        if !effect_targets_command(target, command) {
            continue;
        }
        translate_and_scale_rect(&mut command.bounds, x, y, scale);
        for clip in &mut command.clip_bounds {
            translate_and_scale_rect(clip, x, y, scale);
        }
    }
}

fn effect_targets_command(target: &str, command: &DrawCommand) -> bool {
    match target {
        "screen" => true,
        "stage" | "stage:main" => command.plane != RenderPlane::Screen,
        _ => command.id == target || command.id.starts_with(&format!("{target}:")),
    }
}

fn translate_and_scale_rect(bounds: &mut LogicalRect, x: f64, y: f64, scale: f64) {
    let center_x = bounds.x + bounds.width / 2.0;
    let center_y = bounds.y + bounds.height / 2.0;
    bounds.width *= scale;
    bounds.height *= scale;
    bounds.x = center_x - bounds.width / 2.0 + x;
    bounds.y = center_y - bounds.height / 2.0 + y;
}

fn is_valid_effect(effect: &EffectProjection) -> bool {
    is_safe_native_dispatch_identifier(&effect.id)
        && is_safe_native_dispatch_identifier(&effect.effect_type)
        && effect
            .target
            .as_deref()
            .is_none_or(is_safe_native_dispatch_identifier)
        && effect
            .duration
            .is_none_or(|value| value.is_finite() && value >= 0.0)
        && effect.intensity.is_none_or(f64::is_finite)
        && effect.opacity.is_none_or(f64::is_finite)
        && effect.rotation.is_none_or(f64::is_finite)
}

fn is_safe_effect_color(color: &str) -> bool {
    let color = color.trim();
    if color.len() > 64 || color.is_empty() {
        return false;
    }
    if let Some(hex) = color.strip_prefix('#') {
        return matches!(hex.len(), 3 | 4 | 6 | 8)
            && hex.chars().all(|character| character.is_ascii_hexdigit());
    }
    matches!(color, "black" | "white" | "transparent")
        || ((color.starts_with("rgb(") || color.starts_with("rgba("))
            && color.ends_with(')')
            && color
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "(),. %".contains(character)))
}

fn apply_provenance(mut command: DrawCommand, provenance: &PackageProvenance) -> DrawCommand {
    if let Some(package_id) = provenance.safe_content_package_id() {
        command = command.owned_by(package_id);
    }
    command.require_packages(provenance.safe_required_runtime_packages())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projection::background::BackgroundProjection;
    use crate::projection::view::{build_view_render_graph, ViewProjection};
    use crate::stage_layout::{
        resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
    };

    fn layout() -> crate::stage_layout::ResolvedStageLayout {
        resolve_stage_layout(
            Some(ViewLayoutInput {
                preset: Some(ViewLayoutOrientation::Landscape),
                ..Default::default()
            }),
            StageContainerInput {
                width: Some(1920.0),
                height: Some(1080.0),
                ..Default::default()
            },
        )
    }

    fn effect(effect_type: &str) -> EffectProjection {
        EffectProjection {
            id: "fx".to_string(),
            effect_type: effect_type.to_string(),
            target: None,
            duration: Some(200.0),
            intensity: Some(0.4),
            x: None,
            y: None,
            scale: None,
            rotation: None,
            opacity: None,
            color: None,
            provenance: PackageProvenance::default(),
        }
    }

    #[test]
    fn projects_flash_as_a_screen_overlay() {
        let view = ViewProjection {
            effects: vec![effect("flash")],
            ..Default::default()
        };
        let graph = build_view_render_graph(layout(), &view);
        let command = graph
            .commands()
            .iter()
            .find(|command| command.id == "effect:fx")
            .unwrap();
        assert_eq!(command.plane, RenderPlane::Screen);
        assert_eq!(command.opacity, 0.4);
        assert_eq!(command.bounds.width, 1920.0);
    }

    #[test]
    fn applies_shake_offsets_to_stage_commands_only() {
        let mut shake = effect("shake");
        shake.x = Some(12.0);
        shake.y = Some(-8.0);
        let view = ViewProjection {
            background: Some(BackgroundProjection {
                asset_name: Some("bg.png".to_string()),
                ..Default::default()
            }),
            effects: vec![shake],
            ..Default::default()
        };
        let graph = build_view_render_graph(layout(), &view);
        let background = graph
            .commands()
            .iter()
            .find(|command| command.id.starts_with("background:"))
            .unwrap();
        assert_eq!(background.bounds.x, 12.0);
        assert_eq!(background.bounds.y, -8.0);
    }
}
