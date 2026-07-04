use serde_json::Value;

use super::support::{
    assert_requirements_covered, capability, collect_surface_requirements,
    native_wgpu_capabilities, FixtureSurfaceRequirements, SHARED_QUI_QSS_SURFACE_FRAME,
};

#[test]
fn ui_surface_capability_matches_foundational_qui_qss_subset() {
    let capabilities = native_wgpu_capabilities();
    let ui = capability(&capabilities, "native-wgpu.ui.surface@1");

    assert_eq!(ui.fallback, "reject-package");
    assert!(ui.intent_events.contains(&"ui/intent".to_string()));
    assert!(ui.asset_kinds.contains(&"qui".to_string()));
    assert!(ui.asset_kinds.contains(&"qss".to_string()));
    assert!(ui.asset_kinds.contains(&"tokens".to_string()));
    assert!(ui.qss_features.contains(&"align-items".to_string()));
    assert!(ui.asset_kinds.contains(&"fonts".to_string()));
    assert!(ui.qss_features.contains(&"display".to_string()));
    assert!(!ui.qss_features.contains(&"flex-direction".to_string()));
    assert!(ui.qss_features.contains(&"gap".to_string()));
    assert!(ui.qss_features.contains(&"row-gap".to_string()));
    assert!(ui.qss_features.contains(&"column-gap".to_string()));
    assert!(ui.qss_features.contains(&"padding".to_string()));
    assert!(ui.qss_features.contains(&"padding-bottom".to_string()));
    assert!(ui.qss_features.contains(&"padding-left".to_string()));
    assert!(ui.qss_features.contains(&"padding-right".to_string()));
    assert!(ui.qss_features.contains(&"padding-top".to_string()));
    assert!(ui.qss_features.contains(&"position".to_string()));
    assert!(ui.qss_features.contains(&"margin".to_string()));
    assert!(ui.qss_features.contains(&"margin-bottom".to_string()));
    assert!(ui.qss_features.contains(&"margin-left".to_string()));
    assert!(ui.qss_features.contains(&"margin-right".to_string()));
    assert!(ui.qss_features.contains(&"margin-top".to_string()));
    assert!(ui.qss_features.contains(&"background-color".to_string()));
    assert!(ui.qss_features.contains(&"background-image".to_string()));
    assert!(ui.qss_features.contains(&"background-position".to_string()));
    assert!(ui.qss_features.contains(&"background-size".to_string()));
    assert!(ui.qss_features.contains(&"border-color".to_string()));
    assert!(ui.qss_features.contains(&"border-radius".to_string()));
    assert!(ui.qss_features.contains(&"border-style".to_string()));
    assert!(ui.qss_features.contains(&"border-width".to_string()));
    assert!(ui.qss_features.contains(&"bottom".to_string()));
    assert!(ui.qss_features.contains(&"box-sizing".to_string()));
    assert!(ui.qss_features.contains(&"color".to_string()));
    assert!(ui.qss_features.contains(&"font-family".to_string()));
    assert!(ui.qss_features.contains(&"font-size".to_string()));
    assert!(ui.qss_features.contains(&"font-style".to_string()));
    assert!(ui.qss_features.contains(&"font-weight".to_string()));
    assert!(ui.qss_features.contains(&"inset".to_string()));
    assert!(ui.qss_features.contains(&"justify-content".to_string()));
    assert!(ui.qss_features.contains(&"letter-spacing".to_string()));
    assert!(ui.qss_features.contains(&"height".to_string()));
    assert!(ui.qss_features.contains(&"left".to_string()));
    assert!(ui.qss_features.contains(&"line-height".to_string()));
    assert!(ui.qss_features.contains(&"max-height".to_string()));
    assert!(ui.qss_features.contains(&"max-width".to_string()));
    assert!(ui.qss_features.contains(&"min-height".to_string()));
    assert!(ui.qss_features.contains(&"min-width".to_string()));
    assert!(ui.qss_features.contains(&"text-align".to_string()));
    assert!(ui.qss_features.contains(&"text-decoration".to_string()));
    assert!(ui.qss_features.contains(&"text-overflow".to_string()));
    assert!(ui.qss_features.contains(&"text-transform".to_string()));
    assert!(ui.qss_features.contains(&"object-fit".to_string()));
    assert!(ui.qss_features.contains(&"opacity".to_string()));
    assert!(ui.qss_features.contains(&"overflow".to_string()));
    assert!(ui.qss_features.contains(&"z-index".to_string()));
    assert!(ui.qss_features.contains(&"right".to_string()));
    assert!(ui.qss_features.contains(&"top".to_string()));
    assert!(ui.qss_features.contains(&"visibility".to_string()));
    assert!(ui.qss_features.contains(&"white-space".to_string()));
    assert!(ui.qss_features.contains(&"width".to_string()));
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
fn ui_surface_capability_covers_shared_compiled_surface_fixture() {
    let capabilities = native_wgpu_capabilities();
    let ui = capability(&capabilities, "native-wgpu.ui.surface@1");
    let pointer = capability(&capabilities, "native-wgpu.input.pointer@1");
    let frame: Value =
        serde_json::from_str(SHARED_QUI_QSS_SURFACE_FRAME).expect("fixture JSON parses");
    let overlays = frame["view"]["ui"]["overlays"]
        .as_array()
        .expect("fixture overlays");
    let mut fixture = FixtureSurfaceRequirements::default();
    fixture
        .projection_keys
        .insert("view.ui.overlays".to_string());
    fixture.asset_kinds.insert("qui".to_string());
    fixture.asset_kinds.insert("qss".to_string());
    fixture.asset_kinds.insert("tokens".to_string());

    for overlay in overlays {
        let root = &overlay["surface"]["root"];
        collect_surface_requirements(root, &mut fixture);
    }

    assert_requirements_covered(
        "asset kind",
        &fixture.asset_kinds,
        &ui.asset_kinds.iter().cloned().collect(),
    );
    assert_requirements_covered(
        "QSS feature",
        &fixture.qss_features,
        &ui.qss_features.iter().cloned().collect(),
    );
    assert_requirements_covered(
        "QUI component",
        &fixture.qui_components,
        &ui.qui_components.iter().cloned().collect(),
    );
    assert_requirements_covered(
        "projection key",
        &fixture.projection_keys,
        &ui.projection_keys.iter().cloned().collect(),
    );
    assert_requirements_covered(
        "intent event",
        &fixture.intent_events,
        &ui.intent_events.iter().cloned().collect(),
    );
    assert_requirements_covered(
        "pointer intent event",
        &fixture.intent_events,
        &pointer.intent_events.iter().cloned().collect(),
    );

    assert!(fixture.asset_kinds.contains("images"));
    assert!(fixture.asset_kinds.contains("fonts"));
    assert!(fixture.qss_features.contains("background-image"));
    assert!(fixture.qss_features.contains("font-family"));
    assert!(fixture.qui_components.contains("Panel"));
    assert!(fixture.qui_components.contains("Button"));
    assert!(fixture.intent_events.contains("ui/intent"));
}
