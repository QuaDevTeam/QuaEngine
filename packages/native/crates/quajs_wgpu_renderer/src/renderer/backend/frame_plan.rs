use super::{
    NativeBackendCommandStreamPlan, NativeBackendDrawPlan, NativeBackendEncoderPlan,
    NativeBackendExecutionReport, NativeRenderFrameRef, NativeRenderSubmission,
};
use crate::resources::NativeResourceLedger;

#[derive(Clone, Debug, PartialEq)]
pub struct NativeBackendFramePlan {
    pub submission: NativeRenderSubmission,
    pub draw_plan: NativeBackendDrawPlan,
    pub encoder_plan: NativeBackendEncoderPlan,
    pub command_stream_plan: NativeBackendCommandStreamPlan,
    pub execution_report: NativeBackendExecutionReport,
}

impl NativeBackendFramePlan {
    pub fn from_frame(frame: NativeRenderFrameRef<'_>) -> Self {
        let submission = frame.submission();
        Self::from_submission_and_resources(submission, frame.resources)
    }

    pub fn from_submission_and_resources(
        submission: NativeRenderSubmission,
        resources: &NativeResourceLedger,
    ) -> Self {
        let draw_plan =
            NativeBackendDrawPlan::from_submission_and_resources(&submission, resources);
        let encoder_plan = NativeBackendEncoderPlan::from_draw_plan(&draw_plan);
        let command_stream_plan = NativeBackendCommandStreamPlan::from_encoder_plan(&encoder_plan);
        let execution_report =
            NativeBackendExecutionReport::from_command_stream_plan(&command_stream_plan);

        Self {
            submission,
            draw_plan,
            encoder_plan,
            command_stream_plan,
            execution_report,
        }
    }
}
