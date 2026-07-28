use crate::projection::common::{is_safe_native_asset_ref, PackageProvenance};
use crate::projection::typography::font_family_resource_ids;
use crate::render_graph::{
    BorderDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams, EdgeInsetsDrawParam,
    FontStyleDrawParam, GradientDrawKind, GradientDrawParams, GradientDrawRadialShape,
    ImageDrawParams, LogicalRect, MediaFit, MediaOrigin, PanelDrawParams, RenderGraph, RenderPlane,
    ShadowDrawParams, ShadowDrawStyle, TextDecorationDrawParam, TextDrawParams,
    TextOverflowDrawParam, TextTransformDrawParam, WhiteSpaceDrawParam,
};
use crate::resources::ResourceId;
use crate::stage_layout::ResolvedStageLayout;

use super::layout::{
    avatar_bounds, dialogue_accent_bounds, dialogue_panel_bounds, speaker_accent_bounds,
    speaker_bounds, text_bounds,
};
use super::rich_text::{
    is_safe_rich_text_payload, resolve_font_family, resolve_font_size, resolve_font_weight,
    resolve_line_height, resolve_text_align, resolve_text_color, rich_text_style,
    rich_text_to_plain_text,
};
use super::types::{DialogueAvatarProjection, DialogueProjection, RichTextStyle};

pub fn append_dialogue_commands(graph: &mut RenderGraph, dialogue: &DialogueProjection) {
    graph.extend(build_dialogue_commands(&graph.layout, dialogue));
}

pub fn build_dialogue_commands(
    layout: &ResolvedStageLayout,
    dialogue: &DialogueProjection,
) -> Vec<DrawCommand> {
    if !dialogue.visible || !is_safe_rich_text_payload(&dialogue.text) {
        return Vec::new();
    }

    let panel = dialogue_panel_bounds(layout);

    // Outer drop shadow: box-shadow 0 22px 80px rgba(0,0,0,0.62)
    let shadow_blur = 80.0_f64;
    let shadow_offset_y = 22.0_f64;
    let shadow_extent = shadow_blur * 1.5;
    let shadow_bounds = LogicalRect {
        x: panel.x - shadow_extent,
        y: panel.y + shadow_offset_y - shadow_extent,
        width: panel.width + shadow_extent * 2.0,
        height: panel.height + shadow_extent * 2.0,
    };

    let mut commands = vec![
        apply_provenance(
            DrawCommand::new(
                "dialogue:shadow",
                RenderPlane::Safe,
                DrawCommandKind::RoundedRect,
                shadow_bounds,
            )
            .z_index(-2)
            .params(DrawCommandParams::Shadow(ShadowDrawParams {
                role: "dialogue-shadow".to_string(),
                source_bounds: panel,
                offset_x: 0.0,
                offset_y: shadow_offset_y,
                blur_radius: shadow_blur,
                spread_radius: 0.0,
                corner_radius: 2.0,
                color: "rgba(0,0,0,0.62)".to_string(),
                style: ShadowDrawStyle::Outer,
            })),
            &dialogue.provenance,
        ),
        apply_provenance(
            DrawCommand::new(
                "dialogue:panel",
                RenderPlane::Safe,
                DrawCommandKind::RoundedRect,
                panel,
            )
            .z_index(0)
            .params(DrawCommandParams::Panel(PanelDrawParams {
                role: "dialogue-panel".to_string(),
                corner_radius: 2.0,
                fill_color: "rgba(7,8,12,0.97)".to_string(),
                border: BorderDrawParams {
                    color: Some("rgba(245,226,190,0.28)".to_string()),
                    width: 1.0,
                },
                padding: EdgeInsetsDrawParam::default(),
                intent: None,
                rotation_degrees: 0.0,
            })),
            &dialogue.provenance,
        ),
        // Subtle 180° gradient overlay for depth (top-lit, transparent end).
        apply_provenance(
            DrawCommand::new(
                "dialogue:gradient",
                RenderPlane::Safe,
                DrawCommandKind::RoundedRect,
                panel,
            )
            .z_index(0)
            .params(DrawCommandParams::Gradient(GradientDrawParams {
                role: "dialogue-gradient".to_string(),
                kind: GradientDrawKind::Linear,
                start_color: "rgba(255,255,255,0.04)".to_string(),
                end_color: "rgba(0,0,0,0.0)".to_string(),
                angle_degrees: 180.0,
                center_x: 0.0,
                center_y: 0.0,
                radius: 0.0,
                radial_shape: GradientDrawRadialShape::Circle,
                start_offset: 0.0,
                end_offset: 0.45,
                fill_before_start: true,
                fill_after_end: true,
                corner_radius: 2.0,
            })),
            &dialogue.provenance,
        ),
        // Inset highlight: box-shadow inset 0 1px 0 rgba(255,226,166,0.14)
        apply_provenance(
            DrawCommand::new(
                "dialogue:inset-highlight",
                RenderPlane::Safe,
                DrawCommandKind::RoundedRect,
                panel,
            )
            .z_index(0)
            .params(DrawCommandParams::Shadow(ShadowDrawParams {
                role: "dialogue-inset-highlight".to_string(),
                source_bounds: panel,
                offset_x: 0.0,
                offset_y: 1.0,
                blur_radius: 0.0,
                spread_radius: 0.0,
                corner_radius: 2.0,
                color: "rgba(255,226,166,0.14)".to_string(),
                style: ShadowDrawStyle::Inset,
            })),
            &dialogue.provenance,
        ),
        apply_provenance(
            panel_command(
                "dialogue:accent",
                dialogue_accent_bounds(panel),
                "dialogue-accent",
                "rgba(255,226,166,0.36)",
                0.0,
                BorderDrawParams::default(),
            )
            .z_index(1),
            &dialogue.provenance,
        ),
    ];

    let fallback_speaker = dialogue
        .character_name
        .as_ref()
        .filter(|name| crate::projection::safety::is_safe_native_text_payload(name))
        .map(|name| super::types::RichTextContent::Plain(name.clone()));
    let render_speaker = dialogue
        .speaker
        .as_ref()
        .filter(|speaker| is_safe_rich_text_payload(speaker))
        .or(fallback_speaker.as_ref());

    if let Some(speaker) = render_speaker {
        commands.push(apply_provenance(
            text_command(
                "dialogue:speaker",
                speaker_bounds(panel),
                rich_text_to_plain_text(speaker),
                &dialogue.speaker_style,
                "speaker",
                24.0,
                30.0,
            )
            .z_index(2),
            &dialogue.provenance,
        ));
        commands.push(apply_provenance(
            panel_command(
                "dialogue:speaker-accent",
                speaker_accent_bounds(panel),
                "speaker-accent",
                "rgba(255,226,166,0.48)",
                0.0,
                BorderDrawParams::default(),
            )
            .z_index(2),
            &dialogue.provenance,
        ));
    }

    let default_text_style = RichTextStyle::default();
    let dialogue_text_style = rich_text_style(&dialogue.text).unwrap_or(&default_text_style);
    commands.push(apply_provenance(
        text_command(
            "dialogue:text",
            text_bounds(panel, render_speaker.is_some()),
            rich_text_to_plain_text(&dialogue.text),
            dialogue_text_style,
            "dialogue-text",
            27.0,
            36.0,
        )
        .z_index(2),
        &dialogue.provenance,
    ));

    if let Some(avatar) = &dialogue.avatar {
        if let Some(command) = avatar_command(panel, avatar) {
            commands.push(command);
        }
    }

    // Apply presence fade (enter/exit transition driven by the runtime).
    if dialogue.presence_opacity < 1.0 {
        for command in &mut commands {
            command.opacity = (command.opacity * dialogue.presence_opacity).clamp(0.0, 1.0);
        }
    }

    commands
}

