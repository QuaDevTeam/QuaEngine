use std::collections::BTreeSet;

use super::*;
use crate::projection::common::{FontFamilyProjection, FontWeightProjection, PackageProvenance};
use crate::projection::safety::{
    MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE, MAX_NATIVE_TEXT_PAYLOAD_BYTES,
};
use crate::render_graph::{
    DrawCommandKind, DrawCommandParams, FontWeightDrawParam, RenderGraph, RenderPlane, TextAlign,
};
use crate::resources::ResourceId;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn builds_dialogue_panel_and_text_commands() {
    let layout = test_layout();
    let dialogue = DialogueProjection {
        speaker: Some("Yuki".into()),
        speaker_style: RichTextStyle {
            color: Some("#7cc7ff".to_string()),
            font_family: Some(FontFamilyProjection::new([
                "Qua Serif",
                "  ",
                "Fallback Sans",
            ])),
            font_size: Some(36.0),
            font_weight: Some(FontWeightProjection::keyword("bold")),
            text_align: Some("center".to_string()),
            ..Default::default()
        },
        provenance: provenance("base", []),
        ..DialogueProjection::say("Hello native renderer.")
    };

    let commands = build_dialogue_commands(&layout, &dialogue);

    assert_eq!(commands.len(), 12);
    let panel = commands
        .iter()
        .find(|command| command.id == "dialogue:panel")
        .unwrap();
    assert_eq!(panel.kind, DrawCommandKind::RoundedRect);
    assert_eq!(panel.plane, RenderPlane::Safe);
    assert_eq!(panel.owner_package_id.as_deref(), Some("base"));
    match &panel.params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(panel.bounds.height, layout.logical_height * 0.1225);
            assert_eq!(params.fill_color, "rgba(7,8,12,0.90)");
            assert_eq!(params.border.width, 1.0);
            assert_eq!(
                params.border.color.as_deref(),
                Some("rgba(245,226,190,0.28)")
            );
        }
        _ => panic!("expected dialogue panel params"),
    }

    let speaker = commands
        .iter()
        .find(|command| command.id == "dialogue:speaker")
        .unwrap();
    match &speaker.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Yuki");
            assert_eq!(params.color, "#7cc7ff");
            assert_eq!(params.font_family, vec!["Qua Serif", "Fallback Sans"]);
            assert_eq!(params.font_size, 36.0);
            assert_eq!(
                params.font_weight.as_ref(),
                Some(&FontWeightDrawParam::Keyword("bold".to_string()))
            );
            assert_eq!(params.align, TextAlign::Center);
        }
        _ => panic!("expected speaker text params"),
    }
    assert_eq!(
        speaker.resource_ids,
        vec![
            ResourceId::from("fonts:Qua Serif"),
            ResourceId::from("fonts:Fallback Sans")
        ]
    );

    let text = commands
        .iter()
        .find(|command| command.id == "dialogue:text")
        .unwrap();
    match &text.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Hello native renderer.");
            assert_eq!(params.color, "#fffaf2");
            assert!(params.font_family.is_empty());
            assert!(params.font_weight.is_none());
            assert_eq!(params.role, "dialogue-text");
        }
        _ => panic!("expected dialogue text params"),
    }
    assert!(text.resource_ids.is_empty());
}

#[test]
fn skips_unsafe_package_provenance_on_direct_projection() {
    let layout = test_layout();
    let dialogue = DialogueProjection {
        provenance: provenance("runtime/dialogue", ["base", "runtime.ui", "bad?rev=1"]),
        ..DialogueProjection::say("Hello native renderer.")
    };

    let commands = build_dialogue_commands(&layout, &dialogue);

    for command in &commands {
        assert_eq!(command.owner_package_id, None);
        assert!(command.required_package_ids.contains("base"));
        assert!(command.required_package_ids.contains("runtime.ui"));
        assert!(!command.required_package_ids.contains("bad?rev=1"));
        assert!(!command.required_package_ids.contains("runtime/dialogue"));
    }
}

