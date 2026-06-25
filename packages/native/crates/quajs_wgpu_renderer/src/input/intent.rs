use std::collections::BTreeMap;

use quajs_native_runtime::NativeRendererIntent;
use serde_json::Value;

use crate::render_graph::{DrawCommand, DrawCommandParams, RenderGraph, RendererIntent};

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
    let mut payload: BTreeMap<String, Value> = intent.metadata.clone();

    if let Some(action) = intent.action.as_deref() {
        payload.insert("action".to_string(), Value::String(action.to_string()));
    }
    if let Some(choice_id) = intent.choice_id.as_deref() {
        payload.insert("choiceId".to_string(), Value::String(choice_id.to_string()));
    }
    if let Some(element_id) = intent.element_id.as_deref() {
        payload.insert(
            "elementId".to_string(),
            Value::String(element_id.to_string()),
        );
    }

    if payload.is_empty() {
        return None;
    }

    Some(serde_json::to_string(&payload).expect("renderer intent payload is JSON object"))
}