fn panel_command(
    id: &str,
    bounds: crate::render_graph::LogicalRect,
    role: &str,
    fill_color: &str,
    corner_radius: f64,
    border: BorderDrawParams,
) -> DrawCommand {
    DrawCommand::new(id, RenderPlane::Safe, DrawCommandKind::RoundedRect, bounds).params(
        DrawCommandParams::Panel(PanelDrawParams {
            role: role.to_string(),
            corner_radius,
            fill_color: fill_color.to_string(),
            border,
            padding: EdgeInsetsDrawParam::default(),
            intent: None,
            rotation_degrees: 0.0,
        }),
    )
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
            color: resolve_text_color(
                style,
                if role == "speaker" {
                    "#e8c878"
                } else {
                    "#f7f2ea"
                },
            ),
            blur_radius: 0.0,
            padding: EdgeInsetsDrawParam::default(),
            role: role.to_string(),
            rotation_degrees: 0.0,
        }))
}

fn avatar_command(
    panel: crate::render_graph::LogicalRect,
    avatar: &DialogueAvatarProjection,
) -> Option<DrawCommand> {
    if !is_safe_native_asset_ref(&avatar.asset_type, &avatar.asset_name) {
        return None;
    }

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
        rotation_degrees: 0.0,
        brightness: 1.0,
        saturation: 1.0,
        contrast: 1.0,
        grayscale: 0.0,
        sepia: 0.0,
        hue_rotate_radians: 0.0,
        invert: 0.0,
    }));

    Some(apply_provenance(command, &avatar.provenance))
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
