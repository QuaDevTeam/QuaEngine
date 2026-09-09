use crate::projection::audio::{
    AudioProjection, AudioTrackKind, AudioTrackMemoryEstimate, AudioTrackProjection,
};
use crate::projection::background::BackgroundProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::dialogue::DialogueProjection;
use crate::projection::ui::{
    UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection, UiSurfaceNodeKind,
    UiSurfaceNodeProjection, UiSurfaceNodeRect,
};
use crate::projection::view::ViewProjection;

use super::provenance::provenance;

pub(in crate::bench_smoke) fn heavy_ui_view(node_count: usize) -> ViewProjection {
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
            chrome: None,
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

#[cfg(feature = "wgpu-backend")]
pub(in crate::bench_smoke) fn heavy_text_ui_view(node_count: usize) -> ViewProjection {
    ViewProjection {
        ui: Some(UiProjection {
            overlays: vec![UiOverlayProjection {
                surface: Some(
                    UiOverlaySurfaceProjection::new("bench/heavy-text-ui.qui")
                        .with_root(heavy_text_ui_surface(node_count)),
                ),
                provenance: provenance("runtime.ui.text", ["base"]),
                ..UiOverlayProjection::new("bench-text-ui")
            }],
            provenance: provenance("runtime.ui.text", ["base"]),
            ..Default::default()
        }),
        ..Default::default()
    }
}

pub(in crate::bench_smoke) fn replacement_pressure_view(count: usize) -> ViewProjection {
    ViewProjection {
        ui: Some(UiProjection {
            overlays: (0..count)
                .map(|index| UiOverlayProjection {
                    provenance: provenance("runtime.replacement", ["base"]),
                    ..UiOverlayProjection::new(format!("replacement-{index}"))
                        .with_surface(format!("bench/replacement-{index}.qui"))
                })
                .collect(),
            provenance: provenance("base", []),
            ..Default::default()
        }),
        ..Default::default()
    }
}

pub(in crate::bench_smoke) fn audio_metrics_view(track_count: usize) -> ViewProjection {
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

#[cfg(feature = "wgpu-backend")]
fn heavy_text_ui_surface(node_count: usize) -> UiSurfaceNodeProjection {
    let children = (0..node_count)
        .map(|index| {
            let column = (index % 8) as f64;
            let row = (index / 8) as f64;
            let label = if index % 3 == 0 {
                format!("開始設定画面保存読込{index}")
            } else {
                format!("Menu Item {index}")
            };
            UiSurfaceNodeProjection::new(
                format!("text-label-{index}"),
                UiSurfaceNodeKind::Text,
                UiSurfaceNodeRect {
                    x: 48.0 + column * 210.0,
                    y: 64.0 + row * 42.0,
                    width: 180.0,
                    height: 38.0,
                },
            )
            .with_text(label)
        })
        .collect();

    UiSurfaceNodeProjection::new(
        "text-root",
        UiSurfaceNodeKind::Fragment,
        UiSurfaceNodeRect {
            x: 32.0,
            y: 32.0,
            width: 1760.0,
            height: 980.0,
        },
    )
    .with_children(children)
}
