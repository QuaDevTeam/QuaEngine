use std::fmt::{Display, Formatter};

use quajs_native_runtime::{InMemoryNativeHostApi, NativeHostApi};

use crate::product_frame_scheduler::{
    NativeProductFrameAttempt, NativeProductFramePresentFailureAction, NativeProductFrameScheduler,
    NativeProductSurfaceRecoveryMetrics, NativeProductSurfaceRecoveryStatus,
};
use crate::product_loop::NativeProductLoopFrameResult;
use crate::product_window::{
    NativeProductWindowError, NativeProductWindowPhysicalSize, NativeProductWindowPresentFailure,
    NativeProductWindowPresentFailureKind, NativeProductWindowPresentOutcome,
    NativeProductWindowRenderer, NativeProductWindowResizeState, NativeProductWindowRuntime,
};
use crate::texture_sync::{
    NativeTextureBundleLifecycleSyncReport, NativeTextureCleanedClearResult,
};

pub(crate) type NativeProductWindowInMemoryLoop = NativeProductWindowLoop<InMemoryNativeHostApi>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativeProductWindowLoopFailureAction {
    RetryRedraw,
    Fail,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductWindowLoopFailureReport {
    pub(crate) action: NativeProductWindowLoopFailureAction,
    pub(crate) surface_recovery_status: NativeProductSurfaceRecoveryStatus,
}

impl NativeProductWindowLoopFailureReport {
    fn retry_redraw(surface_recovery_status: NativeProductSurfaceRecoveryStatus) -> Self {
        Self {
            action: NativeProductWindowLoopFailureAction::RetryRedraw,
            surface_recovery_status,
        }
    }

    fn fail(surface_recovery_status: NativeProductSurfaceRecoveryStatus) -> Self {
        Self {
            action: NativeProductWindowLoopFailureAction::Fail,
            surface_recovery_status,
        }
    }
}

#[derive(Debug)]
pub(crate) struct NativeProductWindowLoopFrameResult {
    pub(crate) product_frame: NativeProductLoopFrameResult,
    pub(crate) present_outcome: NativeProductWindowPresentOutcome,
    pub(crate) shutdown: Option<NativeTextureCleanedClearResult>,
}

#[derive(Debug)]
pub(crate) struct NativeProductWindowLoopError {
    message: String,
    present_failure: Option<NativeProductWindowPresentFailure>,
    product_frame: Option<NativeProductLoopFrameResult>,
}

impl NativeProductWindowLoopError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            present_failure: None,
            product_frame: None,
        }
    }

    fn with_product_frame(
        message: impl Into<String>,
        product_frame: NativeProductLoopFrameResult,
    ) -> Self {
        Self {
            message: message.into(),
            present_failure: None,
            product_frame: Some(product_frame),
        }
    }

    fn from_present_error(
        error: NativeProductWindowError,
        product_frame: NativeProductLoopFrameResult,
    ) -> Self {
        let present_failure = error.present_failure().cloned();
        Self {
            message: error.to_string(),
            present_failure,
            product_frame: Some(product_frame),
        }
    }

    pub(crate) fn present_failure(&self) -> Option<&NativeProductWindowPresentFailure> {
        self.present_failure.as_ref()
    }

    pub(crate) fn product_frame(&self) -> Option<&NativeProductLoopFrameResult> {
        self.product_frame.as_ref()
    }
}

impl Display for NativeProductWindowLoopError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for NativeProductWindowLoopError {}

#[derive(Clone, Debug, PartialEq, Eq)]
struct NativeProductWindowLoopState {
    frame_scheduler: NativeProductFrameScheduler,
    resize_state: NativeProductWindowResizeState,
    completed_frame_count: usize,
    last_present_failure_kind: Option<NativeProductWindowPresentFailureKind>,
    shutdown_after_next_frame: bool,
}

