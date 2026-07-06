use super::support::{capability, native_wgpu_capabilities};

#[test]
fn image_capability_declares_image_fit_and_origin_features() {
    let capabilities = native_wgpu_capabilities();
    let image = capability(&capabilities, "native-wgpu.image@1");

    assert!(image.qss_features.contains(&"object-fit".to_string()));
    assert!(image.qss_features.contains(&"object-position".to_string()));
    assert!(image.qui_components.contains(&"Image".to_string()));
    assert!(!image.qui_components.contains(&"Layer".to_string()));
    assert!(!image.qui_components.contains(&"Video".to_string()));
}

#[test]
fn video_capability_is_poster_fallback_only_until_decode_backend_exists() {
    let capabilities = native_wgpu_capabilities();
    let video = capability(&capabilities, "native-wgpu.video@1");

    assert_eq!(video.fallback, "warn-once");
    assert!(video
        .projection_keys
        .contains(&"background.video".to_string()));
    assert!(video.asset_kinds.contains(&"video".to_string()));
    assert!(video.asset_kinds.contains(&"images".to_string()));
    assert!(video.qss_features.contains(&"object-fit".to_string()));
    assert!(video.qss_features.contains(&"object-position".to_string()));
    assert!(video.qss_features.contains(&"opacity".to_string()));
    assert!(video.intent_events.is_empty());
    assert!(video.qui_components.is_empty());
    assert!(!video.projection_keys.contains(&"ui.video".to_string()));
    assert!(!video.qss_features.contains(&"playback-rate".to_string()));
}

#[test]
fn omits_real_audio_capability_until_playback_backend_exists() {
    let capabilities = native_wgpu_capabilities();

    assert!(capabilities
        .iter()
        .all(|capability| capability.id != "native-wgpu.audio@1"));
    assert!(capabilities.iter().all(|capability| {
        !capability.projection_keys.iter().any(|key| key == "audio")
            && !capability.asset_kinds.iter().any(|kind| kind == "audio")
    }));
}