#[test]
fn skips_invisible_dialogue() {
    let layout = test_layout();
    let dialogue = DialogueProjection {
        visible: false,
        ..DialogueProjection::say("Hidden")
    };

    assert!(build_dialogue_commands(&layout, &dialogue).is_empty());
}

#[test]
fn skips_dialogue_with_unsafe_main_text_payload() {
    let layout = test_layout();
    let dialogue = DialogueProjection::say("Open\u{1b}Menu");

    assert!(build_dialogue_commands(&layout, &dialogue).is_empty());
}

#[test]
fn skips_dialogue_with_oversized_rich_text_aggregate() {
    let layout = test_layout();
    let dialogue = DialogueProjection {
        text: RichTextContent::Document(RichTextDocumentProjection {
            blocks: vec![
                RichTextBlockProjection {
                    spans: vec![RichTextSpanProjection {
                        text: "a".repeat(MAX_NATIVE_TEXT_PAYLOAD_BYTES),
                        style: RichTextStyle::default(),
                    }],
                },
                RichTextBlockProjection {
                    spans: vec![RichTextSpanProjection {
                        text: "b".to_string(),
                        style: RichTextStyle::default(),
                    }],
                },
            ],
            style: RichTextStyle::default(),
        }),
        ..DialogueProjection::say("")
    };

    assert!(build_dialogue_commands(&layout, &dialogue).is_empty());
}

#[test]
fn skips_unsafe_speaker_but_keeps_safe_dialogue_text() {
    let layout = test_layout();
    let dialogue = DialogueProjection {
        speaker: Some("Speaker\u{1b}".into()),
        ..DialogueProjection::say("Safe dialogue")
    };

    let commands = build_dialogue_commands(&layout, &dialogue);

    assert_eq!(commands.len(), 9);
    assert!(commands
        .iter()
        .all(|command| command.id != "dialogue:speaker"));
    let text = commands
        .iter()
        .find(|command| command.id == "dialogue:text")
        .unwrap();
    match &text.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Safe dialogue");
        }
        _ => panic!("expected dialogue text params"),
    }
}

#[test]
fn falls_back_to_character_name_like_web_dialogue_projection() {
    let layout = test_layout();
    let dialogue = DialogueProjection {
        character_name: Some("Lin".to_string()),
        ..DialogueProjection::say("Signal confirmed.")
    };

    let commands = build_dialogue_commands(&layout, &dialogue);
    let speaker = commands
        .iter()
        .find(|command| command.id == "dialogue:speaker")
        .unwrap();

    match &speaker.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Lin");
            assert_eq!(params.color, "#ffe3a0");
        }
        _ => panic!("expected speaker text params"),
    }
    assert!(commands
        .iter()
        .any(|command| command.id == "dialogue:speaker-accent"));
}

#[test]
fn keeps_allowed_multiline_dialogue_text() {
    let layout = test_layout();
    let dialogue = DialogueProjection::say("Line one\nLine two\tTabbed\rReturn");

    let commands = build_dialogue_commands(&layout, &dialogue);

    let text = commands
        .iter()
        .find(|command| command.id == "dialogue:text")
        .unwrap();
    match &text.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Line one\nLine two\tTabbed\rReturn");
        }
        _ => panic!("expected dialogue text params"),
    }
}

