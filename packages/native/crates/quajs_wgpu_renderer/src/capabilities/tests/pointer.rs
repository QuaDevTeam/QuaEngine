use super::support::{capability, native_wgpu_capabilities};

#[test]
fn pointer_capability_is_limited_to_interactive_surface_components() {
    let capabilities = native_wgpu_capabilities();
    let pointer = capability(&capabilities, "native-wgpu.input.pointer@1");

    assert_eq!(pointer.fallback, "reject-package");
    assert!(pointer.asset_kinds.is_empty());
    assert!(pointer.qss_features.is_empty());
    assert!(pointer.qui_components.contains(&"Backdrop".to_string()));
    assert!(pointer.qui_components.contains(&"Box".to_string()));
    assert!(pointer.qui_components.contains(&"Button".to_string()));
    assert!(pointer.qui_components.contains(&"Panel".to_string()));
    assert!(!pointer.qui_components.contains(&"Choice".to_string()));
    assert!(!pointer.qui_components.contains(&"Column".to_string()));
    assert!(!pointer.qui_components.contains(&"Divider".to_string()));
    assert!(!pointer.qui_components.contains(&"Fragment".to_string()));
    assert!(!pointer.qui_components.contains(&"Grid".to_string()));
    assert!(!pointer.qui_components.contains(&"Image".to_string()));
    assert!(!pointer.qui_components.contains(&"Layer".to_string()));
    assert!(!pointer.qui_components.contains(&"Row".to_string()));
    assert!(!pointer.qui_components.contains(&"RichText".to_string()));
    assert!(!pointer.qui_components.contains(&"SafeArea".to_string()));
    assert!(!pointer.qui_components.contains(&"Spacer".to_string()));
    assert!(!pointer.qui_components.contains(&"Stack".to_string()));
    assert!(!pointer.qui_components.contains(&"Text".to_string()));
    assert!(pointer.intent_events.contains(&"choice/select".to_string()));
    assert!(pointer.intent_events.contains(&"ui/intent".to_string()));
    assert!(pointer
        .projection_keys
        .contains(&"view.choices".to_string()));
}
