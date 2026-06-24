use std::collections::BTreeSet;

use super::*;
use crate::projection::audio::{
    AudioProjection, AudioTrackKind, AudioTrackMemoryEstimate, AudioTrackProjection,
};
use crate::projection::background::BackgroundProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::PackageProvenance;
use crate::projection::ui::{
    UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection, UiSurfaceNodeKind,
    UiSurfaceNodeProjection, UiSurfaceNodeRect,
};
use crate::projection::view::ViewProjection;
use crate::renderer::{
    NativeRenderBackend, NativeRenderBackendResult, NativeRenderFrameRef, NativeRenderSubmission,
};
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

mod frame;
mod resources;
mod submission;

#[derive(Default)]
struct RecordingBackend {
    submissions: Vec<NativeRenderSubmission>,
}

impl NativeRenderBackend for RecordingBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
        let submission = frame.submission();
        self.submissions.push(submission.clone());
        Ok(submission)
    }
}

fn view_with_background_and_choice() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            provenance: provenance("base", []),
            ..Default::default()
        }),
        choices: Some(ChoiceSetProjection {
            visible: true,
            provenance: provenance("runtime.choices", ["base"]),
            choices: vec![ChoiceProjection {
                provenance: provenance("runtime.choices", ["base"]),
                ..ChoiceProjection::new("stay", "Stay")
            }],
        }),
        ..Default::default()
    }
}

fn view_with_runtime_choice_only() -> ViewProjection {
    ViewProjection {
        choices: Some(ChoiceSetProjection {
            visible: true,
            provenance: provenance("runtime.choices", ["base"]),
            choices: vec![ChoiceProjection {
                provenance: provenance("runtime.choices", ["base"]),
                ..ChoiceProjection::new("stay", "Stay")
            }],
        }),
        ..Default::default()
    }
}

pub(super) fn view_with_audio() -> ViewProjection {
    ViewProjection {
        audio: Some(AudioProjection::new(vec![AudioTrackProjection::new(
            "bgm-main",
            AudioTrackKind::Bgm,
            "music/opening.ogg",
        )
        .memory(AudioTrackMemoryEstimate {
            buffer_cpu_bytes: 2048,
            stream_cpu_bytes: 0,
            handle_cpu_bytes: 64,
        })
        .with_provenance(provenance("runtime.audio", []))])),
        ..Default::default()
    }
}

pub(super) fn view_with_ui_surface() -> ViewProjection {
    ViewProjection {
        ui: Some(UiProjection {
            provenance: provenance("runtime.ui", ["base"]),
            overlays: vec![UiOverlayProjection {
                surface: Some(
                    UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                        UiSurfaceNodeProjection::new(
                            "title",
                            UiSurfaceNodeKind::Text,
                            UiSurfaceNodeRect {
                                x: 40.0,
                                y: 48.0,
                                width: 240.0,
                                height: 44.0,
                            },
                        )
                        .with_text("Menu"),
                    ),
                ),
                ..UiOverlayProjection::new("menu")
            }],
            ..Default::default()
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