#[test]
fn preserves_rich_text_inline_runs_and_builds_avatar_command() {
    let layout = test_layout();
    let dialogue = DialogueProjection {
        avatar: Some(DialogueAvatarProjection {
            asset_type: "characters".to_string(),
            asset_name: "yuki/avatar.png".to_string(),
            provenance: provenance("runtime.avatar", ["base"]),
        }),
        text: RichTextContent::Document(RichTextDocumentProjection {
            style: RichTextStyle {
                color: Some("#d8c6ff".to_string()),
                line_height: Some(48.0),
                text_align: Some("right".to_string()),
                ..Default::default()
            },
            blocks: vec![
                RichTextBlockProjection {
                    spans: vec![
                        RichTextSpanProjection {
                            text: "Line ".to_string(),
                            style: RichTextStyle::default(),
                        },
                        RichTextSpanProjection {
                            text: "one".to_string(),
                            style: RichTextStyle::default(),
                        },
                    ],
                },
                RichTextBlockProjection {
                    spans: vec![RichTextSpanProjection {
                        text: "Line two".to_string(),
                        style: RichTextStyle::default(),
                    }],
                },
            ],
        }),
        ..DialogueProjection::say("")
    };

    let commands = build_dialogue_commands(&layout, &dialogue);
    let avatar = commands
        .iter()
        .find(|command| command.id == "dialogue:avatar")
        .unwrap();
    let text = commands
        .iter()
        .find(|command| command.id == "dialogue:text")
        .unwrap();

    assert_eq!(
        avatar.resource_ids[0].as_str(),
        "characters:yuki/avatar.png"
    );
    assert_eq!(avatar.owner_package_id.as_deref(), Some("runtime.avatar"));
    assert!(avatar.required_package_ids.contains("base"));

    match &text.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Line one\nLine two");
            let inline = params.inline.as_ref().unwrap();
            assert_eq!(inline.blocks.len(), 2);
            assert_eq!(inline.blocks[0][1].text, "one");
            assert_eq!(inline.blocks[1][0].text, "Line two");
            assert_eq!(params.color, "#d8c6ff");
            assert_eq!(params.line_height, 48.0);
            assert_eq!(params.align, TextAlign::Right);
        }
        _ => panic!("expected text params"),
    }
    assert_eq!(commands.iter().filter(|c| c.id.starts_with("dialogue:text")).count(), 2);

}

#[test]
fn falls_back_from_unsafe_dialogue_style_on_direct_projection() {
    let layout = test_layout();
    let dialogue = DialogueProjection {
        speaker: Some("Yuki".into()),
        speaker_style: RichTextStyle {
            color: Some("url(native.dll)".to_string()),
            font_family: Some(FontFamilyProjection::new([
                "Qua Serif",
                "../Escape Serif",
                "NativePayload.dll",
                "NativePayload.class",
                "fonts:Injected",
            ])),
            font_size: Some(MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE + 1.0),
            line_height: Some(f64::NAN),
            ..Default::default()
        },
        text: RichTextContent::Document(RichTextDocumentProjection {
            style: RichTextStyle {
                color: Some("file:///theme/dialogue".to_string()),
                font_family: Some(FontFamilyProjection::new([
                    "https://example.test/font.woff",
                    "Dialogue Sans",
                ])),
                font_size: Some(0.0),
                line_height: Some(MAX_NATIVE_RICH_TEXT_LOGICAL_VALUE + 1.0),
                ..Default::default()
            },
            blocks: vec![RichTextBlockProjection {
                spans: vec![RichTextSpanProjection {
                    text: "Safe text".to_string(),
                    style: RichTextStyle::default(),
                }],
            }],
        }),
        ..DialogueProjection::say("")
    };

    let commands = build_dialogue_commands(&layout, &dialogue);

    assert_eq!(commands.len(), 12);

    let speaker = commands
        .iter()
        .find(|command| command.id == "dialogue:speaker")
        .unwrap();
    match &speaker.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.color, "#ffe3a0");
            assert_eq!(params.font_family, vec!["Qua Serif"]);
            assert_eq!(params.font_size, 18.0);
            assert_eq!(params.line_height, 20.0);
        }
        _ => panic!("expected speaker text params"),
    }
    assert_eq!(
        speaker
            .resource_ids
            .iter()
            .map(|resource| resource.as_str())
            .collect::<Vec<_>>(),
        vec!["fonts:Qua Serif"]
    );

    let text = commands
        .iter()
        .find(|command| command.id == "dialogue:text")
        .unwrap();
    match &text.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Safe text");
            assert_eq!(params.color, "#fffaf2");
            assert_eq!(params.font_family, vec!["Dialogue Sans"]);
            assert_eq!(params.font_size, 20.0);
            assert_eq!(params.line_height, 36.0);
        }
        _ => panic!("expected dialogue text params"),
    }
    assert_eq!(
        text.resource_ids
            .iter()
            .map(|resource| resource.as_str())
            .collect::<Vec<_>>(),
        vec!["fonts:Dialogue Sans"]
    );
}

