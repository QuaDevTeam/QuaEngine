use super::support::{
    assert_memory_map_fixture_shape, run_renderer_smoke_binary, smoke_json_line,
    smoke_ui_audio_frame_json, smoke_video_frame_json, unique_frame_path,
};

#[test]
fn binary_reports_renderer_smoke_audio_backend_metrics() {
    let path = unique_frame_path("audio-backend");
    std::fs::write(&path, smoke_ui_audio_frame_json()).expect("renderer smoke fixture writes");

    let output = run_renderer_smoke_binary(&path, None);

    std::fs::remove_file(path).ok();

    assert!(
        output.status.success(),
        "audio backend smoke unexpectedly failed\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("audioBackendPlans=1"));
    assert!(stdout.contains("audioBackendCommands=2"));
    assert!(stdout.contains("audioBackendTracks=1"));

    let smoke_json = smoke_json_line(&stdout);
    assert_memory_map_fixture_shape(&smoke_json);
    assert_eq!(smoke_json["audioBackend"]["appliedPlanCount"], 1);
    assert_eq!(smoke_json["audioBackend"]["appliedCommandCount"], 2);
    assert_eq!(
        smoke_json["audioBackend"]["activeTrackCount"],
        smoke_json["activeAudioTrackCount"]
    );
}

#[test]
fn binary_reports_video_fallback_package_breakdown() {
    let path = unique_frame_path("video-fallback-packages");
    std::fs::write(&path, smoke_video_frame_json()).expect("renderer smoke fixture writes");

    let output = run_renderer_smoke_binary(&path, None);

    std::fs::remove_file(path).ok();

    assert!(
        output.status.success(),
        "video fallback smoke unexpectedly failed\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    let smoke_json = smoke_json_line(&stdout);
    assert_eq!(smoke_json["fallbackCount"], 1);
    assert_eq!(smoke_json["videoFallbackCount"], 1);
    assert_eq!(smoke_json["fallbacksByOwnerPackage"]["runtime.video"], 1);
    assert_eq!(smoke_json["fallbacksByRequiredPackage"]["base"], 1);
}
