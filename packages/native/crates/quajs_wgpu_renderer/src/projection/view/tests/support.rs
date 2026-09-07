use std::collections::BTreeSet;

use super::*;
use crate::projection::background::BackgroundProjection;
use crate::projection::character::{CharacterPosition, CharacterProjection};
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::PackageProvenance;
use crate::projection::dialogue::DialogueProjection;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

pub(super) fn full_view() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            provenance: provenance("base", []),
            ..Default::default()
        }),
        characters: vec![CharacterProjection {
            sprite: Some("yuki/default.png".to_string()),
            position: CharacterPosition {
                x_percent: Some(50.0),
                width: Some(420.0),
                height: Some(900.0),
                ..Default::default()
            },
            provenance: provenance("base", []),
            ..CharacterProjection::new("yuki", "Yuki")
        }],
        dialogue: Some(DialogueProjection {
            speaker: Some("Yuki".into()),
            provenance: provenance("runtime.dialogue", ["base"]),
            ..DialogueProjection::say("Native renderer frame.")
        }),
        choices: Some(ChoiceSetProjection {
            motion: Default::default(),
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

pub(super) fn test_layout() -> ResolvedStageLayout {
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

pub(super) fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required
            .into_iter()
            .map(ToString::to_string)
            .collect::<BTreeSet<_>>(),
    }
}
