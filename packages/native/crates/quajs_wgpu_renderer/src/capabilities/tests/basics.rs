use super::support::native_wgpu_capabilities;

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
    assert!(ids.contains(&"native-wgpu.input.text@1"));
    assert!(capabilities
        .iter()
        .all(|capability| capability.owner_package == "@quajs/native-renderer"));
}
