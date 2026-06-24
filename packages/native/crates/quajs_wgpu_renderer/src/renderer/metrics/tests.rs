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

#[test]
fn reports_empty_renderer_metrics() {
    let resources = NativeResourceLedger::new();
    let metrics = NativeRendererMetrics::from_state(0, None, &resources);

    assert_eq!(metrics.revision, 0);
    assert!(!metrics.has_frame);
    assert_eq!(metrics.frame.command_count, 0);
    assert_eq!(metrics.resources.ledger_resource_count, 0);
    assert_eq!(metrics.resources.declarative_resource_count, 0);
    assert_eq!(metrics.resources.memory.total_bytes(), 0);
    assert_eq!(metrics.resources.declarative_memory.total_bytes(), 0);
    assert_eq!(metrics.resources.audio.resource_count, 0);
    assert_eq!(metrics.resources.audio.memory.total_bytes(), 0);
    assert_eq!(metrics.audio_backend.active_track_count, 0);
    assert!(metrics
        .audio_backend
        .active_track_count_by_package
        .is_empty());
    assert_eq!(metrics.resources.pressure.total_count, 0);
    assert_eq!(metrics.resources.pressure.total_memory.total_bytes(), 0);
}

#[test]
fn reports_frame_metrics_from_prepared_frame() {
    let frame =
        crate::frame::prepare_native_frame(test_layout(), &view_with_background_and_choice());
    let resources = NativeResourceLedger::new();

    let metrics = NativeRendererMetrics::from_state(3, Some(&frame), &resources);

    assert_eq!(metrics.revision, 3);
    assert!(metrics.has_frame);
    assert_eq!(metrics.frame.command_count, 3);
    assert_eq!(metrics.frame.interactive_count, 1);
    assert_eq!(metrics.frame.pass_count, 2);
    assert_eq!(metrics.frame.batch_count, 3);
    assert_eq!(metrics.frame.resource_request_count, 1);
    assert_eq!(metrics.frame.resource_ref_count, 1);
    assert_eq!(metrics.frame.asset_request_count, 1);
    assert_eq!(metrics.frame.declarative_asset_request_count, 0);
    assert_eq!(metrics.frame.skipped_asset_resource_count, 0);
    assert_eq!(metrics.frame.fallback_count, 0);
    assert_eq!(metrics.frame.video_fallback_count, 0);
    assert!(metrics.frame.fallbacks_by_pipeline.is_empty());
    assert!(metrics.frame.fallbacks_by_reason.is_empty());
    assert_eq!(metrics.frame.by_plane[&RenderPlane::Scene].command_count, 1);
    assert_eq!(
        metrics.frame.by_plane[&RenderPlane::Scene].resource_ref_count,
        1
    );
    assert_eq!(metrics.frame.by_plane[&RenderPlane::Safe].command_count, 2);
    assert_eq!(
        metrics.frame.by_plane[&RenderPlane::Safe].interactive_count,
        1
    );
}

#[test]
fn reports_video_fallback_metrics_from_prepared_frame() {
    let frame = crate::frame::prepare_native_frame(test_layout(), &view_with_video_fallback());
    let resources = NativeResourceLedger::new();

    let metrics = NativeRendererMetrics::from_state(6, Some(&frame), &resources);

    assert_eq!(metrics.frame.command_count, 1);
    assert_eq!(metrics.frame.fallback_count, 1);
    assert_eq!(metrics.frame.video_fallback_count, 1);
    assert_eq!(
        metrics.frame.fallbacks_by_pipeline[&DrawBatchPipeline::Video],
        1
    );
    assert_eq!(
        metrics.frame.fallbacks_by_reason["native video decode backend is not active"],
        1
    );
}