impl NativeProductWindowLoopState {
    fn new(target_frame_count: usize) -> Self {
        Self {
            frame_scheduler: NativeProductFrameScheduler::new(target_frame_count),
            resize_state: NativeProductWindowResizeState::default(),
            completed_frame_count: 0,
            last_present_failure_kind: None,
            shutdown_after_next_frame: false,
        }
    }

    fn target_frame_count(&self) -> usize {
        self.frame_scheduler.target_frame_count()
    }

    fn present_attempt_count(&self) -> usize {
        self.frame_scheduler.attempt_count()
    }

    fn surface_recovery_count(&self) -> usize {
        self.frame_scheduler.surface_recovery_count()
    }

    fn device_recovery_count(&self) -> usize {
        self.frame_scheduler.device_recovery_count()
    }

    fn recovery_metrics(&self) -> NativeProductSurfaceRecoveryMetrics {
        self.frame_scheduler.recovery_metrics()
    }

    fn last_present_failure_kind(&self) -> Option<NativeProductWindowPresentFailureKind> {
        self.last_present_failure_kind
    }

    fn resize_count(&self) -> usize {
        self.resize_state.count()
    }

    fn last_resize_physical_size(&self) -> Option<NativeProductWindowPhysicalSize> {
        self.resize_state.last_physical_size()
    }

    fn needs_more_frames(&self) -> bool {
        self.frame_scheduler
            .needs_more_frames(self.completed_frame_count)
    }

    fn begin_present_attempt(&mut self) -> NativeProductFrameAttempt {
        self.frame_scheduler.begin_present_attempt()
    }

    fn record_completed_frame(&mut self) {
        self.completed_frame_count = self.completed_frame_count.saturating_add(1);
    }

    fn request_shutdown_after_next_frame(&mut self) {
        self.shutdown_after_next_frame = true;
    }

    fn record_resize(&mut self, physical_size: NativeProductWindowPhysicalSize) {
        self.resize_state
            .record_resize(crate::product_window::NativeProductWindowResizeReport {
                physical_size,
            });
    }

    fn record_surface_recovery_attempt(&mut self) {
        self.frame_scheduler.record_surface_recovery_attempt();
    }

    fn record_surface_recovery_success(&mut self) {
        self.frame_scheduler.record_surface_recovery_success();
    }

    fn record_surface_recovery_missing_size(&mut self) {
        self.frame_scheduler.record_surface_recovery_missing_size();
    }

    fn record_surface_recovery_error(&mut self) {
        self.frame_scheduler.record_surface_recovery_error();
    }

    fn record_device_recovery_attempt(&mut self) {
        self.frame_scheduler.record_device_recovery_attempt();
    }

    fn record_device_recovery_success(&mut self) {
        self.frame_scheduler.record_device_recovery_success();
    }

    fn record_device_recovery_missing_size(&mut self) {
        self.frame_scheduler.record_device_recovery_missing_size();
    }

    fn record_device_recovery_error(&mut self) {
        self.frame_scheduler.record_device_recovery_error();
    }

    fn classify_redraw_failure(
        &mut self,
        failure: &NativeProductWindowPresentFailure,
    ) -> NativeProductFramePresentFailureAction {
        let failure_kind = failure.frame_failure_kind();
        let action = self.frame_scheduler.classify_present_failure(failure_kind);
        self.frame_scheduler
            .record_present_failure(failure_kind, action);
        self.last_present_failure_kind = Some(failure.kind());
        action
    }
}

#[derive(Debug)]
pub(crate) struct NativeProductWindowLoop<H> {
    runtime: NativeProductWindowRuntime<H>,
    state: NativeProductWindowLoopState,
}

