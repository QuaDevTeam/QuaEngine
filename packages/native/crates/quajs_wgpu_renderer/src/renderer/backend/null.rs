use super::submission::NativeRenderFallbackWarningTracker;
use super::{
    NativeBackendCommandStreamPlan, NativeBackendDrawPlan, NativeBackendEncoderPlan,
    NativeBackendExecutionReport, NativeBackendFramePlan, NativeRenderBackend,
    NativeRenderBackendResourceDiagnostics, NativeRenderBackendResourcePolicy,
    NativeRenderBackendResult, NativeRenderFallbackWarningDiagnostics, NativeRenderFrameRef,
    NativeRenderSubmission,
};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NullNativeRenderBackend {
    submissions: Vec<NativeRenderSubmission>,
    draw_plans: Vec<NativeBackendDrawPlan>,
    encoder_plans: Vec<NativeBackendEncoderPlan>,
    command_stream_plans: Vec<NativeBackendCommandStreamPlan>,
    execution_reports: Vec<NativeBackendExecutionReport>,
    resource_policy: NativeRenderBackendResourcePolicy,
    fallback_warnings: NativeRenderFallbackWarningTracker,
}

impl NullNativeRenderBackend {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_resource_policy(resource_policy: NativeRenderBackendResourcePolicy) -> Self {
        Self {
            submissions: Vec::new(),
            draw_plans: Vec::new(),
            encoder_plans: Vec::new(),
            command_stream_plans: Vec::new(),
            execution_reports: Vec::new(),
            resource_policy,
            fallback_warnings: NativeRenderFallbackWarningTracker::default(),
        }
    }

    pub fn resource_policy(&self) -> NativeRenderBackendResourcePolicy {
        self.resource_policy
    }

    pub fn submissions(&self) -> &[NativeRenderSubmission] {
        &self.submissions
    }

    pub fn last_submission(&self) -> Option<&NativeRenderSubmission> {
        self.submissions.last()
    }

    pub fn draw_plans(&self) -> &[NativeBackendDrawPlan] {
        &self.draw_plans
    }

    pub fn last_draw_plan(&self) -> Option<&NativeBackendDrawPlan> {
        self.draw_plans.last()
    }

    pub fn encoder_plans(&self) -> &[NativeBackendEncoderPlan] {
        &self.encoder_plans
    }

    pub fn last_encoder_plan(&self) -> Option<&NativeBackendEncoderPlan> {
        self.encoder_plans.last()
    }

    pub fn command_stream_plans(&self) -> &[NativeBackendCommandStreamPlan] {
        &self.command_stream_plans
    }

    pub fn last_command_stream_plan(&self) -> Option<&NativeBackendCommandStreamPlan> {
        self.command_stream_plans.last()
    }

    pub fn execution_reports(&self) -> &[NativeBackendExecutionReport] {
        &self.execution_reports
    }

    pub fn last_execution_report(&self) -> Option<&NativeBackendExecutionReport> {
        self.execution_reports.last()
    }

    pub fn diagnostics(&self) -> NullNativeRenderBackendDiagnostics {
        NullNativeRenderBackendDiagnostics {
            submitted_frames: self.submissions.len(),
            resources: NativeRenderBackendResourceDiagnostics::from_submissions(&self.submissions),
            fallback_warnings: self.fallback_warnings.diagnostics(),
            last_submission: self.last_submission().cloned(),
            last_draw_plan: self.last_draw_plan().cloned(),
            last_encoder_plan: self.last_encoder_plan().cloned(),
            last_command_stream_plan: self.last_command_stream_plan().cloned(),
            last_execution_report: self.last_execution_report().cloned(),
        }
    }
}

impl NativeRenderBackend for NullNativeRenderBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
        let submission = frame.submission();
        self.resource_policy.validate_submission(&submission)?;
        let frame_plan =
            NativeBackendFramePlan::from_submission_and_resources(submission, frame.resources);
        self.fallback_warnings
            .record_submission(&frame_plan.submission.fallback_diagnostics);
        self.submissions.push(frame_plan.submission.clone());
        self.draw_plans.push(frame_plan.draw_plan);
        self.encoder_plans.push(frame_plan.encoder_plan);
        self.command_stream_plans
            .push(frame_plan.command_stream_plan);
        self.execution_reports.push(frame_plan.execution_report);
        Ok(frame_plan.submission)
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NullNativeRenderBackendDiagnostics {
    pub submitted_frames: usize,
    pub resources: NativeRenderBackendResourceDiagnostics,
    pub fallback_warnings: NativeRenderFallbackWarningDiagnostics,
    pub last_submission: Option<NativeRenderSubmission>,
    pub last_draw_plan: Option<NativeBackendDrawPlan>,
    pub last_encoder_plan: Option<NativeBackendEncoderPlan>,
    pub last_command_stream_plan: Option<NativeBackendCommandStreamPlan>,
    pub last_execution_report: Option<NativeBackendExecutionReport>,
}

#[cfg(test)]
mod tests;
