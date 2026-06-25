use super::*;

#[test]
fn exposes_foundational_native_wgpu_capabilities() {
    let capabilities = native_wgpu_capabilities();
    let ids: Vec<_> = capabilities
        .iter()
        .map(|capability| capability.id.as_str())
        .collect();

    assert!(ids.contains(&"native-wgpu.stage-layout@1"));
    assert!(ids.contains(&"native-wgpu.image@1"));
    assert!(ids.contains(&"native-wgpu.video@1"));
    assert!(ids.contains(&"native-wgpu.text@1"));
    assert!(ids.contains(&"native-wgpu.ui.surface@1"));
    assert!(ids.contains(&"native-wgpu.input.pointer@1"));
    assert!(capabilities
        .iter()
        .all(|capability| capability.owner_package == "@quajs/native-renderer"));
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

#[test]
fn text_capability_matches_current_qss_text_subset() {
    let capabilities = native_wgpu_capabilities();
    let text = capability(&capabilities, "native-wgpu.text@1");

    assert!(text.qss_features.contains(&"font-family".to_string()));
    assert!(text.qss_features.contains(&"font-size".to_string()));
    assert!(text.qss_features.contains(&"font-weight".to_string()));
    assert!(text.qss_features.contains(&"line-height".to_string()));
    assert!(text.qss_features.contains(&"text-align".to_string()));
    assert!(text.qss_features.contains(&"color".to_string()));
}

#[test]
fn ui_surface_capability_matches_foundational_qui_qss_subset() {
    let capabilities = native_wgpu_capabilities();
    let ui = capability(&capabilities, "native-wgpu.ui.surface@1");

    assert_eq!(ui.fallback, "reject-package");
    assert!(ui.intent_events.contains(&"ui/intent".to_string()));
    assert!(ui.asset_kinds.contains(&"qui".to_string()));
    assert!(ui.asset_kinds.contains(&"qss".to_string()));
    assert!(ui.asset_kinds.contains(&"tokens".to_string()));
    assert!(ui.asset_kinds.contains(&"fonts".to_string()));
    assert!(!ui.qss_features.contains(&"display".to_string()));
    assert!(!ui.qss_features.contains(&"flex-direction".to_string()));
    assert!(!ui.qss_features.contains(&"gap".to_string()));
    assert!(!ui.qss_features.contains(&"padding".to_string()));
    assert!(!ui.qss_features.contains(&"margin".to_string()));
    assert!(ui.qss_features.contains(&"background-color".to_string()));
    assert!(ui.qss_features.contains(&"background-image".to_string()));
    assert!(ui.qss_features.contains(&"border-color".to_string()));
    assert!(ui.qss_features.contains(&"border-radius".to_string()));
    assert!(ui.qss_features.contains(&"border-width".to_string()));
    assert!(ui.qss_features.contains(&"color".to_string()));
    assert!(ui.qss_features.contains(&"font-family".to_string()));
    assert!(ui.qss_features.contains(&"font-size".to_string()));
    assert!(ui.qss_features.contains(&"font-weight".to_string()));
    assert!(ui.qss_features.contains(&"line-height".to_string()));
    assert!(ui.qss_features.contains(&"text-align".to_string()));
    assert!(ui.qss_features.contains(&"object-fit".to_string()));
    assert!(ui.qss_features.contains(&"opacity".to_string()));
    assert!(ui.qss_features.contains(&"z-index".to_string()));
    assert!(ui.qui_components.contains(&"Backdrop".to_string()));
    assert!(ui.qui_components.contains(&"Button".to_string()));
    assert!(ui.qui_components.contains(&"Column".to_string()));
    assert!(ui.qui_components.contains(&"Divider".to_string()));
    assert!(ui.qui_components.contains(&"Fragment".to_string()));
    assert!(ui.qui_components.contains(&"Grid".to_string()));
    assert!(ui.qui_components.contains(&"Layer".to_string()));
    assert!(ui.qui_components.contains(&"Row".to_string()));
    assert!(ui.qui_components.contains(&"Text".to_string()));
    assert!(ui.qui_components.contains(&"RichText".to_string()));
    assert!(ui.qui_components.contains(&"Image".to_string()));
    assert!(ui.qui_components.contains(&"Panel".to_string()));
    assert!(ui.qui_components.contains(&"SafeArea".to_string()));
    assert!(ui.qui_components.contains(&"Scroll".to_string()));
    assert!(ui.qui_components.contains(&"Spacer".to_string()));
    assert!(ui.qui_components.contains(&"Stack".to_string()));
    assert!(!ui.qui_components.contains(&"VirtualList".to_string()));
    assert!(!ui.qui_components.contains(&"FocusScope".to_string()));
}

#[test]
fn pointer_capability_is_limited_to_interactive_surface_components() {
    let capabilities = native_wgpu_capabilities();
    let pointer = capability(&capabilities, "native-wgpu.input.pointer@1");

    assert_eq!(pointer.fallback, "reject-package");
    assert!(pointer.asset_kinds.is_empty());
    assert!(pointer.qss_features.is_empty());
    assert!(pointer.qui_components.contains(&"Backdrop".to_string()));
    assert!(pointer.qui_components.contains(&"Button".to_string()));
    assert!(pointer.qui_components.contains(&"Panel".to_string()));
    assert!(!pointer.qui_components.contains(&"Choice".to_string()));
    assert!(!pointer.qui_components.contains(&"Column".to_string()));
    assert!(!pointer.qui_components.contains(&"Divider".to_string()));
    assert!(!pointer.qui_components.contains(&"Fragment".to_string()));
    assert!(!pointer.qui_components.contains(&"Grid".to_string()));
    assert!(!pointer.qui_components.contains(&"Layer".to_string()));
    assert!(!pointer.qui_components.contains(&"Row".to_string()));
    assert!(!pointer.qui_components.contains(&"RichText".to_string()));
    assert!(!pointer.qui_components.contains(&"SafeArea".to_string()));
    assert!(!pointer.qui_components.contains(&"Spacer".to_string()));
    assert!(!pointer.qui_components.contains(&"Stack".to_string()));
    assert!(pointer.intent_events.contains(&"choice/select".to_string()));
    assert!(pointer.intent_events.contains(&"ui/intent".to_string()));
    assert!(pointer
        .projection_keys
        .contains(&"view.choices".to_string()));
}

fn capability<'a>(
    capabilities: &'a [quajs_native_runtime::RendererCapability],
    id: &str,
) -> &'a quajs_native_runtime::RendererCapability {
    capabilities
        .iter()
        .find(|capability| capability.id == id)
        .unwrap()
}