#[test]
fn reports_frame_metrics_by_package_and_resource_kind() {
    let frame = crate::frame::prepare_native_frame(test_layout(), &package_aware_view());
    let resources = NativeResourceLedger::new();

    let metrics = NativeRendererMetrics::from_state(4, Some(&frame), &resources);

    assert_eq!(metrics.resources.package_count, 0);
    assert_eq!(metrics.frame.by_package["base"].command_count, 4);
    assert_eq!(metrics.frame.by_package["base"].resource_ref_count, 2);
    assert_eq!(metrics.frame.by_package["base"].interactive_count, 2);
    assert_eq!(metrics.frame.by_package["runtime.ui"].command_count, 1);
    assert_eq!(metrics.frame.by_package["runtime.ui"].resource_ref_count, 1);
    assert_eq!(metrics.frame.by_package["runtime.ui"].interactive_count, 1);
    assert_eq!(metrics.frame.by_package["runtime.choice"].command_count, 1);
    assert_eq!(
        metrics.frame.by_package["runtime.choice"].resource_ref_count,
        0
    );
    assert_eq!(
        metrics.frame.by_package["runtime.choice"].interactive_count,
        1
    );
    assert_eq!(
        metrics.frame.by_resource_kind[&NativeResourceKind::Texture],
        1
    );
    assert_eq!(
        metrics.frame.by_resource_kind[&NativeResourceKind::UiAst],
        1
    );
    assert_eq!(metrics.frame.declarative_asset_request_count, 1);
    assert_eq!(
        metrics.frame.asset_requests_by_type["images"].request_count,
        1
    );
    assert_eq!(
        metrics.frame.asset_requests_by_type["images"].command_ref_count,
        1
    );
    assert_eq!(
        metrics.frame.asset_requests_by_type["surface"].request_count,
        1
    );
    assert_eq!(
        metrics.frame.asset_requests_by_type["surface"].command_ref_count,
        1
    );
    assert_eq!(
        metrics.frame.asset_requests_by_package["base"].request_count,
        2
    );
    assert_eq!(
        metrics.frame.asset_requests_by_package["base"].command_ref_count,
        2
    );
    assert_eq!(
        metrics.frame.asset_requests_by_package["runtime.ui"].request_count,
        1
    );
    assert_eq!(
        metrics.frame.asset_requests_by_package["runtime.ui"].command_ref_count,
        1
    );
    assert!(!metrics
        .frame
        .asset_requests_by_package
        .contains_key("runtime.choice"));
}

#[test]
fn reports_declarative_asset_request_count_for_ui_style_and_tokens() {
    let mut graph = crate::render_graph::RenderGraph::new(test_layout());
    graph.extend([crate::render_graph::DrawCommand::new(
        "ui:surface",
        RenderPlane::Screen,
        crate::render_graph::DrawCommandKind::UiSurface,
        crate::render_graph::LogicalRect {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 100.0,
        },
    )
    .resource("surface:ui/menu.qui")
    .resource("qss:themes/default.qss.json")
    .resource("tokens:themes/default.tokens.json")]);
    let resources = crate::resources::plan_render_graph_resources(&graph);
    let assets = crate::resources::plan_asset_requests(&resources);
    let frame = crate::frame::PreparedNativeFrame {
        summary: graph.summary(),
        resources,
        assets,
        passes: crate::render_graph::plan_render_passes(&graph),
        graph,
    };
    let metrics = NativeRendererMetrics::from_state(5, Some(&frame), &NativeResourceLedger::new());

    assert_eq!(metrics.frame.asset_request_count, 3);
    assert_eq!(metrics.frame.declarative_asset_request_count, 3);
    assert_eq!(
        metrics.frame.asset_requests_by_type["surface"].request_count,
        1
    );
    assert_eq!(metrics.frame.asset_requests_by_type["qss"].request_count, 1);
    assert_eq!(
        metrics.frame.asset_requests_by_type["tokens"].request_count,
        1
    );
}

#[test]
fn reports_resource_memory_and_package_counts() {
    let mut resources = NativeResourceLedger::new();
    resources.insert(
        NativeResourceRecord::new("images:bg.png", NativeResourceKind::Texture)
            .owned_by("base")
            .memory(128, 4096),
    );
    resources.insert(
        NativeResourceRecord::new("ui:surface", NativeResourceKind::UiAst)
            .owned_by("runtime.ui")
            .require_package("base")
            .memory(2048, 0),
    );

    let metrics = NativeRendererMetrics::from_state(2, None, &resources);

    assert_eq!(metrics.resources.ledger_resource_count, 2);
    assert_eq!(metrics.resources.declarative_resource_count, 1);
    assert_eq!(metrics.resources.package_count, 2);
    assert_eq!(metrics.resources.kind_count, 2);
    assert_eq!(metrics.resources.memory.cpu_bytes, 2176);
    assert_eq!(metrics.resources.memory.gpu_bytes, 4096);
    assert_eq!(metrics.resources.declarative_memory.cpu_bytes, 2048);
    assert_eq!(metrics.resources.declarative_memory.gpu_bytes, 0);
    assert_eq!(metrics.resources.pressure.total_count, 2);
    assert_eq!(
        metrics.resources.pressure.largest_kind,
        Some(NativeResourceKind::Texture)
    );
    assert_eq!(
        metrics.resources.pressure.largest_owner_package_id,
        Some("base".to_string())
    );
    assert_eq!(
        metrics.resources.pressure.largest_dependent_package_id,
        Some("base".to_string())
    );
    assert_eq!(
        metrics.resources.by_kind[&NativeResourceKind::Texture].count,
        1
    );
    assert_eq!(
        metrics.resources.by_kind[&NativeResourceKind::Texture]
            .memory
            .gpu_bytes,
        4096
    );
    assert_eq!(
        metrics.resources.by_kind[&NativeResourceKind::UiAst]
            .memory
            .cpu_bytes,
        2048
    );
    assert_eq!(metrics.resources.by_package["base"].owned_count, 1);
    assert_eq!(metrics.resources.by_package["base"].dependent_count, 1);
    assert_eq!(
        metrics.resources.by_package["base"].owned_memory.gpu_bytes,
        4096
    );
    assert_eq!(
        metrics.resources.by_package["base"]
            .dependent_memory
            .cpu_bytes,
        2048
    );
    assert_eq!(metrics.resources.by_package["runtime.ui"].owned_count, 1);
    assert_eq!(
        metrics.resources.by_package["runtime.ui"]
            .owned_memory
            .cpu_bytes,
        2048
    );
    assert_eq!(metrics.resources.audio.resource_count, 0);
    assert_eq!(metrics.resources.audio.package_count, 0);
}

