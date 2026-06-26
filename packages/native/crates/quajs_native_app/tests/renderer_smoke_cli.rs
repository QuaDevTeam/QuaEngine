use std::process::Command;

const RENDERER_SMOKE_BUDGET_ENV: &str = "QUA_NATIVE_RENDERER_SMOKE_BUDGET";
const RENDERER_SMOKE_FRAME_ENV: &str = "QUA_NATIVE_RENDERER_SMOKE_FRAME";
const SHARED_QUI_QSS_SURFACE_FRAME: &str =
    include_str!("../../../test-fixtures/renderer/qui-qss-surface-frame.json");

#[test]
fn binary_runs_renderer_smoke_frame_from_projection_json() {
    let path = unique_frame_path("valid");
    std::fs::write(&path, SHARED_QUI_QSS_SURFACE_FRAME).expect("renderer smoke fixture writes");

    let output = Command::new(env!("CARGO_BIN_EXE_quajs_native_app"))
        .env(RENDERER_SMOKE_FRAME_ENV, &path)
        .env_remove(RENDERER_SMOKE_BUDGET_ENV)
        .env_remove("QUA_NATIVE_TARGET_BUNDLE_MANIFEST")
        .output()
        .expect("native app binary runs");

    std::fs::remove_file(path).ok();

    assert!(
        output.status.success(),
        "native app failed\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Qua native host ready: renderer="));
    assert!(stdout.contains("\"quickjsVersion\":\"unsupported\""));
    assert!(stdout.contains("Qua native renderer smoke: revision=1 passes="));
    assert!(stdout.contains("missingResources=0"));
    let smoke_json = smoke_json_line(&stdout);
    assert_eq!(smoke_json["revision"], 1);
    assert!(smoke_json["passCount"].as_u64().unwrap() >= 1);
    assert_eq!(smoke_json["resourceCount"], 5);
    assert_eq!(smoke_json["missingResourceCount"], 0);
    assert_eq!(smoke_json["fallbackCount"], 0);
    assert_eq!(smoke_json["declarativeResourceCount"], 1);
    assert_eq!(smoke_json["declarativeAssetRequestCount"], 1);
    assert_eq!(smoke_json["audioResourceCount"], 0);
    assert_eq!(smoke_json["activeAudioTrackCount"], 0);
    assert!(smoke_json["memory"]["totalBytes"].as_u64().unwrap() > 0);
    assert!(
        smoke_json["declarativeMemory"]["totalBytes"]
            .as_u64()
            .unwrap()
            > 0
    );
    assert!(
        smoke_json["memoryByKind"]["uiAst"]["memory"]["totalBytes"]
            .as_u64()
            .unwrap()
            > 0
    );
    assert!(
        smoke_json["memoryByPackage"]["runtime.ui"]["ownedMemory"]["totalBytes"]
            .as_u64()
            .unwrap()
            > 0
    );
    assert!(
        smoke_json["declarativeMemoryByPackage"]["runtime.ui"]["ownedMemory"]["totalBytes"]
            .as_u64()
            .unwrap()
            > 0
    );
    assert!(smoke_json["audioMemoryByPackage"]
        .as_object()
        .unwrap()
        .is_empty());
}

#[test]
fn binary_reports_invalid_renderer_smoke_frame_json() {
    let path = unique_frame_path("invalid");
    std::fs::write(&path, "{not json").expect("invalid renderer smoke fixture writes");

    let output = Command::new(env!("CARGO_BIN_EXE_quajs_native_app"))
        .env(RENDERER_SMOKE_FRAME_ENV, &path)
        .env_remove(RENDERER_SMOKE_BUDGET_ENV)
        .env_remove("QUA_NATIVE_TARGET_BUNDLE_MANIFEST")
        .output()
        .expect("native app binary runs");

    std::fs::remove_file(path).ok();

    assert!(
        !output.status.success(),
        "invalid frame unexpectedly succeeded\nstdout:\n{}",
        String::from_utf8_lossy(&output.stdout)
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Native renderer smoke frame failed"));
    assert!(stderr.contains("Failed to parse native renderer frame JSON"));
}

#[test]
fn binary_accepts_renderer_smoke_budget() {
    let path = unique_frame_path("budget-valid");
    let budget_path = unique_budget_path("pass");
    std::fs::write(&path, SHARED_QUI_QSS_SURFACE_FRAME).expect("renderer smoke fixture writes");
    std::fs::write(
        &budget_path,
        r#"{
          "maxMissingResources": 0,
          "maxFallbacks": 0,
          "maxMemoryBytes": 1048576,
          "maxDeclarativeMemoryBytes": 1048576,
          "maxAudioMemoryBytes": 0,
          "maxAudioResources": 0,
          "maxActiveAudioTracks": 0
        }"#,
    )
    .expect("renderer smoke budget fixture writes");

    let output = Command::new(env!("CARGO_BIN_EXE_quajs_native_app"))
        .env(RENDERER_SMOKE_FRAME_ENV, &path)
        .env(RENDERER_SMOKE_BUDGET_ENV, &budget_path)
        .env_remove("QUA_NATIVE_TARGET_BUNDLE_MANIFEST")
        .output()
        .expect("native app binary runs");

    std::fs::remove_file(path).ok();
    std::fs::remove_file(budget_path).ok();

    assert!(
        output.status.success(),
        "budgeted smoke unexpectedly failed\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Qua native renderer smoke json: "));
}

#[test]
fn binary_rejects_renderer_smoke_budget_violations() {
    let path = unique_frame_path("budget-fail");
    let budget_path = unique_budget_path("fail");
    std::fs::write(&path, smoke_video_frame_json()).expect("renderer smoke fixture writes");
    std::fs::write(&budget_path, r#"{ "maxVideoFallbacks": 0 }"#)
        .expect("renderer smoke budget fixture writes");

    let output = Command::new(env!("CARGO_BIN_EXE_quajs_native_app"))
        .env(RENDERER_SMOKE_FRAME_ENV, &path)
        .env(RENDERER_SMOKE_BUDGET_ENV, &budget_path)
        .env_remove("QUA_NATIVE_TARGET_BUNDLE_MANIFEST")
        .output()
        .expect("native app binary runs");

    std::fs::remove_file(path).ok();
    std::fs::remove_file(budget_path).ok();

    assert!(
        !output.status.success(),
        "budget violation unexpectedly succeeded\nstdout:\n{}",
        String::from_utf8_lossy(&output.stdout)
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Native renderer smoke budget exceeded"));
    assert!(stderr.contains("videoFallbackCount=1"));
    assert!(stderr.contains("exceeded max 0"));
}

fn unique_frame_path(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "quajs-native-app-cli-renderer-smoke-{label}-{}-{}.json",
        std::process::id(),
        std::thread::current().name().unwrap_or("test")
    ))
}

fn unique_budget_path(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "quajs-native-app-cli-renderer-smoke-budget-config-{label}-{}-{}.json",
        std::process::id(),
        std::thread::current().name().unwrap_or("test")
    ))
}

fn smoke_json_line(stdout: &str) -> serde_json::Value {
    let json = stdout
        .lines()
        .find_map(|line| line.strip_prefix("Qua native renderer smoke json: "))
        .expect("renderer smoke JSON line exists");
    serde_json::from_str(json).expect("renderer smoke JSON line parses")
}

fn smoke_video_frame_json() -> &'static str {
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
