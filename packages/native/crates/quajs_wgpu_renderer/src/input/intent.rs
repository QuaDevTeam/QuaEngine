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
        DrawCommandParams::UiButton(params) if params.enabled => params.intent.clone(),
        DrawCommandParams::UiSurface(params) if params.interactive => params.intent.clone(),
        _ => None,
    }
}
