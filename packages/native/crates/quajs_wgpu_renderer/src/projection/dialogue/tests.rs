use std::collections::BTreeSet;

use super::*;
use crate::projection::common::{FontFamilyProjection, FontWeightProjection, PackageProvenance};
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
fn skips_invisible_dialogue() {
    let layout = test_layout();
    let dialogue = DialogueProjection {
        visible: false,
        ..DialogueProjection::say("Hidden")
    };

    assert!(build_dialogue_commands(&layout, &dialogue).is_empty());
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
