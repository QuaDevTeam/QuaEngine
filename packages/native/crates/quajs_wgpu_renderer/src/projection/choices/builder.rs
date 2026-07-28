use crate::projection::common::{insert_unique_safe_native_dispatch_identifier, PackageProvenance};
use crate::projection::dialogue::layout::dialogue_panel_bounds;
use crate::projection::safety::is_safe_native_text_payload;
use crate::render_graph::{
    BorderDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams, EdgeInsetsDrawParam,
    FontStyleDrawParam, GradientDrawKind, GradientDrawParams, GradientDrawRadialShape, RenderGraph,
    RenderPlane, RendererIntent, TextAlign, TextDecorationDrawParam, TextOverflowDrawParam,
    TextTransformDrawParam, UiButtonDrawParams, WhiteSpaceDrawParam,
};
use crate::stage_layout::ResolvedStageLayout;

use super::layout::{choice_button_bounds, choices_panel_bounds, choices_panel_bounds_with_bottom};
use super::types::{ChoiceProjection, ChoiceSetProjection};

pub fn append_choice_commands(graph: &mut RenderGraph, choices: &ChoiceSetProjection) {
    graph.extend(build_choice_commands(&graph.layout, choices));
}

pub fn append_choice_commands_with_dialogue(
    graph: &mut RenderGraph,
    choices: &ChoiceSetProjection,
    dialogue_visible: bool,
) {
    graph.extend(build_choice_commands_with_dialogue(
        &graph.layout,
        choices,
        dialogue_visible,
    ));
}

pub fn build_choice_commands(
    layout: &ResolvedStageLayout,
    choices: &ChoiceSetProjection,
) -> Vec<DrawCommand> {
    build_choice_commands_with_dialogue(layout, choices, false)
}

pub fn build_choice_commands_with_dialogue(
    layout: &ResolvedStageLayout,
    choices: &ChoiceSetProjection,
    dialogue_visible: bool,
) -> Vec<DrawCommand> {
    if !choices.visible || choices.choices.is_empty() {
        return Vec::new();
    }

    let mut seen_choice_ids = std::collections::BTreeSet::new();
    let safe_choices = choices
        .choices
        .iter()
        .filter(|choice| {
            insert_unique_safe_native_dispatch_identifier(&mut seen_choice_ids, &choice.id)
                && is_safe_native_text_payload(&choice.text)
        })
        .collect::<Vec<_>>();
    if safe_choices.is_empty() {
        return Vec::new();
    }

    let panel = if dialogue_visible {
        let dialogue = dialogue_panel_bounds(layout);
        choices_panel_bounds_with_bottom(layout, safe_choices.len(), dialogue.y - 74.0)
    } else {
        choices_panel_bounds(layout, safe_choices.len())
    };
    let mut commands = vec![apply_provenance(
        DrawCommand::new(
            "choices:panel",
            RenderPlane::Safe,
            DrawCommandKind::RoundedRect,
            panel,
        )
        .z_index(10)
        .params(DrawCommandParams::Gradient(GradientDrawParams {
            role: "choices-panel".to_string(),
            kind: GradientDrawKind::Linear,
            start_color: "rgba(4,5,8,0.0)".to_string(),
            end_color: "rgba(4,5,8,0.72)".to_string(),
            angle_degrees: 90.0,
            center_x: 0.0,
            center_y: 0.0,
            radius: 0.0,
            radial_shape: GradientDrawRadialShape::Circle,
            start_offset: 0.0,
            end_offset: 1.0,
            fill_before_start: true,
            fill_after_end: true,
            corner_radius: 2.0,
        })),
        &choices.provenance,
    )];

    commands.extend(
        safe_choices
            .iter()
            .copied()
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
        background_color: "rgba(8,10,15,0.88)".to_string(),
        text_color: "#fff8ea".to_string(),
        corner_radius: 2.0,
        border: BorderDrawParams {
            color: Some("rgba(245,226,190,0.28)".to_string()),
            width: 1.0,
        },
        font_family: vec!["Noto Sans".to_string()],
        font_size: 16.0,
        font_style: FontStyleDrawParam::Normal,
        font_weight: None,
        letter_spacing: 0.0,
        line_height: 24.0,
        align: TextAlign::Left,
        text_decoration: TextDecorationDrawParam::None,
        text_overflow: TextOverflowDrawParam::Clip,
        text_transform: TextTransformDrawParam::None,
        white_space: WhiteSpaceDrawParam::Normal,
        padding: EdgeInsetsDrawParam {
            top: 10.0,
            right: 16.0,
            bottom: 10.0,
            left: 16.0,
        },
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
    if let Some(package_id) = provenance.safe_content_package_id() {
        command = command.owned_by(package_id);
    }

    for package_id in provenance.safe_required_runtime_packages() {
        command = command.require_package(package_id);
    }

    command
}
