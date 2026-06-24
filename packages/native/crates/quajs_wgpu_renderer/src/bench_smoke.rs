use std::collections::BTreeSet;
use std::time::Instant;

use crate::projection::audio::{
    AudioProjection, AudioTrackKind, AudioTrackMemoryEstimate, AudioTrackProjection,
};
use crate::projection::background::BackgroundProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::PackageProvenance;
use crate::projection::dialogue::DialogueProjection;
use crate::projection::ui::{
    UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection, UiSurfaceNodeKind,
    UiSurfaceNodeProjection, UiSurfaceNodeRect,
};
use crate::projection::view::{build_view_render_graph, ViewProjection};
use crate::renderer::NativeRendererState;
use crate::resources::{
    NativeResourceKind, NativeResourceLedger, NativeResourceRecord, PackageUnloadBlockerReason,
};
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

const RENDER_GRAPH_ITERATIONS: usize = 64;
const MEMORY_LEDGER_RESOURCE_COUNT: usize = 1_000;
const AUDIO_METRICS_ITERATIONS: usize = 96;
const AUDIO_METRICS_TRACK_COUNT: usize = 48;
const PACKAGE_RELEASE_ITERATIONS: usize = 64;
const PACKAGE_RELEASE_RESOURCE_COUNT: usize = 1_200;

#[test]
fn bench_smoke_builds_heavy_ui_render_graph_under_stable_threshold() {
    let layout = bench_layout();
    let view = heavy_ui_view(320);
    let start = Instant::now();
    let mut command_count = 0;

    for _ in 0..RENDER_GRAPH_ITERATIONS {
        let graph = build_view_render_graph(layout.clone(), &view);
        command_count = graph.summary().command_count;
    }

    let elapsed = start.elapsed();
    println!(
        "{{\"bench\":\"native.render_graph.heavy_ui.smoke\",\"iterations\":{},\"commands\":{},\"elapsedMs\":{:.3}}}",
        RENDER_GRAPH_ITERATIONS,
        command_count,
        elapsed.as_secs_f64() * 1000.0,
    );

    assert!(command_count >= 320);
    assert!(
        elapsed.as_millis() < 1_500,
        "native render graph smoke benchmark exceeded 1500ms: {:?}",
        elapsed
    );
}

#[test]
fn bench_smoke_summarizes_memory_ledger_under_stable_threshold() {
    let ledger = memory_ledger(MEMORY_LEDGER_RESOURCE_COUNT);
    let start = Instant::now();
    let summary = ledger.summary();
    let pressure = summary.memory_pressure();
    let elapsed = start.elapsed();

    println!(
        "{{\"bench\":\"native.memory_ledger.summary.smoke\",\"resources\":{},\"cpuBytes\":{},\"gpuBytes\":{},\"elapsedMs\":{:.3}}}",
        summary.total_count,
        pressure.total_memory.cpu_bytes,
        pressure.total_memory.gpu_bytes,
        elapsed.as_secs_f64() * 1000.0,
    );

    assert_eq!(summary.total_count, MEMORY_LEDGER_RESOURCE_COUNT);
    assert!(pressure.total_memory.total_bytes() > 0);
    assert!(
        elapsed.as_millis() < 250,
        "native memory ledger smoke benchmark exceeded 250ms: {:?}",
        elapsed
    );
}

#[test]
fn bench_smoke_prepares_audio_metrics_under_stable_threshold() {
    let layout = bench_layout();
    let view = audio_metrics_view(AUDIO_METRICS_TRACK_COUNT);
    let mut state = NativeRendererState::new();
    let start = Instant::now();
    let mut active_track_count = 0;
    let mut audio_resource_count = 0;

    for _ in 0..AUDIO_METRICS_ITERATIONS {
        state.prepare_frame(layout.clone(), &view);
        let metrics = state.metrics();
        active_track_count = metrics.audio_backend.active_track_count;
        audio_resource_count = metrics.resources.audio.resource_count;
    }

    let elapsed = start.elapsed();
    println!(
        "{{\"bench\":\"native.audio.metrics.smoke\",\"iterations\":{},\"tracks\":{},\"audioResources\":{},\"elapsedMs\":{:.3}}}",
        AUDIO_METRICS_ITERATIONS,
        active_track_count,
        audio_resource_count,
        elapsed.as_secs_f64() * 1000.0,
    );

    assert_eq!(active_track_count, AUDIO_METRICS_TRACK_COUNT);
    assert_eq!(audio_resource_count, AUDIO_METRICS_TRACK_COUNT * 2);
    assert!(
        elapsed.as_millis() < 750,
        "native audio metrics smoke benchmark exceeded 750ms: {:?}",
        elapsed
    );
}