impl<H> NativeProductWindowLoop<H>
where
    H: NativeHostApi,
{
    pub(crate) fn new(runtime: NativeProductWindowRuntime<H>, target_frame_count: usize) -> Self {
        Self {
            runtime,
            state: NativeProductWindowLoopState::new(target_frame_count),
        }
    }

    pub(crate) fn runtime(&self) -> &NativeProductWindowRuntime<H> {
        &self.runtime
    }

    pub(crate) fn runtime_mut(&mut self) -> &mut NativeProductWindowRuntime<H> {
        &mut self.runtime
    }

    pub(crate) fn target_frame_count(&self) -> usize {
        self.state.target_frame_count()
    }

    pub(crate) fn present_attempt_count(&self) -> usize {
        self.state.present_attempt_count()
    }

    pub(crate) fn surface_recovery_count(&self) -> usize {
        self.state.surface_recovery_count()
    }

    pub(crate) fn device_recovery_count(&self) -> usize {
        self.state.device_recovery_count()
    }

    pub(crate) fn recovery_metrics(&self) -> NativeProductSurfaceRecoveryMetrics {
        self.state.recovery_metrics()
    }

    pub(crate) fn last_present_failure_kind(
        &self,
    ) -> Option<NativeProductWindowPresentFailureKind> {
        self.state.last_present_failure_kind()
    }

    pub(crate) fn resize_count(&self) -> usize {
        self.state.resize_count()
    }

    pub(crate) fn last_resize_physical_size(&self) -> Option<NativeProductWindowPhysicalSize> {
        self.state.last_resize_physical_size()
    }

    pub(crate) fn needs_more_frames(&self) -> bool {
        self.state.needs_more_frames()
    }

    pub(crate) fn request_shutdown_after_next_frame(&mut self) {
        self.state.request_shutdown_after_next_frame();
    }

    pub(crate) fn render_projection_json_frame<F, E, A, AE>(
        &mut self,
        input: &str,
        before_present: F,
        after_present: A,
    ) -> Result<NativeProductWindowLoopFrameResult, NativeProductWindowLoopError>
    where
        F: FnOnce(&mut NativeProductWindowRenderer, &mut H) -> Result<(), E>,
        E: Display,
        A: FnOnce(&NativeProductWindowRuntime<H>) -> Result<(), AE>,
        AE: Display,
    {
        let attempt = self.state.begin_present_attempt();
        let product_frame = self
            .runtime
            .render_projection_json_with_media_teardown(input)
            .map_err(|error| {
                NativeProductWindowLoopError::new(format!(
                    "native product window projection frame failed: {error}"
                ))
            })?;
        {
            let (renderer, host) = self.runtime.renderer_and_host_mut();
            before_present(renderer, host).map_err(|error| {
                NativeProductWindowLoopError::with_product_frame(
                    format!("native product window before-present hook failed: {error}"),
                    product_frame.clone(),
                )
            })?;
        }
        let present_outcome = self
            .runtime
            .present_frame(attempt.allow_occluded_report)
            .map_err(|error| {
                NativeProductWindowLoopError::from_present_error(error, product_frame.clone())
            })?;
        if present_outcome.surface_refresh_recommended {
            let state = &mut self.state;
            let runtime = &mut self.runtime;
            Self::refresh_presented_surface_with_recovery(state, || {
                runtime
                    .refresh_surface_configuration()
                    .map(|report| report.physical_size)
            })
            .map_err(|error| {
                NativeProductWindowLoopError::new(format!(
                    "native product window suboptimal surface refresh failed: {error}"
                ))
            })?;
        }
        after_present(&self.runtime).map_err(|error| {
            NativeProductWindowLoopError::with_product_frame(
                format!("native product window after-present hook failed: {error}"),
                product_frame.clone(),
            )
        })?;
        let will_complete_target =
            self.state.completed_frame_count.saturating_add(1) >= self.state.target_frame_count()
                || self.state.shutdown_after_next_frame;
        let shutdown = if will_complete_target {
            Some(
                self.runtime
                    .shutdown_with_media_teardown()
                    .map_err(|error| {
                        NativeProductWindowLoopError::new(format!(
                            "native product window shutdown failed: {error}"
                        ))
                    })?,
            )
        } else {
            None
        };
        self.state.record_completed_frame();

        Ok(NativeProductWindowLoopFrameResult {
            product_frame,
            present_outcome,
            shutdown,
        })
    }

    pub(crate) fn resize_to_physical_size(
        &mut self,
        physical_size: NativeProductWindowPhysicalSize,
    ) -> Result<(), NativeProductWindowError> {
        let report = self.runtime.resize_to_physical_size(physical_size)?;
        self.state.record_resize(report.physical_size);
        Ok(())
    }

    pub(crate) fn tick_host_lifecycle_with_media_teardown(
        &mut self,
    ) -> Result<NativeTextureBundleLifecycleSyncReport, NativeProductWindowLoopError> {
        self.runtime
            .tick_host_lifecycle_with_media_teardown()
            .map_err(|error| {
                NativeProductWindowLoopError::new(format!(
                    "native product window lifecycle tick failed: {error}"
                ))
            })
    }

    pub(crate) fn handle_redraw_failure(
        &mut self,
        failure: &NativeProductWindowPresentFailure,
        recovery_size: Option<NativeProductWindowPhysicalSize>,
    ) -> Result<NativeProductWindowLoopFailureReport, NativeProductWindowError> {
        let state = &mut self.state;
        let runtime = &mut self.runtime;
        Self::handle_redraw_failure_with_recovery(
            state,
            failure,
            recovery_size,
            |action, physical_size| match action {
                NativeProductFramePresentFailureAction::RecoverSurface => runtime
                    .resize_to_physical_size(physical_size)
                    .map(|report| report.physical_size),
                NativeProductFramePresentFailureAction::RecoverDevice => runtime
                    .recover_device_for_physical_size(physical_size)
                    .map(|report| report.physical_size),
                _ => unreachable!("non-recovery present failure actions must not recover"),
            },
        )
    }

    fn handle_redraw_failure_with_recovery<F>(
        state: &mut NativeProductWindowLoopState,
        failure: &NativeProductWindowPresentFailure,
        recovery_size: Option<NativeProductWindowPhysicalSize>,
        mut recover: F,
    ) -> Result<NativeProductWindowLoopFailureReport, NativeProductWindowError>
    where
        F: FnMut(
            NativeProductFramePresentFailureAction,
            NativeProductWindowPhysicalSize,
        ) -> Result<NativeProductWindowPhysicalSize, NativeProductWindowError>,
    {
        match state.classify_redraw_failure(failure) {
            NativeProductFramePresentFailureAction::RetryRedraw => {
                Ok(NativeProductWindowLoopFailureReport::retry_redraw(
                    NativeProductSurfaceRecoveryStatus::NotAttempted,
                ))
            }
            NativeProductFramePresentFailureAction::RecoverSurface => {
                state.record_surface_recovery_attempt();
                let Some(physical_size) = recovery_size else {
                    state.record_surface_recovery_missing_size();
                    return Ok(NativeProductWindowLoopFailureReport::fail(
                        NativeProductSurfaceRecoveryStatus::MissingSize,
                    ));
                };
                let resized_physical_size = match recover(
                    NativeProductFramePresentFailureAction::RecoverSurface,
                    physical_size,
                ) {
                    Ok(resized_physical_size) => resized_physical_size,
                    Err(error) => {
                        state.record_surface_recovery_error();
                        return Err(error);
                    }
                };
                state.record_resize(resized_physical_size);
                state.record_surface_recovery_success();
                Ok(NativeProductWindowLoopFailureReport::retry_redraw(
                    NativeProductSurfaceRecoveryStatus::Reconfigured,
                ))
            }
            NativeProductFramePresentFailureAction::RecoverDevice => {
                state.record_device_recovery_attempt();
                let Some(physical_size) = recovery_size else {
                    state.record_device_recovery_missing_size();
                    return Ok(NativeProductWindowLoopFailureReport::fail(
                        NativeProductSurfaceRecoveryStatus::MissingSize,
                    ));
                };
                let recovered_physical_size = match recover(
                    NativeProductFramePresentFailureAction::RecoverDevice,
                    physical_size,
                ) {
                    Ok(recovered_physical_size) => recovered_physical_size,
                    Err(error) => {
                        state.record_device_recovery_error();
                        return Err(error);
                    }
                };
                state.record_resize(recovered_physical_size);
                state.record_device_recovery_success();
                Ok(NativeProductWindowLoopFailureReport::retry_redraw(
                    NativeProductSurfaceRecoveryStatus::DeviceRebuilt,
                ))
            }
            NativeProductFramePresentFailureAction::Fail => {
                Ok(NativeProductWindowLoopFailureReport::fail(
                    NativeProductSurfaceRecoveryStatus::NotAttempted,
                ))
            }
        }
    }

    fn refresh_presented_surface_with_recovery<F>(
        state: &mut NativeProductWindowLoopState,
        mut refresh_surface: F,
    ) -> Result<(), NativeProductWindowError>
    where
        F: FnMut() -> Result<NativeProductWindowPhysicalSize, NativeProductWindowError>,
    {
        state.record_surface_recovery_attempt();
        let refreshed_physical_size = match refresh_surface() {
            Ok(physical_size) => physical_size,
            Err(error) => {
                state.record_surface_recovery_error();
                return Err(error);
            }
        };
        state.record_resize(refreshed_physical_size);
        state.record_surface_recovery_success();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_tracks_completed_frames_separately_from_present_attempts() {
        let mut state = NativeProductWindowLoopState::new(2);

        assert!(state.needs_more_frames());
        state.begin_present_attempt();
        state.begin_present_attempt();
        assert!(state.needs_more_frames());

        state.record_completed_frame();
        assert!(state.needs_more_frames());
        state.record_completed_frame();
        assert!(!state.needs_more_frames());
        assert_eq!(state.present_attempt_count(), 2);
    }

    #[test]
    fn state_classifies_recoverable_surface_failures_until_final_attempt() {
        let mut state = NativeProductWindowLoopState::new(1);
        state.begin_present_attempt();
        let failure = NativeProductWindowPresentFailure::from_message(
            "native product window surface present failed: surface was lost",
        );

        assert_eq!(
            state.classify_redraw_failure(&failure),
            NativeProductFramePresentFailureAction::RecoverSurface,
        );
        assert_eq!(
            state.last_present_failure_kind(),
            Some(NativeProductWindowPresentFailureKind::Lost)
        );
    }

    #[test]
    fn state_records_resize_and_surface_recovery_metrics() {
        let mut state = NativeProductWindowLoopState::new(1);

        state.record_resize(NativeProductWindowPhysicalSize::new(800, 600));
        state.record_surface_recovery_attempt();
        state.record_surface_recovery_success();

        assert_eq!(state.resize_count(), 1);
        assert_eq!(
            state.last_resize_physical_size(),
            Some(NativeProductWindowPhysicalSize::new(800, 600))
        );
        assert_eq!(state.surface_recovery_count(), 1);
        assert_eq!(state.recovery_metrics().surface_recovery_attempt_count, 1);
        assert_eq!(state.recovery_metrics().surface_recovery_success_count, 1);
    }

    #[test]
    fn state_records_redraw_failure_classification_metrics() {
        let mut state = NativeProductWindowLoopState::new(1);
        state.begin_present_attempt();
        let failure = NativeProductWindowPresentFailure::from_message(
            "native product window surface present failed: surface configuration is outdated",
        );

        assert_eq!(
            state.classify_redraw_failure(&failure),
            NativeProductFramePresentFailureAction::RecoverSurface,
        );

        let metrics = state.recovery_metrics();
        assert_eq!(metrics.present_failure_count, 1);
        assert_eq!(metrics.recoverable_surface_failure_count, 1);
        assert_eq!(
            metrics.last_present_failure_kind.map(|kind| kind.label()),
            Some("recoverable-surface")
        );
        assert_eq!(
            metrics.last_recovery_action.map(|action| action.label()),
            Some("recover-surface")
        );
        assert_eq!(
            state.last_present_failure_kind().map(|kind| kind.label()),
            Some("outdated")
        );
    }

    #[test]
    fn redraw_failure_report_retries_occluded_without_surface_recovery() {
        let mut state = NativeProductWindowLoopState::new(1);
        state.begin_present_attempt();
        let failure = NativeProductWindowPresentFailure::from_message(
            "native product window surface present failed: surface is occluded",
        );

        let report =
            NativeProductWindowLoop::<InMemoryNativeHostApi>::handle_redraw_failure_with_recovery(
                &mut state,
                &failure,
                None,
                |_, _| unreachable!("occluded redraw retry must not attempt recovery"),
            )
            .expect("occluded redraw retry should produce a retry report");

        assert_eq!(
            report,
            NativeProductWindowLoopFailureReport {
                action: NativeProductWindowLoopFailureAction::RetryRedraw,
                surface_recovery_status: NativeProductSurfaceRecoveryStatus::NotAttempted,
            }
        );
        assert_eq!(state.recovery_metrics().surface_recovery_attempt_count, 0);
        assert_eq!(state.recovery_metrics().last_surface_recovery_status, None);
    }

    #[test]
    fn redraw_failure_report_fails_recoverable_surface_without_size() {
        let mut state = NativeProductWindowLoopState::new(1);
        state.begin_present_attempt();
        let failure = NativeProductWindowPresentFailure::from_message(
            "native product window surface present failed: surface was lost",
        );

        let report =
            NativeProductWindowLoop::<InMemoryNativeHostApi>::handle_redraw_failure_with_recovery(
                &mut state,
                &failure,
                None,
                |_, _| unreachable!("missing recovery size must not attempt recovery"),
            )
            .expect("missing recovery size should produce a failure report");

        assert_eq!(
            report,
            NativeProductWindowLoopFailureReport {
                action: NativeProductWindowLoopFailureAction::Fail,
                surface_recovery_status: NativeProductSurfaceRecoveryStatus::MissingSize,
            }
        );
        let metrics = state.recovery_metrics();
        assert_eq!(metrics.surface_recovery_attempt_count, 1);
        assert_eq!(metrics.surface_recovery_missing_size_count, 1);
        assert_eq!(
            metrics.last_surface_recovery_status,
            Some(NativeProductSurfaceRecoveryStatus::MissingSize)
        );
    }

    #[test]
    fn redraw_failure_report_retries_after_surface_recovery() {
        let mut state = NativeProductWindowLoopState::new(1);
        state.begin_present_attempt();
        let recovery_size = NativeProductWindowPhysicalSize::new(1280, 720);
        let failure = NativeProductWindowPresentFailure::from_message(
            "native product window surface present failed: surface configuration is outdated",
        );

        let report =
            NativeProductWindowLoop::<InMemoryNativeHostApi>::handle_redraw_failure_with_recovery(
                &mut state,
                &failure,
                Some(recovery_size),
                |action, physical_size| {
                    assert_eq!(
                        action,
                        NativeProductFramePresentFailureAction::RecoverSurface
                    );
                    Ok(physical_size)
                },
            )
            .expect("successful recovery should produce a retry report");

        assert_eq!(
            report,
            NativeProductWindowLoopFailureReport {
                action: NativeProductWindowLoopFailureAction::RetryRedraw,
                surface_recovery_status: NativeProductSurfaceRecoveryStatus::Reconfigured,
            }
        );
        assert_eq!(state.resize_count(), 1);
        assert_eq!(state.last_resize_physical_size(), Some(recovery_size));
        let metrics = state.recovery_metrics();
        assert_eq!(metrics.surface_recovery_attempt_count, 1);
        assert_eq!(metrics.surface_recovery_success_count, 1);
        assert_eq!(
            metrics.last_surface_recovery_status,
            Some(NativeProductSurfaceRecoveryStatus::Reconfigured)
        );
    }

    #[test]
    fn presented_suboptimal_surface_refresh_records_recovery_metrics() {
        let mut state = NativeProductWindowLoopState::new(1);

        NativeProductWindowLoop::<InMemoryNativeHostApi>::refresh_presented_surface_with_recovery(
            &mut state,
            || Ok(NativeProductWindowPhysicalSize::new(960, 540)),
        )
        .expect("suboptimal surface refresh should succeed");

        assert_eq!(state.resize_count(), 1);
        assert_eq!(
            state.last_resize_physical_size(),
            Some(NativeProductWindowPhysicalSize::new(960, 540))
        );
        let metrics = state.recovery_metrics();
        assert_eq!(metrics.present_failure_count, 0);
        assert_eq!(metrics.surface_recovery_attempt_count, 1);
        assert_eq!(metrics.surface_recovery_success_count, 1);
        assert_eq!(
            metrics.last_surface_recovery_status,
            Some(NativeProductSurfaceRecoveryStatus::Reconfigured)
        );
    }

    #[test]
    fn presented_suboptimal_surface_refresh_records_recovery_error() {
        let mut state = NativeProductWindowLoopState::new(1);

        let error =
            NativeProductWindowLoop::<InMemoryNativeHostApi>::refresh_presented_surface_with_recovery(
                &mut state,
                || Err(NativeProductWindowError::new("surface refresh failed")),
            )
            .expect_err("suboptimal surface refresh should fail");

        assert_eq!(error.to_string(), "surface refresh failed");
        assert_eq!(state.resize_count(), 0);
        let metrics = state.recovery_metrics();
        assert_eq!(metrics.surface_recovery_attempt_count, 1);
        assert_eq!(metrics.surface_recovery_success_count, 0);
        assert_eq!(metrics.surface_recovery_error_count, 1);
        assert_eq!(
            metrics.last_surface_recovery_status,
            Some(NativeProductSurfaceRecoveryStatus::Error)
        );
    }

    #[test]
    fn redraw_failure_report_fails_fatal_without_recovery() {
        let mut state = NativeProductWindowLoopState::new(1);
        state.begin_present_attempt();
        let failure = NativeProductWindowPresentFailure::from_message(
            "native product window surface present failed: OutOfMemory",
        );

        let report =
            NativeProductWindowLoop::<InMemoryNativeHostApi>::handle_redraw_failure_with_recovery(
                &mut state,
                &failure,
                Some(NativeProductWindowPhysicalSize::new(1280, 720)),
                |_, _| unreachable!("fatal present failures must not attempt recovery"),
            )
            .expect("fatal present failure should produce a failure report");

        assert_eq!(
            report,
            NativeProductWindowLoopFailureReport {
                action: NativeProductWindowLoopFailureAction::Fail,
                surface_recovery_status: NativeProductSurfaceRecoveryStatus::NotAttempted,
            }
        );
        assert_eq!(state.recovery_metrics().surface_recovery_attempt_count, 0);
        assert_eq!(state.recovery_metrics().last_surface_recovery_status, None);
    }

    #[test]
    fn redraw_failure_report_retries_after_device_recovery() {
        let mut state = NativeProductWindowLoopState::new(1);
        state.begin_present_attempt();
        let recovery_size = NativeProductWindowPhysicalSize::new(1280, 720);
        let recovered_size = NativeProductWindowPhysicalSize::new(1920, 1080);
        let failure = NativeProductWindowPresentFailure::from_message(
            "native product window surface present failed: device removed",
        );

        let report =
            NativeProductWindowLoop::<InMemoryNativeHostApi>::handle_redraw_failure_with_recovery(
                &mut state,
                &failure,
                Some(recovery_size),
                |action, _| {
                    assert_eq!(
                        action,
                        NativeProductFramePresentFailureAction::RecoverDevice
                    );
                    Ok(recovered_size)
                },
            )
            .expect("successful device recovery should produce a retry report");

        assert_eq!(
            report,
            NativeProductWindowLoopFailureReport {
                action: NativeProductWindowLoopFailureAction::RetryRedraw,
                surface_recovery_status: NativeProductSurfaceRecoveryStatus::DeviceRebuilt,
            }
        );
        assert_eq!(state.resize_count(), 1);
        assert_eq!(state.last_resize_physical_size(), Some(recovered_size));
        let metrics = state.recovery_metrics();
        assert_eq!(metrics.present_failure_count, 1);
        assert_eq!(metrics.recoverable_device_failure_count, 1);
        assert_eq!(metrics.device_recovery_attempt_count, 1);
        assert_eq!(metrics.device_recovery_success_count, 1);
        assert_eq!(
            metrics.last_present_failure_kind,
            Some(crate::product_frame_scheduler::NativeProductFramePresentFailureKind::RecoverableDevice)
        );
        assert_eq!(
            metrics.last_recovery_action,
            Some(NativeProductFramePresentFailureAction::RecoverDevice)
        );
        assert_eq!(
            metrics.last_device_recovery_status,
            Some(NativeProductSurfaceRecoveryStatus::DeviceRebuilt)
        );
    }

    #[test]
    fn redraw_failure_report_fails_recoverable_device_without_size() {
        let mut state = NativeProductWindowLoopState::new(1);
        state.begin_present_attempt();
        let failure = NativeProductWindowPresentFailure::from_message(
            "native product window surface present failed: device was lost",
        );

        let report =
            NativeProductWindowLoop::<InMemoryNativeHostApi>::handle_redraw_failure_with_recovery(
                &mut state,
                &failure,
                None,
                |_, _| unreachable!("missing recovery size must not attempt device recovery"),
            )
            .expect("missing device recovery size should produce a failure report");

        assert_eq!(
            report,
            NativeProductWindowLoopFailureReport {
                action: NativeProductWindowLoopFailureAction::Fail,
                surface_recovery_status: NativeProductSurfaceRecoveryStatus::MissingSize,
            }
        );
        assert_eq!(state.resize_count(), 0);
        let metrics = state.recovery_metrics();
        assert_eq!(metrics.present_failure_count, 1);
        assert_eq!(metrics.recoverable_device_failure_count, 1);
        assert_eq!(metrics.device_recovery_attempt_count, 1);
        assert_eq!(metrics.device_recovery_missing_size_count, 1);
        assert_eq!(metrics.device_recovery_success_count, 0);
        assert_eq!(
            metrics.last_device_recovery_status,
            Some(NativeProductSurfaceRecoveryStatus::MissingSize)
        );
        assert_eq!(
            state.last_present_failure_kind(),
            Some(NativeProductWindowPresentFailureKind::DeviceLost)
        );
    }

    #[test]
    fn redraw_failure_report_records_device_recovery_error() {
        let mut state = NativeProductWindowLoopState::new(1);
        state.begin_present_attempt();
        let recovery_size = NativeProductWindowPhysicalSize::new(1280, 720);
        let failure = NativeProductWindowPresentFailure::from_message(
            "native product window surface present failed: device removed",
        );

        let error =
            NativeProductWindowLoop::<InMemoryNativeHostApi>::handle_redraw_failure_with_recovery(
                &mut state,
                &failure,
                Some(recovery_size),
                |action, physical_size| {
                    assert_eq!(
                        action,
                        NativeProductFramePresentFailureAction::RecoverDevice
                    );
                    assert_eq!(physical_size, recovery_size);
                    Err(NativeProductWindowError::new("device rebuild failed"))
                },
            )
            .expect_err("device recovery backend failures should bubble out");

        assert_eq!(error.to_string(), "device rebuild failed");
        assert_eq!(state.resize_count(), 0);
        let metrics = state.recovery_metrics();
        assert_eq!(metrics.present_failure_count, 1);
        assert_eq!(metrics.recoverable_device_failure_count, 1);
        assert_eq!(metrics.device_recovery_attempt_count, 1);
        assert_eq!(metrics.device_recovery_error_count, 1);
        assert_eq!(metrics.device_recovery_success_count, 0);
        assert_eq!(
            metrics.last_device_recovery_status,
            Some(NativeProductSurfaceRecoveryStatus::Error)
        );
        assert_eq!(
            metrics.last_recovery_action,
            Some(NativeProductFramePresentFailureAction::RecoverDevice)
        );
    }
}
