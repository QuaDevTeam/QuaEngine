use super::support::{capability, native_wgpu_capabilities};

#[test]
fn text_capability_matches_current_qss_text_subset() {
    let capabilities = native_wgpu_capabilities();
    let text = capability(&capabilities, "native-wgpu.text@1");

    assert!(text.qss_features.contains(&"font-family".to_string()));
    assert!(text.qss_features.contains(&"font-size".to_string()));
    assert!(text.qss_features.contains(&"font-style".to_string()));
    assert!(text.qss_features.contains(&"font-weight".to_string()));
    assert!(text.qss_features.contains(&"letter-spacing".to_string()));
    assert!(text.qss_features.contains(&"line-height".to_string()));
    assert!(text.qss_features.contains(&"text-align".to_string()));
    assert!(text.qss_features.contains(&"text-decoration".to_string()));
    assert!(text.qss_features.contains(&"text-overflow".to_string()));
    assert!(text.qss_features.contains(&"text-transform".to_string()));
    assert!(text.qss_features.contains(&"white-space".to_string()));
    assert!(text.qss_features.contains(&"color".to_string()));
}
