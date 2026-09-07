use super::*;
use crate::projection::audio::{
    AudioProjection, AudioTrackKind, AudioTrackMemoryEstimate, AudioTrackProjection,
};
use crate::projection::background::{
    BackgroundMode, BackgroundProjection, BackgroundVideoProjection,
};
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::PackageProvenance;
use crate::projection::ui::{UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection};
use crate::projection::view::ViewProjection;
use crate::render_graph::{DrawBatchPipeline, RenderPlane};
use crate::renderer::NativeRendererState;
use crate::resources::{NativeResourceKind, NativeResourceRecord};
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

mod audio;
mod frame;
mod resources;

fn view_with_background_and_choice() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            ..Default::default()
        }),
        choices: Some(ChoiceSetProjection::new(vec![ChoiceProjection::new(
            "stay", "Stay",
        )])),
        ..Default::default()
    }
}

fn view_with_audio() -> ViewProjection {
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
        .with_provenance(PackageProvenance {
            content_package_id: Some("runtime.audio".to_string()),
            required_runtime_packages: Default::default(),
        })])),
        ..Default::default()
    }
}

fn view_with_video_fallback() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            mode: BackgroundMode::Video,
            video: Some(BackgroundVideoProjection {
                poster: Some("poster/opening.png".to_string()),
                provenance: PackageProvenance {
                    content_package_id: Some("runtime.video".to_string()),
                    required_runtime_packages: ["base"]
                        .into_iter()
                        .map(ToString::to_string)
                        .collect(),
                },
                ..BackgroundVideoProjection::new("opening.mp4")
            }),
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn package_aware_view() -> ViewProjection {
    let mut required_base = std::collections::BTreeSet::new();
    required_base.insert("base".to_string());

    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            provenance: PackageProvenance {
                content_package_id: Some("base".to_string()),
                required_runtime_packages: Default::default(),
            },
            ..Default::default()
        }),
        choices: Some(ChoiceSetProjection {
            motion: Default::default(),
            visible: true,
            provenance: PackageProvenance {
                content_package_id: None,
                required_runtime_packages: required_base.clone(),
            },
            choices: vec![ChoiceProjection {
                motion: Default::default(),
                id: "stay".to_string(),
                text: "Stay".to_string(),
                enabled: true,
                provenance: PackageProvenance {
                    content_package_id: Some("runtime.choice".to_string()),
                    required_runtime_packages: required_base.clone(),
                },
            }],
        }),
        ui: Some(UiProjection {
            provenance: PackageProvenance {
                content_package_id: Some("runtime.ui".to_string()),
                required_runtime_packages: required_base,
            },
            overlays: vec![UiOverlayProjection {
                surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui")),
                provenance: PackageProvenance {
                    content_package_id: None,
                    required_runtime_packages: Default::default(),
                },
                ..UiOverlayProjection::new("menu")
            }],
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn test_layout() -> crate::stage_layout::ResolvedStageLayout {
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
