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

    assert_eq!(commands.len(), 3);
    assert_eq!(commands[0].id, "dialogue:panel");
    assert_eq!(commands[0].kind, DrawCommandKind::RoundedRect);
    assert_eq!(commands[0].plane, RenderPlane::Safe);
    assert_eq!(commands[0].owner_package_id.as_deref(), Some("base"));

    match &commands[1].params {
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
        commands[1].resource_ids,
        vec![
            ResourceId::from("fonts:Qua Serif"),
            ResourceId::from("fonts:Fallback Sans")
        ]
    );

    match &commands[2].params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Hello native renderer.");
            assert_eq!(params.color, "#ffffff");
            assert!(params.font_family.is_empty());
            assert!(params.font_weight.is_none());
            assert_eq!(params.role, "dialogue-text");
        }
        _ => panic!("expected dialogue text params"),
    }
    assert!(commands[2].resource_ids.is_empty());
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

    assert_eq!(commands.len(), 2);
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
fn flattens_rich_text_and_builds_avatar_command() {
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
            assert_eq!(params.color, "#d8c6ff");
            assert_eq!(params.line_height, 48.0);
            assert_eq!(params.align, TextAlign::Right);
        }
        _ => panic!("expected text params"),
    }
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

    assert_eq!(commands.len(), 3);

    let speaker = commands
        .iter()
        .find(|command| command.id == "dialogue:speaker")
        .unwrap();
    match &speaker.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.color, "#ffffff");
            assert_eq!(params.font_family, vec!["Qua Serif"]);
            assert_eq!(params.font_size, 34.0);
            assert_eq!(params.line_height, 42.0);
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
            assert_eq!(params.color, "#ffffff");
            assert_eq!(params.font_family, vec!["Dialogue Sans"]);
            assert_eq!(params.font_size, 30.0);
            assert_eq!(params.line_height, 42.0);
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

    assert_eq!(commands.len(), 2);
    assert!(commands
        .iter()
        .all(|command| command.id != "dialogue:avatar"));
    assert!(commands
        .iter()
        .flat_map(|command| command.resource_ids.iter())
        .all(|resource| resource.as_str() != "characters:  "));
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

        assert_eq!(commands.len(), 2);
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

    assert_eq!(commands.len(), 2);
    assert!(commands
        .iter()
        .all(|command| command.id != "dialogue:avatar"));
    assert!(commands
        .iter()
        .flat_map(|command| command.resource_ids.iter())
        .all(|resource| resource.as_str() != "characters/native:yuki/avatar.png"));
}

#[test]
fn appends_dialogue_commands_to_graph() {
    let mut graph = RenderGraph::new(test_layout());
    append_dialogue_commands(&mut graph, &DialogueProjection::say("Ready"));

    assert_eq!(
        graph.summary().by_plane[&RenderPlane::Safe].command_count,
        2
    );
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
