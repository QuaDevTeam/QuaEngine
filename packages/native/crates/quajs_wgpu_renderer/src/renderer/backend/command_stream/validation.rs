use std::collections::BTreeMap;

use crate::render_graph::DrawBatchPipeline;

use super::{
    NativeBackendCommandStreamCommand, NativeBackendCommandStreamPass,
    NativeBackendCommandStreamPlan,
};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeBackendCommandStreamValidationReport {
    pub error_count: usize,
    pub errors: Vec<NativeBackendCommandStreamValidationError>,
}

impl NativeBackendCommandStreamValidationReport {
    pub fn validate(plan: &NativeBackendCommandStreamPlan) -> Self {
        let mut errors = Vec::new();
        for pass in &plan.passes {
            validate_pass(pass, &mut errors);
        }

        Self {
            error_count: errors.len(),
            errors,
        }
    }

    pub fn is_ok(&self) -> bool {
        self.errors.is_empty()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeBackendCommandStreamValidationError {
    pub pass_index: usize,
    pub command_index: usize,
    pub kind: NativeBackendCommandStreamValidationErrorKind,
    pub command_id: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeBackendCommandStreamValidationErrorKind {
    DrawWithoutPipeline,
    DrawPipelineMismatch,
    DrawResourceCountWithoutBinding,
    DrawResourceBindingMismatch,
    BindResourcesWithoutPipeline,
    BindResourcesPipelineMismatch,
    SetClipDepthMismatch,
    ClearClipUnderflow,
    ClearClipDepthMismatch,
    DrawClipDepthExceedsActiveClip,
    ResourceBindWithoutDraw,
    UnclosedClipAtPassEnd,
}

fn validate_pass(
    pass: &NativeBackendCommandStreamPass,
    errors: &mut Vec<NativeBackendCommandStreamValidationError>,
) {
    let mut active_pipeline = None;
    let mut active_clip_depth = 0usize;
    let mut pending_resource_binds = BTreeMap::<String, PendingResourceBind>::new();

    for (command_index, command) in pass.commands.iter().enumerate() {
        match command {
            NativeBackendCommandStreamCommand::SetPipeline { pipeline } => {
                active_pipeline = Some(*pipeline);
            }
            NativeBackendCommandStreamCommand::SetClip { depth, .. } => {
                if *depth != active_clip_depth.saturating_add(1) {
                    errors.push(error(
                        pass.pass_index,
                        command_index,
                        NativeBackendCommandStreamValidationErrorKind::SetClipDepthMismatch,
                        None,
                    ));
                }
                active_clip_depth = active_clip_depth.max(*depth);
            }
            NativeBackendCommandStreamCommand::ClearClip { depth } => {
                if *depth == 0 || *depth > active_clip_depth {
                    errors.push(error(
                        pass.pass_index,
                        command_index,
                        NativeBackendCommandStreamValidationErrorKind::ClearClipUnderflow,
                        None,
                    ));
                } else {
                    if *depth != active_clip_depth {
                        errors.push(error(
                            pass.pass_index,
                            command_index,
                            NativeBackendCommandStreamValidationErrorKind::ClearClipDepthMismatch,
                            None,
                        ));
                    }
                    active_clip_depth = depth.saturating_sub(1);
                }
            }
            NativeBackendCommandStreamCommand::BindResources {
                command_id,
                pipeline,
                resources,
            } => {
                validate_pipeline(
                    pass.pass_index,
                    command_index,
                    command_id,
                    *pipeline,
                    active_pipeline,
                    NativeBackendCommandStreamValidationErrorKind::BindResourcesWithoutPipeline,
                    NativeBackendCommandStreamValidationErrorKind::BindResourcesPipelineMismatch,
                    errors,
                );
                if let Some(previous) = pending_resource_binds.insert(
                    command_id.clone(),
                    PendingResourceBind {
                        pipeline: *pipeline,
                        resource_count: resources.len(),
                        command_index,
                    },
                ) {
                    errors.push(error(
                        pass.pass_index,
                        previous.command_index,
                        NativeBackendCommandStreamValidationErrorKind::ResourceBindWithoutDraw,
                        Some(command_id.clone()),
                    ));
                }
            }
            NativeBackendCommandStreamCommand::Draw {
                command_id,
                pipeline,
                clip_depth,
                resource_count,
                ..
            } => {
                validate_pipeline(
                    pass.pass_index,
                    command_index,
                    command_id,
                    *pipeline,
                    active_pipeline,
                    NativeBackendCommandStreamValidationErrorKind::DrawWithoutPipeline,
                    NativeBackendCommandStreamValidationErrorKind::DrawPipelineMismatch,
                    errors,
                );
                if *clip_depth > active_clip_depth {
                    errors.push(error(
                        pass.pass_index,
                        command_index,
                        NativeBackendCommandStreamValidationErrorKind::DrawClipDepthExceedsActiveClip,
                        Some(command_id.clone()),
                    ));
                }
                match pending_resource_binds.remove(command_id) {
                    Some(binding) => {
                        if binding.pipeline != *pipeline || binding.resource_count != *resource_count
                        {
                            errors.push(error(
                                pass.pass_index,
                                command_index,
                                NativeBackendCommandStreamValidationErrorKind::DrawResourceBindingMismatch,
                                Some(command_id.clone()),
                            ));
                        }
                    }
                    None if *resource_count > 0 => errors.push(error(
                        pass.pass_index,
                        command_index,
                        NativeBackendCommandStreamValidationErrorKind::DrawResourceCountWithoutBinding,
                        Some(command_id.clone()),
                    )),
                    None => {}
                }
            }
            NativeBackendCommandStreamCommand::SkipDraw { .. } => {}
        }
    }

    let mut pending_binds = pending_resource_binds.into_iter().collect::<Vec<_>>();
    pending_binds.sort_by_key(|(_, binding)| binding.command_index);
    for (command_id, binding) in pending_binds {
        errors.push(error(
            pass.pass_index,
            binding.command_index,
            NativeBackendCommandStreamValidationErrorKind::ResourceBindWithoutDraw,
            Some(command_id),
        ));
    }

    if active_clip_depth > 0 {
        errors.push(error(
            pass.pass_index,
            pass.commands.len(),
            NativeBackendCommandStreamValidationErrorKind::UnclosedClipAtPassEnd,
            None,
        ));
    }
}

#[allow(clippy::too_many_arguments)]
fn validate_pipeline(
    pass_index: usize,
    command_index: usize,
    command_id: &str,
    pipeline: DrawBatchPipeline,
    active_pipeline: Option<DrawBatchPipeline>,
    missing_kind: NativeBackendCommandStreamValidationErrorKind,
    mismatch_kind: NativeBackendCommandStreamValidationErrorKind,
    errors: &mut Vec<NativeBackendCommandStreamValidationError>,
) {
    match active_pipeline {
        Some(active) if active == pipeline => {}
        Some(_) => errors.push(error(
            pass_index,
            command_index,
            mismatch_kind,
            Some(command_id.to_string()),
        )),
        None => errors.push(error(
            pass_index,
            command_index,
            missing_kind,
            Some(command_id.to_string()),
        )),
    }
}

fn error(
    pass_index: usize,
    command_index: usize,
    kind: NativeBackendCommandStreamValidationErrorKind,
    command_id: Option<String>,
) -> NativeBackendCommandStreamValidationError {
    NativeBackendCommandStreamValidationError {
        pass_index,
        command_index,
        kind,
        command_id,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct PendingResourceBind {
    pipeline: DrawBatchPipeline,
    resource_count: usize,
    command_index: usize,
}