#[test]
fn bench_smoke_releases_runtime_package_resources_under_stable_threshold() {
    let state = package_release_state(PACKAGE_RELEASE_RESOURCE_COUNT);
    let start = Instant::now();
    let mut clean_released_count = 0;
    let mut blocked_count = 0;
    let mut released_bytes = 0;
    let mut blocked_bytes = 0;
    let mut declarative_released_count = 0;
    let mut declarative_blocked_count = 0;
    let mut declarative_released_bytes = 0;
    let mut declarative_blocked_bytes = 0;

    for _ in 0..PACKAGE_RELEASE_ITERATIONS {
        let mut clean_state = state.clone();
        let mut blocked_state = state.clone();
        let clean_release = clean_state.release_package_resources("runtime.clean");
        let blocked_release = blocked_state.release_package_resources("runtime.blocked");
        clean_released_count = clean_release.summary.released_count;
        blocked_count = blocked_release.summary.blocked_count;
        released_bytes = clean_release.summary.released_memory.total_bytes();
        blocked_bytes = blocked_release.summary.blocked_memory.total_bytes();
        declarative_released_count = clean_release.summary.declarative_released_count;
        declarative_blocked_count = blocked_release.summary.declarative_blocked_count;
        declarative_released_bytes = clean_release
            .summary
            .declarative_released_memory
            .total_bytes();
        declarative_blocked_bytes = blocked_release
            .summary
            .declarative_blocked_memory
            .total_bytes();

        assert_eq!(
            blocked_release
                .summary
                .blocked_by_reason
                .get(&PackageUnloadBlockerReason::PackageRequiredByForeignResource)
                .copied(),
            Some(PACKAGE_RELEASE_RESOURCE_COUNT / 4),
        );
        assert_eq!(
            blocked_release
                .summary
                .blocked_by_reason
                .get(&PackageUnloadBlockerReason::OwnerStillRequiredByForeignPackage)
                .copied(),
            Some(PACKAGE_RELEASE_RESOURCE_COUNT / 4),
        );
    }

    let elapsed = start.elapsed();
    println!(
        "{{\"bench\":\"native.package_release.summary.smoke\",\"iterations\":{},\"resources\":{},\"released\":{},\"blocked\":{},\"releasedBytes\":{},\"blockedBytes\":{},\"declarativeReleased\":{},\"declarativeBlocked\":{},\"declarativeReleasedBytes\":{},\"declarativeBlockedBytes\":{},\"elapsedMs\":{:.3}}}",
        PACKAGE_RELEASE_ITERATIONS,
        PACKAGE_RELEASE_RESOURCE_COUNT,
        clean_released_count,
        blocked_count,
        released_bytes,
        blocked_bytes,
        declarative_released_count,
        declarative_blocked_count,
        declarative_released_bytes,
        declarative_blocked_bytes,
        elapsed.as_secs_f64() * 1000.0,
    );

    assert_eq!(clean_released_count, PACKAGE_RELEASE_RESOURCE_COUNT / 2);
    assert_eq!(blocked_count, PACKAGE_RELEASE_RESOURCE_COUNT / 2);
    assert_eq!(
        declarative_released_count,
        PACKAGE_RELEASE_RESOURCE_COUNT / 4
    );
    assert_eq!(
        declarative_blocked_count,
        PACKAGE_RELEASE_RESOURCE_COUNT / 4
    );
    assert!(released_bytes > 0);
    assert!(blocked_bytes > 0);
    assert!(declarative_released_bytes > 0);
    assert!(declarative_blocked_bytes > 0);
    assert!(
        elapsed.as_millis() < 1_000,
        "native package release smoke benchmark exceeded 1000ms: {:?}",
        elapsed
    );
}

