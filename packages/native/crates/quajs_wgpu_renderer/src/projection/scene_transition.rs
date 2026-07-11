use serde::{Deserialize, Serialize};

use crate::render_graph::{
    BorderDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams, EdgeInsetsDrawParam,
    LogicalRect, PanelDrawParams, RenderGraph, RenderPlane,
};
use crate::stage_layout::ResolvedStageLayout;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneTransitionProjection {
    #[serde(default)]
    pub active: bool,
    #[serde(rename = "type")]
    pub transition_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from_scene: Option<String>,
    pub to_scene: String,
    pub duration: f64,
    pub started_at: f64,
    pub progress: f64,
    pub eased_progress: f64,
}

pub fn append_scene_transition_commands(
    graph: &mut RenderGraph,
    transition: &SceneTransitionProjection,
) {
    if let Some(command) = scene_transition_command(&graph.layout, transition) {
        graph.push(command);
    }
}

pub fn scene_transition_command(
    layout: &ResolvedStageLayout,
    transition: &SceneTransitionProjection,
) -> Option<DrawCommand> {
    if !transition.active
        || transition.to_scene.trim().is_empty()
        || !transition.duration.is_finite()
        || !transition.started_at.is_finite()
        || !transition.progress.is_finite()
        || !transition.eased_progress.is_finite()
    {
        return None;
    }

    let progress = transition.eased_progress.clamp(0.0, 1.0);
    if progress >= 1.0 {
        return None;
    }
    let hidden = 1.0 - progress;
    let width = layout.logical_width;
    let height = layout.logical_height;
    let mut bounds = LogicalRect {
        x: 0.0,
        y: 0.0,
        width,
        height,
    };
    let opacity = match transition.transition_type.as_str() {
        "slide_left" => {
            bounds.x = -width * progress;
            1.0
        }
        "slide_right" => {
            bounds.x = width * progress;
            1.0
        }
        "slide_up" => {
            bounds.y = -height * progress;
            1.0
        }
        "slide_down" => {
            bounds.y = height * progress;
            1.0
        }
        "wipe" => {
            bounds.width = width * hidden;
            1.0
        }
        "zoom_in" => {
            let scale = 1.0 + hidden * 0.12;
            bounds = scaled_centered_bounds(width, height, scale);
            hidden
        }
        "zoom_out" => {
            let scale = 0.92 + progress * 0.08;
            bounds = scaled_centered_bounds(width, height, scale);
            hidden
        }
        _ => hidden,
    };

    Some(
        DrawCommand::new(
            "scene:transition",
            RenderPlane::Screen,
            DrawCommandKind::Rect,
            bounds,
        )
        .z_index(10_000)
        .opacity(opacity as f32)
        .params(DrawCommandParams::Panel(PanelDrawParams {
            role: format!("scene-transition:{}", transition.transition_type),
            corner_radius: 0.0,
            shadow_blur_radius: 0.0,
            fill_color: "#000000".to_string(),
            border: BorderDrawParams::default(),
            padding: EdgeInsetsDrawParam::default(),
            intent: None,
        })),
    )
}

fn scaled_centered_bounds(width: f64, height: f64, scale: f64) -> LogicalRect {
    let scaled_width = width * scale;
    let scaled_height = height * scale;
    LogicalRect {
        x: (width - scaled_width) / 2.0,
        y: (height - scaled_height) / 2.0,
        width: scaled_width,
        height: scaled_height,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stage_layout::{
        resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
    };

    fn layout() -> ResolvedStageLayout {
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

    fn transition(transition_type: &str) -> SceneTransitionProjection {
        SceneTransitionProjection {
            active: true,
            transition_type: transition_type.to_string(),
            from_scene: Some("old".to_string()),
            to_scene: "new".to_string(),
            duration: 320.0,
            started_at: 1000.0,
            progress: 0.5,
            eased_progress: 0.5,
        }
    }

    #[test]
    fn projects_fade_in_logical_stage_coordinates() {
        let command = scene_transition_command(&layout(), &transition("fade")).unwrap();
        assert_eq!(command.plane, RenderPlane::Screen);
        assert_eq!(command.bounds.width, 1920.0);
        assert_eq!(command.bounds.height, 1080.0);
        assert_eq!(command.opacity, 0.5);
    }

    #[test]
    fn projects_slide_wipe_and_zoom_geometry() {
        let slide = scene_transition_command(&layout(), &transition("slide_left")).unwrap();
        assert_eq!(slide.bounds.x, -960.0);
        assert_eq!(slide.opacity, 1.0);

        let wipe = scene_transition_command(&layout(), &transition("wipe")).unwrap();
        assert_eq!(wipe.bounds.width, 960.0);

        let zoom = scene_transition_command(&layout(), &transition("zoom_in")).unwrap();
        assert!(zoom.bounds.x < 0.0);
        assert!(zoom.bounds.width > 1920.0);
    }
}
