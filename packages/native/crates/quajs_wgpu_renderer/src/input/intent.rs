use std::collections::BTreeMap;

use quajs_native_runtime::NativeRendererIntent;
use serde_json::Value;

use crate::projection::common::is_safe_native_dispatch_identifier;
use crate::render_graph::{DrawCommand, DrawCommandParams, RenderGraph, RendererIntent};
use crate::renderer::json_validation::is_valid_native_ui_intent_metadata_payload;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RendererIntentHit {
    pub command_id: String,
    pub intent: RendererIntent,
}

pub fn resolve_renderer_intent_at(
    graph: &RenderGraph,
    logical_x: f64,
    logical_y: f64,
) -> Option<RendererIntentHit> {
    let command = graph.hit_test(logical_x, logical_y)?;
    renderer_intent_from_command(command).map(|intent| RendererIntentHit {
        command_id: command.id.clone(),
        intent,
    })
}

pub fn renderer_intent_from_command(command: &DrawCommand) -> Option<RendererIntent> {
    match &command.params {
        DrawCommandParams::Panel(params) if command.interactive => params.intent.clone(),
        DrawCommandParams::UiButton(params) if params.enabled => params.intent.clone(),
        DrawCommandParams::UiSurface(params) if params.interactive => params.intent.clone(),
        _ => None,
    }
}

pub fn native_renderer_intent_from_hit(hit: &RendererIntentHit) -> NativeRendererIntent {
    native_renderer_intent_from_renderer_intent(&hit.intent)
}

pub fn native_renderer_intent_from_renderer_intent(
    intent: &RendererIntent,
) -> NativeRendererIntent {
    NativeRendererIntent {
        r#type: intent.event.clone(),
        payload_json: native_renderer_intent_payload_json(intent),
    }
}

fn native_renderer_intent_payload_json(intent: &RendererIntent) -> Option<String> {
    let canonical_payload = native_renderer_intent_canonical_payload(intent);
    let mut payload = if is_valid_native_ui_intent_metadata_payload(&intent.metadata) {
        intent.metadata.clone()
    } else {
        BTreeMap::new()
    };
    remove_reserved_canonical_payload_fields(&mut payload);
    payload.extend(canonical_payload.clone());

    payload_to_json_if_within_limits(&payload)
        .or_else(|| payload_to_json_if_within_limits(&canonical_payload))
}

fn native_renderer_intent_canonical_payload(intent: &RendererIntent) -> BTreeMap<String, Value> {
    let mut payload = BTreeMap::new();
    insert_safe_canonical_payload_field(&mut payload, "action", intent.action.as_deref());
    insert_safe_canonical_payload_field(&mut payload, "choiceId", intent.choice_id.as_deref());
    insert_safe_canonical_payload_field(&mut payload, "elementId", intent.element_id.as_deref());
    payload
}

fn insert_safe_canonical_payload_field(
    payload: &mut BTreeMap<String, Value>,
    key: &str,
    value: Option<&str>,
) {
    if let Some(value) = value.filter(|value| is_safe_native_dispatch_identifier(value)) {
        payload.insert(key.to_string(), Value::String(value.to_string()));
    }
}

fn remove_reserved_canonical_payload_fields(payload: &mut BTreeMap<String, Value>) {
    for key in ["action", "choiceId", "elementId"] {
        payload.remove(key);
    }
}

fn payload_to_json_if_within_limits(payload: &BTreeMap<String, Value>) -> Option<String> {
    if payload.is_empty() || !is_valid_native_ui_intent_metadata_payload(payload) {
        return None;
    }

    Some(serde_json::to_string(payload).expect("renderer intent payload is JSON object"))
}