#[test]
fn skips_empty_avatar_asset_on_direct_projection() {
    let layout = test_layout();
    let dialogue = DialogueProjection {
        avatar: Some(DialogueAvatarProjection {
            asset_type: "characters".to_string(),
            asset_name: "  ".to_string(),
            provenance: provenance("runtime.avatar", ["base"]),
        }),
        ..DialogueProjection::say("No avatar asset")
    };

    let commands = build_dialogue_commands(&layout, &dialogue);

    assert_eq!(commands.len(), 9);
}

#[test]
fn skips_unsafe_avatar_asset_names_on_direct_projection() {
    let layout = test_layout();

    for asset_name in [
        "../avatars/yuki.png",
        "/avatars/yuki.png",
        "https://example.test/yuki.png",
        "avatars\\yuki.png",
        "avatars/native.dylib?rev=1",
        "avatars/native.class?rev=1",
    ] {
        let dialogue = DialogueProjection {
            avatar: Some(DialogueAvatarProjection {
                asset_type: "characters".to_string(),
                asset_name: asset_name.to_string(),
                provenance: provenance("runtime.avatar", ["base"]),
            }),
            ..DialogueProjection::say("No avatar asset")
        };

        let commands = build_dialogue_commands(&layout, &dialogue);

        assert_eq!(commands.len(), 9);
        assert!(
            commands
                .iter()
                .all(|command| command.id != "dialogue:avatar"),
            "unsafe avatar asset should not create a command: {asset_name}"
        );
    }
}

#[test]
fn skips_unsafe_avatar_asset_type_on_direct_projection() {
    let layout = test_layout();
    let dialogue = DialogueProjection {
        avatar: Some(DialogueAvatarProjection {
            asset_type: "characters/native".to_string(),
            asset_name: "yuki/avatar.png".to_string(),
            provenance: provenance("runtime.avatar", ["base"]),
        }),
        ..DialogueProjection::say("No avatar asset")
    };

    let commands = build_dialogue_commands(&layout, &dialogue);

    assert_eq!(commands.len(), 9);
}

#[test]
fn appends_dialogue_commands_to_graph() {
    let mut graph = RenderGraph::new(test_layout());
    append_dialogue_commands(&mut graph, &DialogueProjection::say("Ready"));

    assert_eq!(
        graph.summary().by_plane[&RenderPlane::Safe].command_count,
        9
    );
}

#[test]
fn grows_dialogue_panel_for_long_text_like_web_min_height() {
    let layout = test_layout();
    let base = super::layout::dialogue_panel_bounds(&layout);
    let short = build_dialogue_commands(&layout, &DialogueProjection::say("短句。"));
    let short_panel = short
        .iter()
        .find(|command| command.id == "dialogue:panel")
        .unwrap();
    assert_eq!(short_panel.bounds.height, base.height);
    assert_eq!(short_panel.bounds.y, base.y);

    // Long CJK text must wrap several lines; the panel grows upward with the
    // bottom edge anchored instead of clipping the overflow text.
    let long_text = "这是一段用来验证对话框最小高度行为的长文本。".repeat(12);
    let long = build_dialogue_commands(&layout, &DialogueProjection::say(long_text));
    let long_panel = long
        .iter()
        .find(|command| command.id == "dialogue:panel")
        .unwrap();
    assert!(long_panel.bounds.height > base.height);
    let base_bottom = base.y + base.height;
    let long_bottom = long_panel.bounds.y + long_panel.bounds.height;
    assert!((long_bottom - base_bottom).abs() < f64::EPSILON);
}

fn test_layout() -> ResolvedStageLayout {
    resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(1600.0),
            height: Some(1000.0),
            ..Default::default()
        },
    )
}

fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required
            .into_iter()
            .map(ToString::to_string)
            .collect::<BTreeSet<_>>(),
    }
}

