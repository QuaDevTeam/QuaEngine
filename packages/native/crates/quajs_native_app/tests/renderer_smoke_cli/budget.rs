use super::support::{
    assert_memory_map_fixture_shape, memory_map_budget_from_summary, run_renderer_smoke_binary,
    smoke_json_line, smoke_ui_audio_frame_json, smoke_video_frame_json, unique_budget_path,
    unique_frame_path, SHARED_QUI_QSS_SURFACE_FRAME,
};

#[test]
fn binary_accepts_renderer_smoke_budget() {
    let path = unique_frame_path("budget-valid");
    let budget_path = unique_budget_path("pass");
    std::fs::write(&path, SHARED_QUI_QSS_SURFACE_FRAME).expect("renderer smoke fixture writes");
    std::fs::write(
        &budget_path,
        r#"{
          "maxResources": 5,
          "maxMissingResources": 0,
          "maxFallbacks": 0,
          "maxTextureUploadRequests": 2,
          "maxTextureUploadPendingRequests": 2,
          "maxTextureUploadResidentResources": 0,
          "maxTextureUploadOrphanedResidentResources": 0,
          "maxTextureUploadSkippedResources": 0,
          "maxTextureUploadNonTextureResources": 3,
          "maxDeclarativeAssetRequests": 1,
          "maxDeclarativeResources": 1,
          "maxMemoryBytes": 1048576,
          "maxDeclarativeMemoryBytes": 1048576,
          "maxAudioMemoryBytes": 0,
          "maxAudioResources": 0,
          "maxActiveAudioTracks": 0,
          "maxBackendPasses": 64,
          "maxBackendCommands": 1024,
          "maxBackendPipelineBinds": 1024,
          "maxBackendMaxClipDepth": 32,
          "maxBackendUniqueResources": 128,
          "maxBackendUniqueMissingResources": 0
        }"#,
    )
    .expect("renderer smoke budget fixture writes");

    let output = run_renderer_smoke_binary(&path, Some(&budget_path));

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
    let smoke_json = smoke_json_line(&stdout);
    assert_eq!(smoke_json["textureUploadRequestCount"], 2);
    assert_eq!(smoke_json["textureUploadPendingRequestCount"], 2);
    assert_eq!(smoke_json["textureUploadResidentResourceCount"], 0);
    assert_eq!(smoke_json["textureUploadOrphanedResidentResourceCount"], 0);
    assert_eq!(smoke_json["textureUploadSkippedResourceCount"], 0);
    assert_eq!(smoke_json["textureUploadNonTextureResourceCount"], 3);
}

#[test]
fn binary_rejects_unknown_renderer_smoke_budget_fields() {
    let path = unique_frame_path("budget-unknown-field");
    let budget_path = unique_budget_path("unknown-field");
    std::fs::write(&path, SHARED_QUI_QSS_SURFACE_FRAME).expect("renderer smoke fixture writes");
    std::fs::write(
        &budget_path,
        r#"{
          "maxResources": 5,
          "maxImaginarySmokeMetric": 0
        }"#,
    )
    .expect("renderer smoke budget fixture writes");

    let output = run_renderer_smoke_binary(&path, Some(&budget_path));

    std::fs::remove_file(path).ok();
    std::fs::remove_file(budget_path).ok();

    assert!(
        !output.status.success(),
        "unknown budget field unexpectedly succeeded\nstdout:\n{}",
        String::from_utf8_lossy(&output.stdout)
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Failed to parse renderer smoke budget"));
    assert!(stderr.contains("unknown field"));
    assert!(stderr.contains("maxImaginarySmokeMetric"));
}

#[test]
fn binary_accepts_renderer_smoke_budget_memory_maps() {
    let path = unique_frame_path("budget-memory-maps-pass");
    let budget_path = unique_budget_path("memory-maps-pass");
    std::fs::write(&path, smoke_ui_audio_frame_json()).expect("renderer smoke fixture writes");

    let summary_output = run_renderer_smoke_binary(&path, None);
    let summary_stdout = String::from_utf8_lossy(&summary_output.stdout);
    assert!(
        summary_output.status.success(),
        "summary smoke unexpectedly failed\nstdout:\n{}\nstderr:\n{}",
        summary_stdout,
        String::from_utf8_lossy(&summary_output.stderr)
    );
    let smoke_json = smoke_json_line(&summary_stdout);
    assert_memory_map_fixture_shape(&smoke_json);
    std::fs::write(
        &budget_path,
        serde_json::to_string_pretty(&memory_map_budget_from_summary(&smoke_json, 0))
            .expect("renderer smoke budget serializes"),
    )
    .expect("renderer smoke budget fixture writes");

    let output = run_renderer_smoke_binary(&path, Some(&budget_path));

    std::fs::remove_file(path).ok();
    std::fs::remove_file(budget_path).ok();

    assert!(
        output.status.success(),
        "memory-map budgeted smoke unexpectedly failed\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Qua native renderer smoke json: "));
}

