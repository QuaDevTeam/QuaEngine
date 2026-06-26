use crate::projection::common::PackageProvenance;
use crate::render_graph::{
    BorderDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams, EdgeInsetsDrawParam,
    FontStyleDrawParam, PanelDrawParams, RenderGraph, RenderPlane, RendererIntent, TextAlign,
    TextDecorationDrawParam, TextOverflowDrawParam, TextTransformDrawParam, UiButtonDrawParams,
    WhiteSpaceDrawParam,
};
use crate::stage_layout::ResolvedStageLayout;

use super::layout::{choice_button_bounds, choices_panel_bounds};
use super::types::{ChoiceProjection, ChoiceSetProjection};

pub fn append_choice_commands(graph: &mut RenderGraph, choices: &ChoiceSetProjection) {
    graph.extend(build_choice_commands(&graph.layout, choices));
}

pub fn build_choice_commands(
    layout: &ResolvedStageLayout,
    choices: &ChoiceSetProjection,
) -> Vec<DrawCommand> {
    if !choices.visible || choices.choices.is_empty() {
        return Vec::new();
    }

    let panel = choices_panel_bounds(layout, choices.choices.len());
    let mut commands = vec![apply_provenance(
        DrawCommand::new(
            "choices:panel",
            RenderPlane::Safe,
            DrawCommandKind::RoundedRect,
            panel,
        )
        .z_index(10)
        .params(DrawCommandParams::Panel(PanelDrawParams {
            role: "choices-panel".to_string(),
            corner_radius: 12.0,
            fill_color: "rgba(0,0,0,0.0)".to_string(),
            border: BorderDrawParams::default(),
            padding: EdgeInsetsDrawParam::default(),
            intent: None,
        })),
        &choices.provenance,
    )];

    commands.extend(
        choices
            .choices
            .iter()
            .enumerate()
            .map(|(index, choice)| choice_command(panel, index, choice)),
    );
    commands
}

fn choice_command(
    panel: crate::render_graph::LogicalRect,
    index: usize,
    choice: &ChoiceProjection,
) -> DrawCommand {
    let mut command = DrawCommand::new(
        format!("choice:{}", choice.id),
        RenderPlane::Safe,
        DrawCommandKind::UiSurface,
        choice_button_bounds(panel, index),
    )
    .z_index(11 + index as i32)
    .opacity(if choice.enabled { 1.0 } else { 0.52 })
    .interactive(choice.enabled)
    .params(DrawCommandParams::UiButton(UiButtonDrawParams {
        label: choice.text.clone(),
        enabled: choice.enabled,
        role: "choice".to_string(),
        background_color: "rgba(0,0,0,0.0)".to_string(),
        text_color: "#ffffff".to_string(),
        corner_radius: 0.0,
        border: BorderDrawParams::default(),
        font_family: Vec::new(),
        font_size: 30.0,
        font_style: FontStyleDrawParam::Normal,
        font_weight: None,
        letter_spacing: 0.0,
        line_height: 42.0,
        align: TextAlign::Center,
        text_decoration: TextDecorationDrawParam::None,
        text_overflow: TextOverflowDrawParam::Clip,
        text_transform: TextTransformDrawParam::None,
        white_space: WhiteSpaceDrawParam::Normal,
        padding: EdgeInsetsDrawParam::default(),
        intent: choice.enabled.then(|| RendererIntent {
            event: "choice/select".to_string(),
            choice_id: Some(choice.id.clone()),
            element_id: None,
            action: None,
            metadata: Default::default(),
        }),
    }));

    command = apply_provenance(command, &choice.provenance);
    command
}

fn apply_provenance(mut command: DrawCommand, provenance: &PackageProvenance) -> DrawCommand {
    if let Some(package_id) = &provenance.content_package_id {
        command = command.owned_by(package_id.clone());
    }

    for package_id in &provenance.required_runtime_packages {
        command = command.require_package(package_id.clone());
    }

    command
}
