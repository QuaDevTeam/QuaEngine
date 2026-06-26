use std::path::Path;
use std::process::{Command, Output};

pub(super) const RENDERER_SMOKE_BUDGET_ENV: &str = "QUA_NATIVE_RENDERER_SMOKE_BUDGET";
pub(super) const RENDERER_SMOKE_FRAME_ENV: &str = "QUA_NATIVE_RENDERER_SMOKE_FRAME";
pub(super) const SHARED_QUI_QSS_SURFACE_FRAME: &str =
    include_str!("../../../../test-fixtures/renderer/qui-qss-surface-frame.json");

pub(super) fn run_renderer_smoke_binary(frame_path: &Path, budget_path: Option<&Path>) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_quajs_native_app"));
    command
        .env(RENDERER_SMOKE_FRAME_ENV, frame_path)
        .env_remove("QUA_NATIVE_TARGET_BUNDLE_MANIFEST");

    if let Some(budget_path) = budget_path {
        command.env(RENDERER_SMOKE_BUDGET_ENV, budget_path);
    } else {
        command.env_remove(RENDERER_SMOKE_BUDGET_ENV);
    }

    command.output().expect("native app binary runs")
}

pub(super) fn unique_frame_path(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "quajs-native-app-cli-renderer-smoke-{label}-{}-{}.json",
        std::process::id(),
        std::thread::current().name().unwrap_or("test")
    ))
}

pub(super) fn unique_budget_path(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "quajs-native-app-cli-renderer-smoke-budget-config-{label}-{}-{}.json",
        std::process::id(),
        std::thread::current().name().unwrap_or("test")
    ))
}

pub(super) fn smoke_json_line(stdout: &str) -> serde_json::Value {
    let json = stdout
        .lines()
        .find_map(|line| line.strip_prefix("Qua native renderer smoke json: "))
        .expect("renderer smoke JSON line exists");
    serde_json::from_str(json).expect("renderer smoke JSON line parses")
}

pub(super) fn assert_memory_map_fixture_shape(smoke_json: &serde_json::Value) {
    assert_eq!(smoke_json["audioResourceCount"], 2);
    assert_eq!(smoke_json["activeAudioTrackCount"], 1);
    assert!(total_bytes_at(smoke_json, &["memoryByKind", "uiAst", "memory"]) > 0);
    assert!(total_bytes_at(smoke_json, &["memoryByKind", "audioBuffer", "memory"]) > 0);
    assert!(
        total_bytes_at(
            smoke_json,
            &["memoryByPackage", "runtime.ui", "ownedMemory"]
        ) > 0
    );
    assert!(
        total_bytes_at(
            smoke_json,
            &["memoryByPackage", "runtime.audio", "ownedMemory"]
        ) > 0
    );
    assert!(
        total_bytes_at(
            smoke_json,
            &["declarativeMemoryByPackage", "runtime.ui", "ownedMemory"]
        ) > 0
    );
    assert!(
        total_bytes_at(
            smoke_json,
            &["audioMemoryByPackage", "runtime.audio", "ownedMemory"]
        ) > 0
    );
}

pub(super) fn memory_map_budget_from_summary(
    smoke_json: &serde_json::Value,
    subtract_from_actual: u64,
) -> serde_json::Value {
    serde_json::json!({
        "maxMemoryBytesByKind": {
            "uiAst": budget_limit(smoke_json, &["memoryByKind", "uiAst", "memory"], subtract_from_actual),
            "audioBuffer": budget_limit(smoke_json, &["memoryByKind", "audioBuffer", "memory"], subtract_from_actual),
            "audioHandle": budget_limit(smoke_json, &["memoryByKind", "audioHandle", "memory"], subtract_from_actual)
        },
        "maxOwnedMemoryBytesByPackage": {
            "runtime.ui": budget_limit(smoke_json, &["memoryByPackage", "runtime.ui", "ownedMemory"], subtract_from_actual),
            "runtime.audio": budget_limit(smoke_json, &["memoryByPackage", "runtime.audio", "ownedMemory"], subtract_from_actual)
        },
        "maxDependentMemoryBytesByPackage": {
            "base": budget_limit(smoke_json, &["memoryByPackage", "base", "dependentMemory"], subtract_from_actual)
        },
        "maxDeclarativeOwnedMemoryBytesByPackage": {
            "runtime.ui": budget_limit(smoke_json, &["declarativeMemoryByPackage", "runtime.ui", "ownedMemory"], subtract_from_actual)
        },
        "maxDeclarativeDependentMemoryBytesByPackage": {
            "base": budget_limit(smoke_json, &["declarativeMemoryByPackage", "base", "dependentMemory"], subtract_from_actual)
        },
        "maxAudioOwnedMemoryBytesByPackage": {
            "runtime.audio": budget_limit(smoke_json, &["audioMemoryByPackage", "runtime.audio", "ownedMemory"], subtract_from_actual)
        },
        "maxAudioDependentMemoryBytesByPackage": {
            "base": budget_limit(smoke_json, &["audioMemoryByPackage", "base", "dependentMemory"], subtract_from_actual)
        }
    })
}

fn budget_limit(smoke_json: &serde_json::Value, path: &[&str], subtract_from_actual: u64) -> u64 {
    let actual = total_bytes_at(smoke_json, path);
    assert!(
        actual >= subtract_from_actual,
        "budget limit path {:?} should have enough bytes to subtract {} from {}",
        path,
        subtract_from_actual,
        actual
    );
    actual - subtract_from_actual
}

fn total_bytes_at(smoke_json: &serde_json::Value, path: &[&str]) -> u64 {
    path.iter()
        .fold(smoke_json, |value, segment| &value[*segment])["totalBytes"]
        .as_u64()
        .unwrap_or_else(|| panic!("smoke JSON totalBytes exists at {:?}", path))
}

pub(super) fn smoke_ui_audio_frame_json() -> String {
    let mut frame: serde_json::Value =
        serde_json::from_str(SHARED_QUI_QSS_SURFACE_FRAME).expect("shared frame JSON parses");
    frame["view"]["audio"] = serde_json::json!({
        "tracks": [
            {
                "id": "bgm-main",
                "kind": "bgm",
                "assetName": "audio/opening.ogg",
                "assetType": "bgm",
                "loadMode": "buffered",
                "playbackState": "playing",
                "looped": true,
                "volume": 0.8,
                "memory": {
                    "bufferCpuBytes": 4096,
                    "streamCpuBytes": 512,
                    "handleCpuBytes": 128
                },
                "provenance": {
                    "contentPackageId": "runtime.audio",
                    "requiredRuntimePackages": ["base"]
                }
            }
        ]
    });
    serde_json::to_string(&frame).expect("smoke UI/audio frame serializes")
}

pub(super) fn smoke_video_frame_json() -> &'static str {
    r##"
    {
      "layout": { "preset": "landscape" },
      "container": { "width": 1600, "height": 1000, "devicePixelRatio": 2 },
      "view": {
        "background": {
          "mode": "video",
          "video": {
            "assetName": "video/opening.mp4",
            "poster": "poster/opening.png",
            "provenance": {
              "contentPackageId": "runtime.video",
              "requiredRuntimePackages": ["base"]
            }
          }
        }
      }
    }
    "##
}
