use super::support::{
    run_renderer_smoke_binary, smoke_json_line, smoke_ui_audio_frame_json, unique_frame_path,
    SHARED_QUI_QSS_SURFACE_FRAME,
};

#[test]
fn binary_runs_renderer_smoke_frame_from_projection_json() {
    let path = unique_frame_path("valid");
    std::fs::write(&path, SHARED_QUI_QSS_SURFACE_FRAME).expect("renderer smoke fixture writes");

    let output = run_renderer_smoke_binary(&path, None);

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
    assert!(stdout.contains("audioBackendPlans=1"));
    assert!(stdout.contains("audioBackendCommands=0"));
    assert!(stdout.contains("audioBackendTracks=0"));
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
    assert_eq!(smoke_json["audioBackend"]["appliedPlanCount"], 1);
    assert_eq!(smoke_json["audioBackend"]["appliedCommandCount"], 0);
    assert_eq!(smoke_json["audioBackend"]["activeTrackCount"], 0);
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

    let output = run_renderer_smoke_binary(&path, None);

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
fn binary_rejects_renderer_smoke_web_audio_alias_fields() {
    let path = unique_frame_path("audio-web-alias");
    let mut frame: serde_json::Value =
        serde_json::from_str(&smoke_ui_audio_frame_json()).expect("smoke UI/audio frame parses");
    frame["view"]["audio"]["tracks"][0]["assetKey"] = serde_json::json!("audio/web-alias.ogg");
    std::fs::write(
        &path,
        serde_json::to_string(&frame).expect("renderer smoke frame serializes"),
    )
    .expect("renderer smoke fixture writes");

    let output = run_renderer_smoke_binary(&path, None);

    std::fs::remove_file(path).ok();

    assert!(
        !output.status.success(),
        "Web audio alias unexpectedly succeeded\nstdout:\n{}",
        String::from_utf8_lossy(&output.stdout)
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Native renderer smoke frame failed"));
    assert!(stderr.contains("view.audio.tracks[0].assetKey"));
    assert!(stderr.contains("assetName"));
}