#[test]
fn reports_audio_resource_metrics_separately_from_total_ledger() {
    let mut resources = NativeResourceLedger::new();
    resources.insert(
        NativeResourceRecord::new(
            "audio:buffer:bgm:bgm:music/opening.ogg",
            NativeResourceKind::AudioBuffer,
        )
        .owned_by("runtime.audio")
        .require_package("base")
        .memory(4096, 0),
    );
    resources.insert(
        NativeResourceRecord::new(
            "audio:stream:ambient:ambient:rain.opus",
            NativeResourceKind::AudioStream,
        )
        .owned_by("runtime.ambience")
        .memory(512, 0),
    );
    resources.insert(
        NativeResourceRecord::new(
            "audio:handle:bgm:bgm:bgm-main",
            NativeResourceKind::AudioHandle,
        )
        .owned_by("runtime.audio")
        .memory(64, 0),
    );
    resources.insert(
        NativeResourceRecord::new("images:bg/school.png", NativeResourceKind::Texture)
            .owned_by("base")
            .memory(128, 4096),
    );

    let metrics = NativeRendererMetrics::from_state(5, None, &resources);

    assert_eq!(metrics.resources.ledger_resource_count, 4);
    assert_eq!(metrics.resources.memory.cpu_bytes, 4800);
    assert_eq!(metrics.resources.memory.gpu_bytes, 4096);
    assert_eq!(metrics.resources.audio.resource_count, 3);
    assert_eq!(metrics.resources.audio.buffer_count, 1);
    assert_eq!(metrics.resources.audio.stream_count, 1);
    assert_eq!(metrics.resources.audio.handle_count, 1);
    assert_eq!(metrics.resources.audio.memory.cpu_bytes, 4672);
    assert_eq!(metrics.resources.audio.memory.gpu_bytes, 0);
    assert_eq!(metrics.resources.audio.package_count, 3);
    assert_eq!(
        metrics.resources.audio.by_package["runtime.audio"].owned_count,
        2
    );
    assert_eq!(
        metrics.resources.audio.by_package["runtime.audio"]
            .owned_memory
            .cpu_bytes,
        4160
    );
    assert_eq!(
        metrics.resources.audio.by_package["runtime.ambience"].owned_count,
        1
    );
    assert_eq!(
        metrics.resources.audio.by_package["base"].dependent_count,
        1
    );
    assert_eq!(
        metrics.resources.audio.by_package["base"]
            .dependent_memory
            .cpu_bytes,
        4096
    );
}

#[test]
fn reports_audio_backend_track_metrics_from_renderer_state() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_audio());

    let metrics = state.metrics();

    assert_eq!(metrics.audio_backend.active_track_count, 1);
    assert_eq!(
        metrics.audio_backend.active_track_count_by_package["runtime.audio"],
        1
    );
    assert_eq!(metrics.resources.audio.resource_count, 2);
    assert_eq!(metrics.resources.audio.buffer_count, 1);
    assert_eq!(metrics.resources.audio.handle_count, 1);
}

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
                    required_runtime_packages: Default::default(),
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
            visible: true,
            provenance: PackageProvenance {
                content_package_id: None,
                required_runtime_packages: required_base.clone(),
            },
            choices: vec![ChoiceProjection {
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