#[test]
fn binary_rejects_renderer_smoke_texture_upload_budget_violations() {
    let path = unique_frame_path("budget-texture-upload-fail");
    let budget_path = unique_budget_path("texture-upload-fail");
    std::fs::write(&path, SHARED_QUI_QSS_SURFACE_FRAME).expect("renderer smoke fixture writes");
    std::fs::write(
        &budget_path,
        r#"{
          "maxTextureUploadRequests": 1,
          "maxTextureUploadPendingRequests": 1,
          "maxTextureUploadNonTextureResources": 2
        }"#,
    )
    .expect("renderer smoke budget fixture writes");

    let output = run_renderer_smoke_binary(&path, Some(&budget_path));

    std::fs::remove_file(path).ok();
    std::fs::remove_file(budget_path).ok();

    assert!(
        !output.status.success(),
        "texture upload budget violation unexpectedly succeeded\nstdout:\n{}",
        String::from_utf8_lossy(&output.stdout)
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Native renderer smoke budget exceeded"));
    assert!(stderr.contains("textureUploadRequestCount=2"));
    assert!(stderr.contains("textureUploadPendingRequestCount=2"));
    assert!(stderr.contains("textureUploadNonTextureResourceCount=3"));
    assert!(stderr.contains("exceeded max"));
}

#[test]
fn binary_rejects_renderer_smoke_budget_violations() {
    let path = unique_frame_path("budget-fail");
    let budget_path = unique_budget_path("fail");
    std::fs::write(&path, smoke_video_frame_json()).expect("renderer smoke fixture writes");
    std::fs::write(
        &budget_path,
        r#"{
          "maxVideoFallbacks": 0,
          "maxFallbacksByOwnerPackage": { "runtime.video": 0 },
          "maxFallbacksByRequiredPackage": { "base": 0 }
        }"#,
    )
    .expect("renderer smoke budget fixture writes");

    let output = run_renderer_smoke_binary(&path, Some(&budget_path));

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
    assert!(stderr.contains("fallbacksByOwnerPackage.runtime.video=1"));
    assert!(stderr.contains("fallbacksByRequiredPackage.base=1"));
    assert!(stderr.contains("exceeded max 0"));
}

#[test]
fn binary_rejects_renderer_smoke_audio_backend_budget_violations() {
    let path = unique_frame_path("budget-audio-backend-fail");
    let budget_path = unique_budget_path("audio-backend-fail");
    std::fs::write(&path, smoke_ui_audio_frame_json()).expect("renderer smoke fixture writes");
    std::fs::write(
        &budget_path,
        r#"{
          "maxAudioBackendAppliedPlans": 0,
          "maxAudioBackendAppliedCommands": 0,
          "maxAudioBackendActiveTracks": 0
        }"#,
    )
    .expect("renderer smoke budget fixture writes");

    let output = run_renderer_smoke_binary(&path, Some(&budget_path));

    std::fs::remove_file(path).ok();
    std::fs::remove_file(budget_path).ok();

    assert!(
        !output.status.success(),
        "audio backend budget violation unexpectedly succeeded\nstdout:\n{}",
        String::from_utf8_lossy(&output.stdout)
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Native renderer smoke budget exceeded"));
    assert!(stderr.contains("audioBackend.appliedPlanCount=1"));
    assert!(stderr.contains("audioBackend.appliedCommandCount=2"));
    assert!(stderr.contains("audioBackend.activeTrackCount=1"));
    assert!(stderr.contains("exceeded max 0"));
}

#[test]
fn binary_rejects_renderer_smoke_budget_memory_map_violations() {
    let path = unique_frame_path("budget-memory-maps-fail");
    let budget_path = unique_budget_path("memory-maps-fail");
    std::fs::write(&path, smoke_ui_audio_frame_json()).expect("renderer smoke fixture writes");

    let summary_output = run_renderer_smoke_binary(&path, None);
    let summary_stdout = String::from_utf8_lossy(&summary_output.stdout);
    assert!(
        summary_output.status.success(),
        "summary smoke unexpectedly failed\nstdout:\n{}\nstderr:\n{}",
        summary_stdout,
        String::from_utf8_lossy(&summary_output.stderr)
    );
    let smoke_json = smoke_json_line(&summary_stdout);
    assert_memory_map_fixture_shape(&smoke_json);
    std::fs::write(
        &budget_path,
        serde_json::to_string_pretty(&memory_map_budget_from_summary(&smoke_json, 1))
            .expect("renderer smoke budget serializes"),
    )
    .expect("renderer smoke budget fixture writes");

    let output = run_renderer_smoke_binary(&path, Some(&budget_path));

    std::fs::remove_file(path).ok();
    std::fs::remove_file(budget_path).ok();

    assert!(
        !output.status.success(),
        "memory-map budget violation unexpectedly succeeded\nstdout:\n{}",
        String::from_utf8_lossy(&output.stdout)
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Native renderer smoke budget exceeded"));
    assert!(stderr.contains("memoryByKind.uiAst.memory.totalBytes"));
    assert!(stderr.contains("memoryByPackage.runtime.audio.ownedMemory.totalBytes"));
    assert!(stderr.contains("declarativeMemoryByPackage.runtime.ui.ownedMemory.totalBytes"));
    assert!(stderr.contains("audioMemoryByPackage.runtime.audio.ownedMemory.totalBytes"));
}
