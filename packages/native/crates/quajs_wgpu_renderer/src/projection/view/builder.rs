use crate::projection::{
    background::append_background_commands_with_video_frame_resources,
    character::append_character_commands,
    choices::append_choice_commands_with_dialogue,
    dialogue::builder::{build_dialogue_commands_with_measurement, TextHeightMeasurer},
    effects::append_effect_commands,
    scene_transition::append_scene_transition_commands,
    ui::append_ui_commands,
};
use crate::render_graph::RenderGraph;
use crate::stage_layout::ResolvedStageLayout;
use crate::video::VideoBackendFrameResourceMap;

use super::types::ViewProjection;

pub fn build_view_render_graph(layout: ResolvedStageLayout, view: &ViewProjection) -> RenderGraph {
    build_view_render_graph_with_video_frame_resources(
        layout,
        view,
        &VideoBackendFrameResourceMap::new(),
    )
}

pub fn build_view_render_graph_with_video_frame_resources(
    layout: ResolvedStageLayout,
    view: &ViewProjection,
    video_frame_resources: &VideoBackendFrameResourceMap,
) -> RenderGraph {
    let mut graph = RenderGraph::new(layout);
    append_view_commands_with_video_frame_resources(&mut graph, view, video_frame_resources);
    graph
}

pub fn append_view_commands(graph: &mut RenderGraph, view: &ViewProjection) {
    append_view_commands_with_video_frame_resources(
        graph,
        view,
        &VideoBackendFrameResourceMap::new(),
    );
}

pub fn append_view_commands_with_video_frame_resources(
    graph: &mut RenderGraph,
    view: &ViewProjection,
    video_frame_resources: &VideoBackendFrameResourceMap,
) {
    append_view_commands_with_measurement(graph, view, video_frame_resources, &|_, _| None);
}

pub(crate) fn append_view_commands_with_measurement(
    graph: &mut RenderGraph,
    view: &ViewProjection,
    video_frame_resources: &VideoBackendFrameResourceMap,
    measure: &TextHeightMeasurer<'_>,
) {
    if let Some(background) = &view.background {
        append_background_commands_with_video_frame_resources(
            graph,
            background,
            video_frame_resources,
        );
    }

    append_character_commands(graph, &view.characters);

    if let Some(dialogue) = &view.dialogue {
        graph.extend(build_dialogue_commands_with_measurement(
            &graph.layout,
            dialogue,
            measure,
        ));
    }

    if let Some(choices) = &view.choices {
        append_choice_commands_with_dialogue(
            graph,
            choices,
            view.dialogue
                .as_ref()
                .is_some_and(|dialogue| dialogue.visible),
        );
    }

    if let Some(ui) = &view.ui {
        append_ui_commands(graph, ui);
    }

    append_effect_commands(graph, &view.effects);

    if let Some(scene_transition) = &view.scene_transition {
        append_scene_transition_commands(graph, scene_transition);
    }
    apply_motion(graph, view);
}

fn apply_motion(graph: &mut RenderGraph, view: &ViewProjection) {
    use crate::render_graph::{DrawCompositeGroup, LogicalRect, RenderPlane};
    let neutral = crate::projection::motion::MotionProjection::default();
    if view.stage.as_ref().is_none_or(|m| m == &neutral)
        && view.camera.as_ref().is_none_or(|m| m == &neutral)
        && view.dialogue.as_ref().is_none_or(|d| d.motion == neutral)
        && view
            .choices
            .as_ref()
            .is_none_or(|c| c.motion == neutral && c.choices.iter().all(|c| c.motion == neutral))
        && view
            .ui
            .as_ref()
            .is_none_or(|ui| ui.overlays.iter().all(|o| o.motion == neutral))
    {
        return;
    }
    let stage = view
        .stage
        .as_ref()
        .and_then(|m| m.group("motion:stage".into(), LogicalRect::default(), false));
    let camera = view
        .camera
        .as_ref()
        .and_then(|m| m.group("motion:camera".into(), LogicalRect::default(), true));
    let bounds = |prefix: &str| {
        graph
            .commands()
            .iter()
            .find(|c| c.id == prefix)
            .map(|c| c.bounds)
            .unwrap_or_default()
    };
    let dialogue = view.dialogue.as_ref().and_then(|d| {
        d.motion
            .group("motion:dialogue".into(), bounds("dialogue:panel"), false)
    });
    let choices = view.choices.as_ref().and_then(|c| {
        c.motion
            .group("motion:choices".into(), bounds("choices:panel"), false)
    });
    let overlays = view
        .ui
        .as_ref()
        .map(|ui| {
            ui.overlays
                .iter()
                .filter_map(|o| {
                    o.motion
                        .group(
                            format!("motion:ui:{}", o.element_id),
                            bounds(&format!("ui:{}", o.element_id)),
                            false,
                        )
                        .map(|mut g| {
                            // Motion creates a stacking context at the overlay's
                            // existing effective stack position.
                            g.z_index = graph
                                .commands()
                                .iter()
                                .find(|c| c.id == format!("ui:{}", o.element_id))
                                .map_or(0, |c| c.z_index);
                            (o.element_id.clone(), g)
                        })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    for command in graph.commands_mut() {
        if matches!(
            command.plane,
            RenderPlane::Scene | RenderPlane::Subject | RenderPlane::Stage
        ) && (stage.is_some() || camera.is_some())
        {
            let mut groups = Vec::new();
            groups.extend(stage.iter().cloned());
            groups.extend(camera.iter().cloned());
            groups.push(DrawCompositeGroup {
                id: format!("motion:plane:{:?}", command.plane),
                z_index: command.plane.z_base(),
                ..Default::default()
            });
            groups.append(&mut command.composite_groups);
            command.composite_groups = groups;
            command.plane = RenderPlane::Scene;
        }
        if command.id.starts_with("dialogue:") {
            if let Some(group) = &dialogue {
                prepend_motion_group(command, group);
            }
        }
        if command.id.starts_with("choice:") || command.id.starts_with("choices:") {
            if let Some(choice) = view.choices.as_ref().and_then(|set| {
                set.choices
                    .iter()
                    .find(|choice| command.id == format!("choice:{}", choice.id))
            }) {
                if let Some(group) = choice.motion.group(
                    format!("motion:choice:{}", choice.id),
                    command.bounds,
                    false,
                ) {
                    prepend_motion_group(command, &group);
                }
            }
            if let Some(group) = &choices {
                prepend_motion_group(command, group);
            }
        }
        if let Some((_, group)) = overlays.iter().find(|(id, _)| {
            command.id == format!("ui:{id}") || command.id.starts_with(&format!("ui:{id}:"))
        }) {
            prepend_motion_group(command, group);
        }
    }
    graph.sort_commands();
}

fn prepend_motion_group(
    command: &mut crate::render_graph::DrawCommand,
    group: &crate::render_graph::DrawCompositeGroup,
) {
    command.composite_groups.insert(0, group.clone());
    for variant in command.interaction_variants.values_mut() {
        variant.composite_groups.insert(0, group.clone());
    }
}
