use quajs_native_runtime::NativeHostApi;

use crate::product_app_loop::{NativeProductAppLoop, NativeProductAppLoopAction};
use crate::product_window::{
    NativeProductWindowError, NativeProductWindowPhysicalSize, NativeProductWindowPresentFailure,
};
use crate::product_window_loop::{
    NativeProductWindowLoop, NativeProductWindowLoopError, NativeProductWindowLoopFailureAction,
    NativeProductWindowLoopFailureReport,
};
use crate::texture_sync::NativeTextureBundleLifecycleSyncReport;

pub(crate) trait NativeProductAppShellWindowLoop {
    fn needs_more_frames(&self) -> bool;

    fn tick_host_lifecycle_with_audio_teardown(
        &mut self,
    ) -> Result<NativeTextureBundleLifecycleSyncReport, NativeProductWindowLoopError>;

    fn handle_redraw_failure(
        &mut self,
        failure: &NativeProductWindowPresentFailure,
        recovery_size: Option<NativeProductWindowPhysicalSize>,
    ) -> Result<NativeProductWindowLoopFailureReport, NativeProductWindowError>;
}

impl<H> NativeProductAppShellWindowLoop for NativeProductWindowLoop<H>
where
    H: NativeHostApi,
{
    fn needs_more_frames(&self) -> bool {
        NativeProductWindowLoop::needs_more_frames(self)
    }

    fn tick_host_lifecycle_with_audio_teardown(
        &mut self,
    ) -> Result<NativeTextureBundleLifecycleSyncReport, NativeProductWindowLoopError> {
        NativeProductWindowLoop::tick_host_lifecycle_with_audio_teardown(self)
    }

    fn handle_redraw_failure(
        &mut self,
        failure: &NativeProductWindowPresentFailure,
        recovery_size: Option<NativeProductWindowPhysicalSize>,
    ) -> Result<NativeProductWindowLoopFailureReport, NativeProductWindowError> {
        NativeProductWindowLoop::handle_redraw_failure(self, failure, recovery_size)
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct NativeProductAppShellAction {
    pub(crate) request_redraw: bool,
    pub(crate) lifecycle_report: Option<NativeTextureBundleLifecycleSyncReport>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum NativeProductAppShellRedrawDecision {
    RetryRedraw {
        failure_report: NativeProductWindowLoopFailureReport,
        action: NativeProductAppShellAction,
    },
    Fail {
        failure_report: NativeProductWindowLoopFailureReport,
    },
}

#[derive(Debug)]
pub(crate) struct NativeProductAppShell<W> {
    app_loop: NativeProductAppLoop,
    window_loop: W,
}

impl<W> NativeProductAppShell<W>
where
    W: NativeProductAppShellWindowLoop,
{
    pub(crate) fn new(window_loop: W) -> Self {
        Self {
            app_loop: NativeProductAppLoop::new(),
            window_loop,
        }
    }

    pub(crate) fn app_loop(&self) -> &NativeProductAppLoop {
        &self.app_loop
    }

    pub(crate) fn window_loop(&self) -> &W {
        &self.window_loop
    }

    pub(crate) fn window_loop_mut(&mut self) -> &mut W {
        &mut self.window_loop
    }

    pub(crate) fn needs_more_frames(&self) -> bool {
        self.window_loop.needs_more_frames()
    }

    pub(crate) fn record_resumed(
        &mut self,
    ) -> Result<NativeProductAppShellAction, NativeProductWindowLoopError> {
        let action = self.app_loop.record_resumed();
        self.dispatch_app_action(action)
    }

    pub(crate) fn record_suspended(
        &mut self,
    ) -> Result<NativeProductAppShellAction, NativeProductWindowLoopError> {
        let action = self.app_loop.record_suspended();
        self.dispatch_app_action(action)
    }

    pub(crate) fn record_visibility_changed(
        &mut self,
        visible: bool,
    ) -> Result<NativeProductAppShellAction, NativeProductWindowLoopError> {
        let action = self.app_loop.record_visibility_changed(visible);
        self.dispatch_app_action(action)
    }

    pub(crate) fn record_focus_changed(
        &mut self,
        focused: bool,
    ) -> Result<NativeProductAppShellAction, NativeProductWindowLoopError> {
        let action = self.app_loop.record_focus_changed(focused);
        self.dispatch_app_action(action)
    }

    pub(crate) fn record_surface_changed(
        &mut self,
    ) -> Result<NativeProductAppShellAction, NativeProductWindowLoopError> {
        let action = self.app_loop.record_surface_changed();
        self.dispatch_app_action(action)
    }

    pub(crate) fn record_redraw_dispatch_started(&mut self) {
        self.app_loop.record_redraw_dispatch_started();
    }

    pub(crate) fn record_frame_completed(
        &mut self,
    ) -> Result<NativeProductAppShellAction, NativeProductWindowLoopError> {
        let needs_more_frames = self.window_loop.needs_more_frames();
        let action = self.app_loop.record_frame_completed(needs_more_frames);
        self.dispatch_app_action(action)
    }

    pub(crate) fn about_to_wait(
        &mut self,
    ) -> Result<NativeProductAppShellAction, NativeProductWindowLoopError> {
        let needs_more_frames = self.window_loop.needs_more_frames();
        let action = self.app_loop.about_to_wait(needs_more_frames);
        self.dispatch_app_action(action)
    }

    pub(crate) fn handle_redraw_failure(
        &mut self,
        failure: &NativeProductWindowPresentFailure,
        recovery_size: Option<NativeProductWindowPhysicalSize>,
    ) -> Result<NativeProductAppShellRedrawDecision, NativeProductWindowError> {
        let failure_report = self
            .window_loop
            .handle_redraw_failure(failure, recovery_size)?;
        if failure_report.action != NativeProductWindowLoopFailureAction::RetryRedraw {
            return Ok(NativeProductAppShellRedrawDecision::Fail { failure_report });
        }

        let app_action = self.app_loop.record_frame_retry_requested();
        let action = self
            .dispatch_app_action(app_action)
            .map_err(|error| NativeProductWindowError::new(error.to_string()))?;
        Ok(NativeProductAppShellRedrawDecision::RetryRedraw {
            failure_report,
            action,
        })
    }

    fn dispatch_app_action(
        &mut self,
        action: NativeProductAppLoopAction,
    ) -> Result<NativeProductAppShellAction, NativeProductWindowLoopError> {
        let lifecycle_report = if action.tick_host_lifecycle {
            Some(self.window_loop.tick_host_lifecycle_with_audio_teardown()?)
        } else {
            None
        };
        Ok(NativeProductAppShellAction {
            request_redraw: action.request_redraw,
            lifecycle_report,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::product_frame_scheduler::NativeProductSurfaceRecoveryStatus;

    #[test]
    fn resumed_shell_ticks_lifecycle_and_requests_redraw() {
        let mut shell = NativeProductAppShell::new(FakeWindowLoop::default());

        let action = shell
            .record_resumed()
            .expect("resumed shell action should succeed");

        assert!(action.request_redraw);
        assert!(action.lifecycle_report.is_some());
        assert_eq!(shell.app_loop().snapshot().resume_count, 1);
        assert_eq!(shell.window_loop().lifecycle_tick_count, 1);
    }

    #[test]
    fn completed_frame_schedules_next_redraw_when_window_needs_more_frames() {
        let mut shell = NativeProductAppShell::new(FakeWindowLoop {
            needs_more_frames: true,
            ..Default::default()
        });
        shell
            .record_resumed()
            .expect("initial shell action should succeed");
        shell.record_redraw_dispatch_started();

        let action = shell
            .record_frame_completed()
            .expect("completed frame action should succeed");

        assert!(action.request_redraw);
        assert!(action.lifecycle_report.is_none());
        assert_eq!(shell.app_loop().snapshot().redraw_request_count, 2);
    }

    #[test]
    fn redraw_failure_retry_runs_app_retry_policy() {
        let mut shell = NativeProductAppShell::new(FakeWindowLoop::default());
        shell
            .record_resumed()
            .expect("initial shell action should succeed");
        shell.record_redraw_dispatch_started();
        let failure = NativeProductWindowPresentFailure::from_message(
            "native product window surface present failed: surface is occluded",
        );

        let decision = shell
            .handle_redraw_failure(&failure, None)
            .expect("retryable redraw failure should be handled");

        match decision {
            NativeProductAppShellRedrawDecision::RetryRedraw {
                failure_report,
                action,
            } => {
                assert_eq!(
                    failure_report.surface_recovery_status,
                    NativeProductSurfaceRecoveryStatus::NotAttempted
                );
                assert!(action.request_redraw);
                assert!(action.lifecycle_report.is_none());
            }
            NativeProductAppShellRedrawDecision::Fail { .. } => {
                panic!("retryable redraw failure should not fail")
            }
        }
        assert_eq!(shell.app_loop().snapshot().redraw_request_count, 2);
    }

    #[test]
    fn hidden_redraw_failure_retry_ticks_lifecycle_instead_of_requesting_redraw() {
        let mut shell = NativeProductAppShell::new(FakeWindowLoop::default());
        shell
            .record_resumed()
            .expect("initial shell action should succeed");
        shell.record_redraw_dispatch_started();
        shell
            .record_visibility_changed(false)
            .expect("hidden shell action should succeed");
        let failure = NativeProductWindowPresentFailure::from_message(
            "native product window surface present failed: surface is occluded",
        );

        let decision = shell
            .handle_redraw_failure(&failure, None)
            .expect("hidden retryable redraw failure should be handled");

        match decision {
            NativeProductAppShellRedrawDecision::RetryRedraw { action, .. } => {
                assert!(!action.request_redraw);
                assert!(action.lifecycle_report.is_some());
            }
            NativeProductAppShellRedrawDecision::Fail { .. } => {
                panic!("hidden retryable redraw failure should not fail")
            }
        }
        assert_eq!(shell.window_loop().lifecycle_tick_count, 3);
    }

    #[derive(Debug)]
    struct FakeWindowLoop {
        needs_more_frames: bool,
        lifecycle_tick_count: usize,
        failure_report: NativeProductWindowLoopFailureReport,
    }

    impl Default for FakeWindowLoop {
        fn default() -> Self {
            Self {
                needs_more_frames: false,
                lifecycle_tick_count: 0,
                failure_report: NativeProductWindowLoopFailureReport {
                    action: NativeProductWindowLoopFailureAction::RetryRedraw,
                    surface_recovery_status: NativeProductSurfaceRecoveryStatus::NotAttempted,
                },
            }
        }
    }

    impl NativeProductAppShellWindowLoop for FakeWindowLoop {
        fn needs_more_frames(&self) -> bool {
            self.needs_more_frames
        }

        fn tick_host_lifecycle_with_audio_teardown(
            &mut self,
        ) -> Result<NativeTextureBundleLifecycleSyncReport, NativeProductWindowLoopError> {
            self.lifecycle_tick_count = self.lifecycle_tick_count.saturating_add(1);
            Ok(NativeTextureBundleLifecycleSyncReport::default())
        }

        fn handle_redraw_failure(
            &mut self,
            _failure: &NativeProductWindowPresentFailure,
            _recovery_size: Option<NativeProductWindowPhysicalSize>,
        ) -> Result<NativeProductWindowLoopFailureReport, NativeProductWindowError> {
            Ok(self.failure_report)
        }
    }
}