fn heavy_ui_view(node_count: usize) -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/bench.png".to_string()),
            provenance: provenance("base", []),
            ..Default::default()
        }),
        dialogue: Some(DialogueProjection {
            speaker: Some("Bench".into()),
            provenance: provenance("runtime.dialogue", ["base"]),
            ..DialogueProjection::say("Benchmark smoke dialogue.")
        }),
        choices: Some(ChoiceSetProjection {
            visible: true,
            provenance: provenance("runtime.choice", ["base"]),
            choices: (0..8)
                .map(|index| ChoiceProjection {
                    provenance: provenance("runtime.choice", ["base"]),
                    ..ChoiceProjection::new(format!("choice-{index}"), format!("Choice {index}"))
                })
                .collect(),
        }),
        ui: Some(UiProjection {
            overlays: vec![UiOverlayProjection {
                surface: Some(
                    UiOverlaySurfaceProjection::new("bench/heavy-ui.qui")
                        .with_root(heavy_ui_surface(node_count)),
                ),
                provenance: provenance("runtime.ui", ["base"]),
                ..UiOverlayProjection::new("bench-ui")
            }],
            provenance: provenance("runtime.ui", ["base"]),
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn audio_metrics_view(track_count: usize) -> ViewProjection {
    ViewProjection {
        audio: Some(AudioProjection::new(
            (0..track_count).map(audio_track_for_index).collect(),
        )),
        ..Default::default()
    }
}

fn audio_track_for_index(index: usize) -> AudioTrackProjection {
    let kind = match index % 4 {
        0 => AudioTrackKind::Bgm,
        1 => AudioTrackKind::Voice,
        2 => AudioTrackKind::Sfx,
        _ => AudioTrackKind::Ambient,
    };
    let package_id = match kind {
        AudioTrackKind::Bgm => "runtime.audio.bgm",
        AudioTrackKind::Voice => "runtime.audio.voice",
        AudioTrackKind::Sfx => "runtime.audio.sfx",
        AudioTrackKind::Ambient => "runtime.audio.ambient",
    };
    let asset_name = match kind {
        AudioTrackKind::Bgm => format!("music/bench-{index}.ogg"),
        AudioTrackKind::Voice => format!("voice/bench-{index}.ogg"),
        AudioTrackKind::Sfx => format!("sfx/bench-{index}.ogg"),
        AudioTrackKind::Ambient => format!("ambient/bench-{index}.ogg"),
    };
    let mut track = AudioTrackProjection::new(format!("track-{index}"), kind, asset_name)
        .memory(AudioTrackMemoryEstimate {
            buffer_cpu_bytes: 64 * 1024,
            stream_cpu_bytes: 8 * 1024,
            handle_cpu_bytes: 256,
        })
        .with_provenance(provenance(package_id, ["base"]));

    if index % 3 == 0 {
        track = track.streamed();
    }
    if matches!(kind, AudioTrackKind::Bgm | AudioTrackKind::Ambient) {
        track.looped = true;
    }
    track.volume = 0.5 + ((index % 10) as f32 * 0.05);
    track
}

fn heavy_ui_surface(node_count: usize) -> UiSurfaceNodeProjection {
    let children = (0..node_count)
        .map(|index| {
            let column = (index % 8) as f64;
            let row = (index / 8) as f64;
            UiSurfaceNodeProjection::new(
                format!("label-{index}"),
                UiSurfaceNodeKind::Text,
                UiSurfaceNodeRect {
                    x: 48.0 + column * 210.0,
                    y: 64.0 + row * 34.0,
                    width: 180.0,
                    height: 28.0,
                },
            )
            .with_text(format!("Item {index}"))
        })
        .collect();

    UiSurfaceNodeProjection::new(
        "root",
        UiSurfaceNodeKind::Panel,
        UiSurfaceNodeRect {
            x: 32.0,
            y: 32.0,
            width: 1760.0,
            height: 920.0,
        },
    )
    .with_children(children)
}

fn memory_ledger(count: usize) -> NativeResourceLedger {
    let mut ledger = NativeResourceLedger::new();

    for index in 0..count {
        let kind = match index % 4 {
            0 => NativeResourceKind::Texture,
            1 => NativeResourceKind::UiAst,
            2 => NativeResourceKind::QssStyle,
            _ => NativeResourceKind::AudioBuffer,
        };
        let owner = match index % 3 {
            0 => "base",
            1 => "runtime.ui",
            _ => "runtime.audio",
        };
        ledger.insert(
            NativeResourceRecord::new(format!("resource:{index}"), kind)
                .owned_by(owner)
                .require_package("base")
                .memory(256 + index as u64, 512 + (index % 16) as u64 * 64),
        );
    }

    ledger
}

fn package_release_state(count: usize) -> NativeRendererState {
    let mut state = NativeRendererState::new();

    for index in 0..count {
        let kind = match index % 4 {
            0 => NativeResourceKind::Texture,
            1 => NativeResourceKind::UiAst,
            2 => NativeResourceKind::QssStyle,
            _ => NativeResourceKind::DecodedImage,
        };
        let memory_cpu = 128 + (index as u64 % 64);
        let memory_gpu = if matches!(
            kind,
            NativeResourceKind::Texture | NativeResourceKind::DecodedImage
        ) {
            512 + (index as u64 % 32) * 16
        } else {
            0
        };
        let mut record = NativeResourceRecord::new(format!("package-release:{index}"), kind)
            .memory(memory_cpu, memory_gpu);

        match index % 4 {
            0 | 1 => {
                record = record.owned_by("runtime.clean");
            }
            2 => {
                record = record
                    .owned_by("runtime.blocked")
                    .require_packages(["base", "runtime.blocked"]);
            }
            _ => {
                record = record
                    .owned_by("runtime.foreign")
                    .require_package("runtime.blocked");
            }
        }

        state.resources_mut().insert(record);
    }

    state
}

fn bench_layout() -> ResolvedStageLayout {
    resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(1920.0),
            height: Some(1080.0),
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
