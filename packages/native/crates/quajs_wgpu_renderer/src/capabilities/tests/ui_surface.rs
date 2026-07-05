use serde_json::Value;
use std::collections::BTreeSet;

use super::support::{
    assert_requirements_covered, capability, collect_surface_requirements,
    native_wgpu_capabilities, FixtureSurfaceRequirements, SHARED_QUI_QSS_SURFACE_FRAME,
};

#[test]
fn ui_surface_capability_matches_foundational_qui_qss_subset() {
    let capabilities = native_wgpu_capabilities();
    let ui = capability(&capabilities, "native-wgpu.ui.surface@1");

    assert_eq!(ui.fallback, "reject-package");
    assert_eq!(
        ui.intent_events.iter().cloned().collect::<BTreeSet<_>>(),
        BTreeSet::from(["choice/select".to_string(), "ui/intent".to_string()])
    );
    assert_eq!(
        ui.asset_kinds.iter().cloned().collect::<BTreeSet<_>>(),
        string_set(&["data", "fonts", "images", "qss", "qui", "tokens"])
    );
    assert_eq!(
        ui.qss_features.iter().cloned().collect::<BTreeSet<_>>(),
        string_set(&[
            "align-items",
            "background-color",
            "background-image",
            "background-position",
            "background-size",
            "border-color",
            "border-radius",
            "border-style",
            "border-width",
            "bottom",
            "box-sizing",
            "color",
            "column-gap",
            "display",
            "font-family",
            "font-size",
            "font-style",
            "font-weight",
            "gap",
            "height",
            "inset",
            "justify-content",
            "left",
            "letter-spacing",
            "line-height",
            "margin",
            "margin-bottom",
            "margin-left",
            "margin-right",
            "margin-top",
            "max-height",
            "max-width",
            "min-height",
            "min-width",
            "object-fit",
            "opacity",
            "overflow",
            "padding",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
            "position",
            "right",
            "row-gap",
            "text-align",
            "text-decoration",
            "text-overflow",
            "text-transform",
            "top",
            "visibility",
            "white-space",
            "width",
            "z-index",
        ])
    );
    assert_eq!(
        ui.qui_components.iter().cloned().collect::<BTreeSet<_>>(),
        string_set(&[
            "Backdrop", "Box", "Button", "Column", "Divider", "Fragment", "Grid", "Image", "Layer",
            "Panel", "RichText", "Row", "SafeArea", "Scroll", "Spacer", "Stack", "Text",
        ])
    );
    assert!(!ui.intent_events.contains(&"save/select".to_string()));
    assert!(!ui.intent_events.contains(&"settings/change".to_string()));
    assert!(!ui.qss_features.contains(&"flex-direction".to_string()));
    assert!(!ui.qui_components.contains(&"Dialog".to_string()));
    assert!(!ui.qui_components.contains(&"Drawer".to_string()));
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

fn string_set(values: &[&str]) -> BTreeSet<String> {
    values.iter().map(|value| value.to_string()).collect()
}
