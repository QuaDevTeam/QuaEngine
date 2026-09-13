use crate::resources::ResourceId;

use super::command::{DrawCommand, DrawCommandKind, RenderPlane};
use super::graph::RenderGraph;
use super::style::DrawCommandParams;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum DrawBatchPipeline {
    Clear,
    Image,
    Character,
    Video,
    Text,
    Shape,
    Ui,
    Clip,
    BackdropBlur,
    Custom,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DrawBatchKey {
    pub pipeline: DrawBatchPipeline,
    pub plane: RenderPlane,
    pub kind: DrawCommandKind,
    pub resource_ids: Vec<ResourceId>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DrawBatch {
    pub key: DrawBatchKey,
    pub command_ids: Vec<String>,
}

impl DrawBatch {
    pub fn command_count(&self) -> usize {
        self.command_ids.len()
    }
}

pub fn plan_draw_batches(graph: &RenderGraph) -> Vec<DrawBatch> {
    let mut batches = Vec::<DrawBatch>::new();

    for command in graph.commands() {
        let key = batch_key(command);
        if let Some(last) = batches.last_mut() {
            if last.key == key {
                last.command_ids.push(command.id.clone());
                continue;
            }
        }

        batches.push(DrawBatch {
            key,
            command_ids: vec![command.id.clone()],
        });
    }

    batches
}

fn batch_key(command: &DrawCommand) -> DrawBatchKey {
    DrawBatchKey {
        pipeline: batch_pipeline(command),
        plane: command.plane,
        kind: command.kind,
        resource_ids: command.resource_ids.clone(),
    }
}

fn batch_pipeline(command: &DrawCommand) -> DrawBatchPipeline {
    match &command.params {
        DrawCommandParams::Image(_) => DrawBatchPipeline::Image,
        DrawCommandParams::Video(_) => DrawBatchPipeline::Video,
        DrawCommandParams::Character(_) => DrawBatchPipeline::Character,
        DrawCommandParams::Text(_) => DrawBatchPipeline::Text,
        DrawCommandParams::Panel(_)
        | DrawCommandParams::Shadow(_)
        | DrawCommandParams::Gradient(_) => DrawBatchPipeline::Shape,
        DrawCommandParams::UiButton(_) => DrawBatchPipeline::Ui,
        DrawCommandParams::UiSurface(_) => DrawBatchPipeline::Ui,
        DrawCommandParams::BackdropBlur(_) => DrawBatchPipeline::BackdropBlur,
        DrawCommandParams::None => match command.kind {
            DrawCommandKind::Clear => DrawBatchPipeline::Clear,
            DrawCommandKind::Image | DrawCommandKind::NineSlice => DrawBatchPipeline::Image,
            DrawCommandKind::Text | DrawCommandKind::RichText => DrawBatchPipeline::Text,
            DrawCommandKind::Rect | DrawCommandKind::RoundedRect => DrawBatchPipeline::Shape,
            DrawCommandKind::ClipStart | DrawCommandKind::ClipEnd => DrawBatchPipeline::Clip,
            DrawCommandKind::VideoFrame => DrawBatchPipeline::Video,
            DrawCommandKind::UiSurface => DrawBatchPipeline::Ui,
            DrawCommandKind::BackdropBlur => DrawBatchPipeline::BackdropBlur,
            DrawCommandKind::Custom => DrawBatchPipeline::Custom,
        },
    }
}

#[cfg(test)]
mod tests;
