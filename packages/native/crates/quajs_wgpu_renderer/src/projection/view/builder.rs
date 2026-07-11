use crate::projection::{
    background::append_background_commands_with_video_frame_resources,
    character::append_character_commands, choices::append_choice_commands_with_dialogue,
    dialogue::append_dialogue_commands, effects::append_effect_commands,
    scene_transition::append_scene_transition_commands, ui::append_ui_commands,
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
    if let Some(background) = &view.background {
        append_background_commands_with_video_frame_resources(
            graph,
            background,
            video_frame_resources,
        );
    }

    append_character_commands(graph, &view.characters);

    if let Some(dialogue) = &view.dialogue {
        append_dialogue_commands(graph, dialogue);
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
}
