use crate::projection::common::PackageProvenance;
use crate::projection::typography::font_family_resource_ids;
use crate::render_graph::{
    BorderDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams, EdgeInsetsDrawParam,
    FontStyleDrawParam, ImageDrawParams, MediaFit, MediaOrigin, PanelDrawParams, RenderGraph,
    RenderPlane, TextDecorationDrawParam, TextDrawParams, TextOverflowDrawParam,
    TextTransformDrawParam, WhiteSpaceDrawParam,
};
use crate::resources::ResourceId;
use crate::stage_layout::ResolvedStageLayout;

use super::layout::{avatar_bounds, dialogue_panel_bounds, speaker_bounds, text_bounds};
use super::rich_text::{
    resolve_font_family, resolve_font_size, resolve_font_weight, resolve_line_height,
    resolve_text_align, resolve_text_color, rich_text_style, rich_text_to_plain_text,
};
use super::types::{DialogueAvatarProjection, DialogueProjection, RichTextStyle};

pub fn append_dialogue_commands(graph: &mut RenderGraph, dialogue: &DialogueProjection) {
    graph.extend(build_dialogue_commands(&graph.layout, dialogue));
}

pub fn build_dialogue_commands(
    layout: &ResolvedStageLayout,
    dialogue: &DialogueProjection,
) -> Vec<DrawCommand> {
    if !dialogue.visible {
        return Vec::new();
    }

    let panel = dialogue_panel_bounds(layout);
    let mut commands = vec![apply_provenance(
        DrawCommand::new(
            "dialogue:panel",
            RenderPlane::Safe,
            DrawCommandKind::RoundedRect,
            panel,
        )
        .z_index(0)
        .params(DrawCommandParams::Panel(PanelDrawParams {
            role: "dialogue-panel".to_string(),
            corner_radius: 18.0,
            fill_color: "rgba(0,0,0,0.72)".to_string(),
            border: BorderDrawParams::default(),
            padding: EdgeInsetsDrawParam::default(),
            intent: None,
        })),
        &dialogue.provenance,
    )];

    if let Some(speaker) = &dialogue.speaker {
        commands.push(apply_provenance(
            text_command(
                "dialogue:speaker",
                speaker_bounds(panel),
                rich_text_to_plain_text(speaker),
                &dialogue.speaker_style,
                "speaker",
                34.0,
                42.0,
            )
            .z_index(1),
            &dialogue.provenance,
        ));
    }

    let default_text_style = RichTextStyle::default();
    let dialogue_text_style = rich_text_style(&dialogue.text).unwrap_or(&default_text_style);
    commands.push(apply_provenance(
        text_command(
            "dialogue:text",
            text_bounds(panel, dialogue.speaker.is_some()),
            rich_text_to_plain_text(&dialogue.text),
            dialogue_text_style,
            "dialogue-text",
            30.0,
            42.0,
        )
        .z_index(1),
        &dialogue.provenance,
    ));

    if let Some(avatar) = &dialogue.avatar {
        commands.push(avatar_command(panel, avatar));
    }

    commands
}

fn text_command(
    id: &str,
    bounds: crate::render_graph::LogicalRect,
    text: String,
    style: &RichTextStyle,
    role: &str,
    fallback_font_size: f64,
    fallback_line_height: f64,
) -> DrawCommand {
    let font_family = resolve_font_family(style);

    DrawCommand::new(id, RenderPlane::Safe, DrawCommandKind::Text, bounds)
        .resources(font_family_resource_ids(&font_family))
        .params(DrawCommandParams::Text(TextDrawParams {
            text,
            font_family,
            font_size: resolve_font_size(style, fallback_font_size),
            font_style: FontStyleDrawParam::Normal,
            font_weight: resolve_font_weight(style),
            letter_spacing: 0.0,
            line_height: resolve_line_height(style, fallback_line_height),
            align: resolve_text_align(style),
            text_decoration: TextDecorationDrawParam::None,
            text_overflow: TextOverflowDrawParam::Clip,
            text_transform: TextTransformDrawParam::None,
            white_space: WhiteSpaceDrawParam::Normal,
            color: resolve_text_color(style, "#ffffff"),
            padding: EdgeInsetsDrawParam::default(),
            role: role.to_string(),
        }))
}

fn avatar_command(
    panel: crate::render_graph::LogicalRect,
    avatar: &DialogueAvatarProjection,
) -> DrawCommand {
    let command = DrawCommand::new(
        "dialogue:avatar",
        RenderPlane::Safe,
        DrawCommandKind::Image,
        avatar_bounds(panel),
    )
    .z_index(2)
    .resource(ResourceId::new(format!(
        "{}:{}",
        avatar.asset_type, avatar.asset_name
    )))
    .params(DrawCommandParams::Image(ImageDrawParams {
        asset_type: avatar.asset_type.clone(),
        asset_name: avatar.asset_name.clone(),
        fit: MediaFit::Cover,
        origin: MediaOrigin::default(),
        source: avatar_bounds(panel),
    }));

    apply_provenance(command, &avatar.provenance)
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
