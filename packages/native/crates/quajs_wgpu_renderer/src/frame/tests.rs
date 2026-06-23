use std::collections::BTreeSet;

use super::*;
use crate::projection::background::{BackgroundProjection, BackgroundVideoProjection};
use crate::projection::character::CharacterProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::PackageProvenance;
use crate::projection::view::ViewProjection;
use crate::render_graph::{DrawCommandKind, RenderPlane};
use crate::resources::{NativeResourceKind, ResourceId};
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn prepares_graph_summary_and_resource_plan_for_view() {
    let frame = prepare_native_frame(test_layout(), &view_with_background_character_and_choices());

    assert_eq!(frame.summary.command_count, 5);
    assert_eq!(frame.summary.interactive_count, 1);
    assert_eq!(frame.summary.by_plane[&RenderPlane::Scene].command_count, 1);
    assert_eq!(
        frame.summary.by_plane[&RenderPlane::Subject].command_count,
        1
    );
    assert_eq!(frame.summary.by_plane[&RenderPlane::Safe].command_count, 3);
    assert_eq!(frame.resources.requests.len(), 2);
    assert_eq!(frame.resources.by_kind[&NativeResourceKind::Texture], 2);
    assert!(frame
        .resources
        .request(ResourceId::from("images:bg/school.png"))
        .is_some());
}

#[test]
fn resolves_hit_intent_from_prepared_frame() {
    let frame = prepare_native_frame(test_layout(), &view_with_background_character_and_choices());
    let command = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "choice:stay")
        .unwrap();

    let hit = frame
        .hit_intent(
            command.bounds.x + command.bounds.width / 2.0,
            command.bounds.y + command.bounds.height / 2.0,
        )
        .unwrap();

    assert_eq!(hit.command_id, "choice:stay");
    assert_eq!(hit.intent.event, "choice/select");
    assert_eq!(hit.intent.choice_id.as_deref(), Some("stay"));
}

#[test]
fn keeps_video_resource_requests_visible_to_frame_consumer() {
    let frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
            background: Some(BackgroundProjection {
                mode: crate::projection::background::BackgroundMode::Video,
                video: Some(BackgroundVideoProjection {
                    poster: Some("poster/opening.png".to_string()),
                    provenance: provenance("runtime.video", ["base"]),
                    ..BackgroundVideoProjection::new("opening.mp4")
                }),
                ..Default::default()
            }),
            ..Default::default()
        },
    );

    assert_eq!(frame.summary.command_count, 1);
    assert_eq!(frame.graph.commands()[0].kind, DrawCommandKind::VideoFrame);
    assert_eq!(
        frame.resources.request("video:opening.mp4").unwrap().kind,
        NativeResourceKind::VideoDecoder
    );
    assert_eq!(
        frame
            .resources
            .request("images:poster/opening.png")
            .unwrap()
            .kind,
        NativeResourceKind::Texture
    );
}

fn view_with_background_character_and_choices() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            provenance: provenance("base", []),
            ..Default::default()
        }),
        characters: vec![CharacterProjection {
            sprite: Some("yuki/default.png".to_string()),
            provenance: provenance("runtime.sprite", ["base"]),
            ..CharacterProjection::new("yuki", "Yuki")
        }],
        choices: Some(ChoiceSetProjection {
            visible: true,
            provenance: provenance("runtime.choices", ["base"]),
            choices: vec![
                ChoiceProjection {
                    provenance: provenance("runtime.choices", ["base"]),
                    ..ChoiceProjection::new("stay", "Stay")
                },
                ChoiceProjection {
                    enabled: false,
                    provenance: provenance("runtime.choices", ["base"]),
                    ..ChoiceProjection::new("leave", "Leave")
                },
            ],
        }),
        ..Default::default()
    }
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