#[test]
fn reveal_keeps_full_text_layout_and_avatar_clear_of_text() {
    let layout = test_layout();
    let full = "长文本对话需要稳定的排版空间。".repeat(70);
    let mut dialogue = DialogueProjection::say(full.clone());
    dialogue.avatar = Some(DialogueAvatarProjection {
        asset_type: "images".into(),
        asset_name: "avatar.png".into(),
        provenance: PackageProvenance::default(),
    });
    let complete = build_dialogue_commands(&layout, &dialogue);
    dialogue.layout_text = Some(full.into());
    dialogue.text = "长".into();
    let revealing = build_dialogue_commands(&layout, &dialogue);
    let bounds = |commands: &[crate::render_graph::DrawCommand], id: &str| {
        commands
            .iter()
            .find(|command| command.id == id)
            .unwrap()
            .bounds
    };
    assert_eq!(
        bounds(&complete, "dialogue:panel"),
        bounds(&revealing, "dialogue:panel")
    );
    let text = bounds(&complete, "dialogue:text");
    let avatar = bounds(&complete, "dialogue:avatar");
    assert!(text.x + text.width <= avatar.x);
    let mut graph = RenderGraph::new(layout);
    graph.extend(complete);
    let choices = crate::projection::choices::ChoiceSetProjection {
        visible: true,
        choices: vec![crate::projection::choices::ChoiceProjection::new(
            "next", "Continue",
        )],
        provenance: PackageProvenance::default(),
    };
    crate::projection::choices::append_choice_commands_with_dialogue(&mut graph, &choices, true);
    let choice_panel = bounds(graph.commands(), "choices:panel");
    let dialogue_panel = bounds(graph.commands(), "dialogue:panel");
    assert!(choice_panel.y + choice_panel.height < dialogue_panel.y);
}

#[test]
fn rich_reveal_retains_full_runs_styles_fonts_and_provenance() {
    let full: RichTextContent = serde_json::from_value(serde_json::json!({
        "style": { "fontFamily": ["Body"] }, "blocks": [
            { "spans": [{ "text": "office", "style": { "fontFamily": ["Accent"], "fontSize": 32, "color": "#ff0000" } }] },
            { "spans": [{ "text": "next" }] }
        ]
    })).unwrap();
    let mut visible = full.clone();
    if let RichTextContent::Document(doc) = &mut visible {
        doc.blocks[0].spans[0].text = "of".into();
        doc.blocks[1].spans[0].text.clear();
    }
    let dialogue = DialogueProjection {
        text: visible,
        layout_text: Some(full),
        provenance: provenance("runtime.story", ["runtime.fonts"]),
        ..DialogueProjection::say("")
    };
    let commands = build_dialogue_commands(&test_layout(), &dialogue);
    let command = commands.iter().find(|c| c.id == "dialogue:text").unwrap();
    let DrawCommandParams::Text(text) = &command.params else {
        panic!()
    };
    let inline = text.inline.as_ref().unwrap();
    assert_eq!(inline.blocks[0][0].text, "office");
    assert_eq!(inline.blocks[0][0].visible_bytes, 2);
    assert_eq!(inline.blocks[0][0].font_size, 32.0);
    assert_eq!(inline.blocks[1][0].visible_bytes, 0);
    assert_eq!(inline.blocks[1][0].font_family, ["Body"]);
    assert!(command
        .resource_ids
        .iter()
        .any(|id| id.as_str().contains("Accent")));
    assert_eq!(command.owner_package_id.as_deref(), Some("runtime.story"));
    assert!(command.required_package_ids.contains("runtime.fonts"));
    let shadow = commands
        .iter()
        .find(|c| c.id == "dialogue:text:shadow")
        .unwrap();
    let DrawCommandParams::Text(shadow) = &shadow.params else {
        panic!()
    };
    let mut shadow_inline = shadow.inline.clone().unwrap();
    for (a, b) in shadow_inline
        .blocks
        .iter_mut()
        .flatten()
        .zip(inline.blocks.iter().flatten())
    {
        assert_eq!(a.color, "rgba(0,0,0,0.72)");
        a.color = b.color.clone();
    }
    assert_eq!(&shadow_inline, inline);
}
