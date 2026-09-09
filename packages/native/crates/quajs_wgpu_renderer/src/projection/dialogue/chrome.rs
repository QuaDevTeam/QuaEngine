//! Optional product-authored dialogue chrome. No demo names or story policy.
use super::builder::{apply_provenance, TextHeightMeasurer};
use super::inline::inline_text_commands;
use super::rich_text::{is_safe_rich_text_payload, rich_text_to_plain_text};
use super::{DialogueProjection, RichTextContent, RichTextStyle};
use crate::render_graph::*;
use crate::stage_layout::ResolvedStageLayout;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogueChromeProjection {
    pub min_height: f64,
    pub padding_x: f64,
    pub padding_top: f64,
    pub padding_bottom: f64,
    pub speaker_gap: f64,
    pub fill_color: String,
    pub border_color: String,
    pub accent_color: String,
    pub text_style: RichTextStyle,
    pub speaker_style: RichTextStyle,
}

pub(super) fn build(
    layout: &ResolvedStageLayout,
    dialogue: &DialogueProjection,
    chrome: &DialogueChromeProjection,
    measure: &TextHeightMeasurer<'_>,
) -> Vec<DrawCommand> {
    let safe = layout.safe_area;
    let width = safe.width * 0.9;
    let avatar_size = (chrome.min_height * 0.55).min(180.0);
    let avatar_space = if dialogue.avatar.is_some() {
        avatar_size + 28.0
    } else {
        0.0
    };
    let text_width = (width - chrome.padding_x * 2.0 - avatar_space).max(1.0);
    let fallback = dialogue
        .character_name
        .as_ref()
        .map(|s| RichTextContent::Plain(s.clone()));
    let speaker = dialogue
        .speaker
        .as_ref()
        .or(fallback.as_ref())
        .filter(|s| is_safe_rich_text_payload(s));
    let speaker_style = super::typography::inherit(&chrome.speaker_style, &dialogue.speaker_style);
    let text_style = super::typography::inherit(
        &chrome.text_style,
        super::rich_text::rich_text_style(&dialogue.text).unwrap_or(&RichTextStyle::default()),
    );
    let text_style = &text_style;
    let text_size = super::typography::font_size(text_style, 20.0);
    let line_height = super::typography::line_height(text_style, text_size, text_size * 1.8);
    let speaker_size = super::typography::font_size(&speaker_style, 20.0);
    let speaker_height = speaker
        .map(|_| super::typography::line_height(&speaker_style, speaker_size, speaker_size * 1.5))
        .unwrap_or(0.0);
    let body_top = chrome.padding_top
        + if speaker.is_some() {
            speaker_height + chrome.speaker_gap
        } else {
            0.0
        };
    let body = |rect| {
        inline_text_commands(
            "dialogue:text",
            rect,
            &dialogue.text,
            dialogue.layout_text.as_ref(),
            text_style,
            "dialogue-text",
            text_size,
            line_height,
            None,
            None,
            &dialogue.provenance,
        )
    };
    let plain = rich_text_to_plain_text(dialogue.layout_text.as_ref().unwrap_or(&dialogue.text));
    let estimated: f64 = plain
        .split('\n')
        .map(|line| {
            let units: f64 = line
                .chars()
                .map(|c| if c.is_ascii() { 0.55 } else { 1.0 })
                .sum();
            (units * text_size / text_width).ceil().max(1.0) * line_height
        })
        .sum();
    let height = body(LogicalRect {
        x: 0.0,
        y: 0.0,
        width: text_width,
        height: 1.0,
    })
    .iter()
    .find_map(|c| {
        if let DrawCommandParams::Text(p) = &c.params {
            measure(p, text_width)
        } else {
            None
        }
    })
    .filter(|h| h.is_finite() && *h >= 0.0)
    .unwrap_or(estimated);
    let panel_height = chrome
        .min_height
        .max(body_top + height + chrome.padding_bottom);
    let panel = LogicalRect {
        x: safe.x + safe.width * 0.05,
        y: safe.y + safe.height - layout.logical_height * 0.05 - panel_height,
        width,
        height: panel_height,
    };
    let panel_cmd = |id: &str, bounds, fill: &str, border: bool| {
        apply_provenance(
            DrawCommand::new(id, RenderPlane::Safe, DrawCommandKind::RoundedRect, bounds).params(
                DrawCommandParams::Panel(PanelDrawParams {
                    role: id.to_string(),
                    corner_radius: if border { 3.0 } else { 0.0 },
                    fill_color: fill.into(),
                    border: if border {
                        BorderDrawParams {
                            color: Some(chrome.border_color.clone()),
                            width: 1.0,
                        }
                    } else {
                        Default::default()
                    },
                    padding: Default::default(),
                    intent: None,
                    rotation_degrees: 0.0,
                }),
            ),
            &dialogue.provenance,
        )
    };
    let mut commands = vec![
        panel_cmd("dialogue:panel", panel, &chrome.fill_color, true),
        panel_cmd(
            "dialogue:accent",
            LogicalRect {
                height: 3.0,
                ..panel
            },
            &chrome.accent_color,
            false,
        ),
    ];
    if chrome.padding_bottom >= 32.0 {
        commands.push(panel_cmd(
            "dialogue:footer-rule",
            LogicalRect {
                x: panel.x + chrome.padding_x,
                y: panel.y + panel.height - chrome.padding_bottom + 12.0,
                width: text_width,
                height: 1.0,
            },
            &chrome.border_color,
            false,
        ));
    }
    if let Some(speaker) = speaker {
        commands.extend(inline_text_commands(
            "dialogue:speaker",
            LogicalRect {
                x: panel.x + chrome.padding_x,
                y: panel.y + chrome.padding_top,
                width: text_width,
                height: speaker_height,
            },
            speaker,
            None,
            &speaker_style,
            "speaker",
            speaker_size,
            speaker_height,
            None,
            None,
            &dialogue.provenance,
        ));
    }
    commands.extend(body(LogicalRect {
        x: panel.x + chrome.padding_x,
        y: panel.y + body_top,
        width: text_width,
        height,
    }));
    if let Some(avatar) = &dialogue.avatar {
        if let Some(mut command) = super::builder::avatar_command(panel, avatar_size, avatar) {
            command.bounds.x = panel.x + width - chrome.padding_x - avatar_size;
            command.bounds.y = panel.y + chrome.padding_top;
            commands.push(command);
        }
    }
    for command in &mut commands {
        command.opacity *= dialogue.presence_opacity;
    }
    commands
}
