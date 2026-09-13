use serde_json::Value;
use std::collections::BTreeSet;

pub(super) use crate::capabilities::native_wgpu_capabilities;

pub(super) const SHARED_QUI_QSS_SURFACE_FRAME: &str =
    include_str!("../../../../../test-fixtures/renderer/qui-qss-surface-frame.json");

#[derive(Default)]
pub(super) struct FixtureSurfaceRequirements {
    pub(super) asset_kinds: BTreeSet<String>,
    pub(super) intent_events: BTreeSet<String>,
    pub(super) projection_keys: BTreeSet<String>,
    pub(super) qss_features: BTreeSet<String>,
    pub(super) qui_components: BTreeSet<String>,
}

pub(super) fn collect_surface_requirements(
    node: &Value,
    requirements: &mut FixtureSurfaceRequirements,
) {
    let Some(kind) = node["kind"].as_str() else {
        return;
    };
    requirements.qui_components.insert(kind.to_string());

    if let Some(style) = node["style"].as_object() {
        for key in style.keys() {
            requirements.qss_features.insert(camel_to_kebab(key));
        }
        if let Some(background_image) = style.get("backgroundImage").and_then(Value::as_object) {
            if let Some(asset_type) = background_image.get("assetType").and_then(Value::as_str) {
                requirements.asset_kinds.insert(asset_type.to_string());
            }
        }
        if style.contains_key("fontFamily") {
            requirements.asset_kinds.insert("fonts".to_string());
        }
    }

    if node.get("zIndex").is_some() {
        requirements.qss_features.insert("z-index".to_string());
    }

    if let Some(image) = node["image"].as_object() {
        if let Some(asset_type) = image.get("assetType").and_then(Value::as_str) {
            requirements.asset_kinds.insert(asset_type.to_string());
        }
    }

    if let Some(event) = node["intent"]["event"].as_str() {
        requirements.intent_events.insert(event.to_string());
    }

    if let Some(children) = node["children"].as_array() {
        for child in children {
            collect_surface_requirements(child, requirements);
        }
    }
}

pub(super) fn assert_requirements_covered(
    label: &str,
    required: &BTreeSet<String>,
    available: &BTreeSet<String>,
) {
    let missing = required.difference(available).cloned().collect::<Vec<_>>();
    assert!(
        missing.is_empty(),
        "missing {label} requirements from native capabilities: {missing:?}"
    );
}

pub(super) fn capability<'a>(
    capabilities: &'a [quajs_native_runtime::RendererCapability],
    id: &str,
) -> &'a quajs_native_runtime::RendererCapability {
    capabilities
        .iter()
        .find(|capability| capability.id == id)
        .unwrap()
}

fn camel_to_kebab(value: &str) -> String {
    let mut converted = String::with_capacity(value.len());
    for character in value.chars() {
        if character.is_uppercase() {
            converted.push('-');
            converted.extend(character.to_lowercase());
        } else {
            converted.push(character);
        }
    }
    converted
}
