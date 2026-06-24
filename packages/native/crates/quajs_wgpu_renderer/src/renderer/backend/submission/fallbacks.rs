use std::collections::BTreeSet;

use crate::render_graph::{
    DrawBatchPipeline, DrawCommand, DrawCommandKind, DrawCommandParams, RenderGraph, RenderPlane,
};

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct NativeRenderFallbackDiagnostic {
    pub command_id: String,
    pub plane: RenderPlane,
    pub pipeline: DrawBatchPipeline,
    pub kind: DrawCommandKind,
    pub reason: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRenderFallbackWarningDiagnostics {
    pub warning_count: usize,
    pub last_warnings: Vec<NativeRenderFallbackDiagnostic>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct NativeRenderFallbackWarningTracker {
    seen: BTreeSet<NativeRenderFallbackDiagnostic>,
    warning_count: usize,
    last_warnings: Vec<NativeRenderFallbackDiagnostic>,
}

impl NativeRenderFallbackWarningTracker {
    pub(crate) fn record_submission(&mut self, diagnostics: &[NativeRenderFallbackDiagnostic]) {
        let mut new_warnings = Vec::new();
        for diagnostic in diagnostics {
            if self.seen.insert(diagnostic.clone()) {
                self.warning_count = self.warning_count.saturating_add(1);
                new_warnings.push(diagnostic.clone());
            }
        }
        self.last_warnings = new_warnings;
    }

    pub(crate) fn diagnostics(&self) -> NativeRenderFallbackWarningDiagnostics {
        NativeRenderFallbackWarningDiagnostics {
            warning_count: self.warning_count,
            last_warnings: self.last_warnings.clone(),
        }
    }
}

pub(super) fn collect_fallback_diagnostics(
    graph: &RenderGraph,
) -> Vec<NativeRenderFallbackDiagnostic> {
    graph
        .commands()
        .iter()
        .filter_map(fallback_diagnostic_for_command)
        .collect()
}

fn fallback_diagnostic_for_command(
    command: &DrawCommand,
) -> Option<NativeRenderFallbackDiagnostic> {
    let reason = fallback_reason(&command.params)?;
    Some(NativeRenderFallbackDiagnostic {
        command_id: command.id.clone(),
        plane: command.plane,
        pipeline: fallback_pipeline(&command.params, command.kind),
        kind: command.kind,
        reason: reason.to_string(),
    })
}

fn fallback_reason(params: &DrawCommandParams) -> Option<&str> {
    match params {
        DrawCommandParams::Video(params) => params.fallback_reason.as_deref(),
        _ => None,
    }
}

fn fallback_pipeline(params: &DrawCommandParams, kind: DrawCommandKind) -> DrawBatchPipeline {
    match params {
        DrawCommandParams::Video(_) => DrawBatchPipeline::Video,
        _ => match kind {
            DrawCommandKind::Clear => DrawBatchPipeline::Clear,
            DrawCommandKind::Image | DrawCommandKind::NineSlice => DrawBatchPipeline::Image,
            DrawCommandKind::Text | DrawCommandKind::RichText => DrawBatchPipeline::Text,
            DrawCommandKind::Rect | DrawCommandKind::RoundedRect => DrawBatchPipeline::Shape,
            DrawCommandKind::ClipStart | DrawCommandKind::ClipEnd => DrawBatchPipeline::Clip,
            DrawCommandKind::VideoFrame => DrawBatchPipeline::Video,
            DrawCommandKind::UiSurface => DrawBatchPipeline::Ui,
            DrawCommandKind::Custom => DrawBatchPipeline::Custom,
        },
    }
}

#[cfg(test)]
mod tests;
