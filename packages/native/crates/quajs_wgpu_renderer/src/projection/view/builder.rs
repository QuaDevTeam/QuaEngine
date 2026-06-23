use crate::projection::{
    background::append_background_commands, character::append_character_commands,
    choices::append_choice_commands, dialogue::append_dialogue_commands, ui::append_ui_commands,
};
use crate::render_graph::RenderGraph;
use crate::stage_layout::ResolvedStageLayout;

use super::types::ViewProjection;

pub fn build_view_render_graph(layout: ResolvedStageLayout, view: &ViewProjection) -> RenderGraph {
    let mut graph = RenderGraph::new(layout);
    append_view_commands(&mut graph, view);
    graph
}

pub fn append_view_commands(graph: &mut RenderGraph, view: &ViewProjection) {
    if let Some(background) = &view.background {
        append_background_commands(graph, background);
    }

    append_character_commands(graph, &view.characters);

    if let Some(dialogue) = &view.dialogue {
        append_dialogue_commands(graph, dialogue);
    }

    if let Some(choices) = &view.choices {
        append_choice_commands(graph, choices);
    }

    if let Some(ui) = &view.ui {
        append_ui_commands(graph, ui);
    }
}
