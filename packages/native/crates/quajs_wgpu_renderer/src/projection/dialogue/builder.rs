use crate::projection::common::{is_safe_native_asset_ref, PackageProvenance};
use crate::projection::typography::font_family_resource_ids;
use crate::render_graph::{
    BackdropBlurDrawParams, BorderDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams,
    EdgeInsetsDrawParam, FontStyleDrawParam, FontWeightDrawParam, GradientDrawKind,
    GradientDrawParams, GradientDrawRadialShape, ImageDrawParams, LogicalRect, MediaFit,
    MediaOrigin, PanelDrawParams, RenderGraph, RenderPlane, ShadowDrawParams, ShadowDrawStyle,
    TextDecorationDrawParam, TextDrawParams, TextOverflowDrawParam, TextTransformDrawParam,
    WhiteSpaceDrawParam,
};
use crate::resources::ResourceId;
use crate::stage_layout::ResolvedStageLayout;

use super::layout::{
    dialogue_accent_bounds, dialogue_panel_bounds_for_lines, speaker_accent_bounds, speaker_bounds,
    text_bounds,
};
use super::rich_text::{
    is_safe_rich_text_payload, resolve_font_family, resolve_font_size, resolve_font_weight,
    resolve_line_height, resolve_text_align, resolve_text_color, rich_text_style,
    rich_text_to_plain_text,
};
use super::types::{DialogueAvatarProjection, DialogueProjection, RichTextContent, RichTextStyle};

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

    let default_text_style = RichTextStyle::default();
    let dialogue_text_style = rich_text_style(&dialogue.text).unwrap_or(&default_text_style);
    let dialogue_text = rich_text_to_plain_text(&dialogue.text);
    let text_font_size = resolve_font_size(dialogue_text_style, 20.0);
    let text_line_height = resolve_line_height(dialogue_text_style, 36.0);

    // Grow the panel like the Web `min-height` dialogue box so longer lines
    // are not clipped; the bottom edge stays anchored to the stage inset.
    let base_panel = super::layout::dialogue_panel_bounds(layout);
    // Reserve a stable avatar column before measuring text. Growing the panel
    // must not grow the avatar into the text column again.
    let avatar_size = base_panel.height * 0.72;
    let avatar_space = if dialogue.avatar.is_some() {
        avatar_size + 28.0
    } else {
        0.0
    };
    let text_width = base_panel.width - 56.0 - avatar_space;
    let layout_text = dialogue
        .layout_text
        .as_ref()
        .filter(|text| is_safe_rich_text_payload(text))
        .map(rich_text_to_plain_text)
        .unwrap_or_else(|| dialogue_text.clone());
    let estimated_lines = estimate_wrapped_lines(&layout_text, text_font_size, text_width);
    let panel = dialogue_panel_bounds_for_lines(
        layout,
        estimated_lines,
        render_speaker.is_some(),
        text_line_height,
    );

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
        // Backdrop blur: sample the pre-Safe-plane framebuffer behind the
        // dialogue box to approximate `backdrop-filter: blur(8px)`.
        apply_provenance(
            DrawCommand::new(
                "dialogue:backdrop-blur",
                RenderPlane::Safe,
                DrawCommandKind::BackdropBlur,
                panel,
            )
            .z_index(-3)
            .params(DrawCommandParams::BackdropBlur(BackdropBlurDrawParams {
                blur_radius: 8.0,
            })),
            &dialogue.provenance,
        ),
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
                fill_color: "rgba(7,8,12,0.90)".to_string(),
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
                start_color: "rgba(22,21,24,0.82)".to_string(),
                end_color: "rgba(0,0,0,0.0)".to_string(),
                angle_degrees: 180.0,
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
                color: "rgba(255,255,255,0.07)".to_string(),
                style: ShadowDrawStyle::Inset,
            })),
            &dialogue.provenance,
        ),
    ];

    // Top accent: horizontal gradient matching web's
    // `linear-gradient(90deg, transparent, rgba(255,226,166,0.88), transparent)`.
    // Implemented as two mirrored gradients (transparent→gold, then gold→transparent)
    // since GradientDrawParams only supports two colour stops.
    {
        let accent = dialogue_accent_bounds(panel);
        let half_w = accent.width / 2.0;
        let left_half = LogicalRect {
            x: accent.x,
            y: accent.y,
            width: half_w,
            height: accent.height,
        };
        let right_half = LogicalRect {
            x: accent.x + half_w,
            y: accent.y,
            width: accent.width - half_w,
            height: accent.height,
        };
        let make_gradient = |id: &str, start: &str, end: &str, bounds: LogicalRect| {
            DrawCommand::new(id, RenderPlane::Safe, DrawCommandKind::RoundedRect, bounds)
                .z_index(1)
                .params(DrawCommandParams::Gradient(GradientDrawParams {
                    role: id.to_string(),
                    kind: GradientDrawKind::Linear,
                    start_color: start.to_string(),
                    end_color: end.to_string(),
                    angle_degrees: 90.0,
                    center_x: 0.0,
                    center_y: 0.0,
                    radius: 0.0,
                    radial_shape: GradientDrawRadialShape::Circle,
                    start_offset: 0.0,
                    end_offset: 1.0,
                    fill_before_start: true,
                    fill_after_end: true,
                    corner_radius: 0.0,
                }))
        };
        commands.push(apply_provenance(
            make_gradient(
                "dialogue:accent-left",
                "rgba(255,226,166,0)",
                "rgba(255,226,166,0.88)",
                left_half,
            ),
            &dialogue.provenance,
        ));
        commands.push(apply_provenance(
            make_gradient(
                "dialogue:accent-right",
                "rgba(255,226,166,0.88)",
                "rgba(255,226,166,0)",
                right_half,
            ),
            &dialogue.provenance,
        ));
    }

    if let Some(speaker) = render_speaker {
        // CSS `text-shadow: 0 0 16px rgba(255,194,86,0.36)` — golden glow on speaker name.
        commands.extend(inline_text_commands("dialogue:speaker", speaker_bounds(panel), speaker,
            &dialogue.speaker_style, "speaker", 18.0, 20.0,
            Some(FontWeightDrawParam::Number(700)),
            Some((0.0, 0.0, 16.0, "rgba(255,194,86,0.36)")), &dialogue.provenance));
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

    let mut text_rect = text_bounds(panel, render_speaker.is_some());
    text_rect.width = text_width.max(0.0);
    // CSS `text-shadow: 0 2px 10px rgba(0,0,0,0.72)` — subtle drop shadow on body text.
    commands.extend(inline_text_commands("dialogue:text", text_rect, &dialogue.text,
        dialogue_text_style, "dialogue-text", 20.0, 36.0, None,
        Some((0.0, 2.0, 10.0, "rgba(0,0,0,0.72)")), &dialogue.provenance));

    if let Some(avatar) = &dialogue.avatar {
        if let Some(command) = avatar_command(panel, avatar_size, avatar) {
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

/// Estimates the wrapped line count without a text measurer: CJK/wide glyphs
/// count as one em, ASCII glyphs as roughly half an em. Good enough for the
/// `min-height` growth decision; real wrapping still happens at draw time.
fn estimate_wrapped_lines(text: &str, font_size: f64, width: f64) -> usize {
    if width <= 0.0 || font_size <= 0.0 {
        return 1;
    }
    let ems_per_line = width / font_size;
    let mut lines = 0usize;
    for segment in text.split('\n') {
        let ems: f64 = segment
            .chars()
            .map(|ch| if ch.is_ascii() { 0.55 } else { 1.0 })
            .sum();
        lines += ((ems / ems_per_line).ceil() as usize).max(1);
    }
    lines.max(1)
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
    fallback_font_weight: Option<FontWeightDrawParam>,
    blur_radius: f64,
) -> DrawCommand {
    let font_family = resolve_font_family(style);
    // Honour the projection's font weight; fall back to the caller-supplied default.
    let font_weight = resolve_font_weight(style).or(fallback_font_weight);

    DrawCommand::new(id, RenderPlane::Safe, DrawCommandKind::Text, bounds)
        .resources(font_family_resource_ids(&font_family))
        .params(DrawCommandParams::Text(TextDrawParams {
            text,
            font_family,
            font_size: resolve_font_size(style, fallback_font_size),
            font_style: FontStyleDrawParam::Normal,
            font_weight,
            letter_spacing: 0.0,
            line_height: resolve_line_height(style, fallback_line_height),
            align: resolve_text_align(style),
            text_decoration: TextDecorationDrawParam::None,
            text_overflow: TextOverflowDrawParam::Clip,
            text_transform: TextTransformDrawParam::None,
            white_space: WhiteSpaceDrawParam::PreWrap,
            color: resolve_text_color(
                style,
                if role == "speaker" {
                    "#ffe3a0"
                } else {
                    "#fffaf2"
                },
            ),
            blur_radius,
            padding: EdgeInsetsDrawParam::default(),
            role: role.to_string(),
            rotation_degrees: 0.0,
        }))
}

fn inline_text_commands(
    id: &str,
    bounds: LogicalRect,
    content: &RichTextContent,
    document_style: &RichTextStyle,
    role: &str,
    fallback_font_size: f64,
    fallback_line_height: f64,
    fallback_font_weight: Option<FontWeightDrawParam>,
    shadow: Option<(f64, f64, f64, &str)>,
    provenance: &PackageProvenance,
) -> Vec<DrawCommand> {
    let runs = rich_text_runs(content, document_style);
    let total_width = bounds.width.max(1.0);
    let total_ems = runs
        .iter()
        .map(|(text, style)| estimate_text_ems(text, resolve_font_size(style, fallback_font_size)))
        .sum::<f64>()
        .max(1.0);
    let mut cursor = bounds.x;
    let mut commands = Vec::new();
    for (index, (text, style)) in runs.into_iter().enumerate() {
        if text.is_empty() {
            continue;
        }
        let width = (total_width
            * estimate_text_ems(&text, resolve_font_size(&style, fallback_font_size))
            / total_ems)
            .max(1.0);
        let run_bounds = LogicalRect {
            x: cursor,
            y: bounds.y,
            width,
            height: bounds.height,
        };
        let run_id = if index == 0 {
            id.to_string()
        } else {
            format!("{id}:{index}")
        };
        if let Some((offset_x, offset_y, blur, color)) = shadow {
            commands.push(apply_provenance(
                text_shadow_command(
                    &run_id,
                    run_bounds,
                    text.clone(),
                    &style,
                    role,
                    fallback_font_size,
                    fallback_line_height,
                    fallback_font_weight.clone(),
                    offset_x,
                    offset_y,
                    blur,
                    color,
                    2,
                ),
                provenance,
            ));
        }
        commands.push(apply_provenance(
            text_command(
                &run_id,
                run_bounds,
                text,
                &style,
                role,
                fallback_font_size,
                fallback_line_height,
                fallback_font_weight.clone(),
                0.0,
            )
            .z_index(2),
            provenance,
        ));
        cursor += width;
    }
    commands
}

fn rich_text_runs(
    content: &RichTextContent,
    document_style: &RichTextStyle,
) -> Vec<(String, RichTextStyle)> {
    match content {
        RichTextContent::Plain(text) => vec![(text.clone(), document_style.clone())],
        RichTextContent::Document(document) => document
            .blocks
            .iter()
            .flat_map(|block| block.spans.iter())
            .map(|span| (span.text.clone(), merge_rich_text_style(document_style, &span.style)))
            .collect(),
    }
}

fn merge_rich_text_style(base: &RichTextStyle, override_style: &RichTextStyle) -> RichTextStyle {
    RichTextStyle {
        color: override_style.color.clone().or_else(|| base.color.clone()),
        font_family: override_style.font_family.clone().or_else(|| base.font_family.clone()),
        font_size: override_style.font_size.or(base.font_size),
        font_weight: override_style.font_weight.clone().or_else(|| base.font_weight.clone()),
        line_height: override_style.line_height.or(base.line_height),
        text_align: override_style.text_align.clone().or_else(|| base.text_align.clone()),
    }
}

fn estimate_text_ems(text: &str, font_size: f64) -> f64 {
    text.chars()
        .map(|ch| if ch.is_ascii() { 0.55 } else { 1.0 })
        .sum::<f64>()
        * font_size.max(1.0)
}

/// Creates a CSS `text-shadow`-style pre-pass command: the text is rendered at
/// (`offset_x`, `offset_y`) in `shadow_color` with `blur_radius` applied.
/// Intended to be pushed *before* the main text command (lower `z_index`).
fn text_shadow_command(
    id: &str,
    bounds: crate::render_graph::LogicalRect,
    text: String,
    style: &RichTextStyle,
    role: &str,
    fallback_font_size: f64,
    fallback_line_height: f64,
    fallback_font_weight: Option<FontWeightDrawParam>,
    offset_x: f64,
    offset_y: f64,
    blur: f64,
    shadow_color: &str,
    z_index: i32,
) -> DrawCommand {
    // Inherit all style properties from the source text but override the colour.
    let shadow_style = RichTextStyle {
        color: Some(shadow_color.to_string()),
        ..style.clone()
    };
    let shadow_bounds = crate::render_graph::LogicalRect {
        x: bounds.x + offset_x,
        y: bounds.y + offset_y,
        width: bounds.width,
        height: bounds.height,
    };
    text_command(
        &format!("{id}:shadow"),
        shadow_bounds,
        text,
        &shadow_style,
        &format!("{role}-shadow"),
        fallback_font_size,
        fallback_line_height,
        fallback_font_weight,
        blur,
    )
    .z_index(z_index - 1)
}

fn avatar_command(
    panel: crate::render_graph::LogicalRect,
    size: f64,
    avatar: &DialogueAvatarProjection,
) -> Option<DrawCommand> {
    if !is_safe_native_asset_ref(&avatar.asset_type, &avatar.asset_name) {
        return None;
    }

    let bounds = LogicalRect {
        x: panel.x + panel.width - size - 28.0,
        y: panel.y + 22.0,
        width: size,
        height: size,
    };
    let command = DrawCommand::new(
        "dialogue:avatar",
        RenderPlane::Safe,
        DrawCommandKind::Image,
        bounds,
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
        source: bounds,
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
