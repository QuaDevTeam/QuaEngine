pub(crate) const DEFAULT_MAX_PRESENT_ATTEMPTS: usize = 8;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativeProductFramePresentFailureAction {
    RetryRedraw,
    RecoverSurface,
    RecoverDevice,
    Fail,
}

impl NativeProductFramePresentFailureAction {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::RetryRedraw => "retry-redraw",
            Self::RecoverSurface => "recover-surface",
            Self::RecoverDevice => "recover-device",
            Self::Fail => "fail",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativeProductFramePresentFailureKind {
    OccludedOrTimedOut,
    RecoverableSurface,
    RecoverableDevice,
    Fatal,
}

impl NativeProductFramePresentFailureKind {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::OccludedOrTimedOut => "occluded-or-timed-out",
            Self::RecoverableSurface => "recoverable-surface",
            Self::RecoverableDevice => "recoverable-device",
            Self::Fatal => "fatal",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativeProductSurfaceRecoveryStatus {
    NotAttempted,
    Reconfigured,
    DeviceRebuilt,
    MissingSize,
    Error,
}

impl NativeProductSurfaceRecoveryStatus {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::NotAttempted => "not-attempted",
            Self::Reconfigured => "reconfigured",
            Self::DeviceRebuilt => "device-rebuilt",
            Self::MissingSize => "missing-size",
            Self::Error => "error",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductFrameAttempt {
    pub(crate) allow_occluded_report: bool,
    pub(crate) attempt_number: usize,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct NativeProductSurfaceRecoveryMetrics {
    pub(crate) present_failure_count: usize,
    pub(crate) recoverable_surface_failure_count: usize,
    pub(crate) recoverable_device_failure_count: usize,
    pub(crate) surface_recovery_attempt_count: usize,
    pub(crate) surface_recovery_success_count: usize,
    pub(crate) surface_recovery_missing_size_count: usize,
    pub(crate) surface_recovery_error_count: usize,
    pub(crate) device_recovery_attempt_count: usize,
    pub(crate) device_recovery_success_count: usize,
    pub(crate) device_recovery_missing_size_count: usize,
    pub(crate) device_recovery_error_count: usize,
    pub(crate) last_present_failure_kind: Option<NativeProductFramePresentFailureKind>,
    pub(crate) last_recovery_action: Option<NativeProductFramePresentFailureAction>,
    pub(crate) last_surface_recovery_status: Option<NativeProductSurfaceRecoveryStatus>,
    pub(crate) last_device_recovery_status: Option<NativeProductSurfaceRecoveryStatus>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductFrameScheduler {
    target_frame_count: usize,
    max_present_attempts: usize,
    attempt_count: usize,
    recovery_metrics: NativeProductSurfaceRecoveryMetrics,
}

impl NativeProductFrameScheduler {
    pub(crate) fn new(target_frame_count: usize) -> Self {
        Self::with_max_present_attempts(target_frame_count, DEFAULT_MAX_PRESENT_ATTEMPTS)
    }

    pub(crate) fn with_max_present_attempts(
        target_frame_count: usize,
        max_present_attempts: usize,
    ) -> Self {
        Self {
            target_frame_count: target_frame_count.max(1),
            max_present_attempts: max_present_attempts.max(1),
            attempt_count: 0,
            recovery_metrics: NativeProductSurfaceRecoveryMetrics::default(),
        }
    }

    pub(crate) fn target_frame_count(&self) -> usize {
        self.target_frame_count
    }

    pub(crate) fn attempt_count(&self) -> usize {
        self.attempt_count
    }

    pub(crate) fn surface_recovery_count(&self) -> usize {
        self.recovery_metrics.surface_recovery_success_count
    }

    pub(crate) fn device_recovery_count(&self) -> usize {
        self.recovery_metrics.device_recovery_success_count
    }

    pub(crate) fn recovery_metrics(&self) -> NativeProductSurfaceRecoveryMetrics {
        self.recovery_metrics
    }

    pub(crate) fn needs_more_frames(&self, rendered_frame_count: usize) -> bool {
        rendered_frame_count < self.target_frame_count
    }

    pub(crate) fn begin_present_attempt(&mut self) -> NativeProductFrameAttempt {
        self.attempt_count = self.attempt_count.saturating_add(1);
        NativeProductFrameAttempt {
            allow_occluded_report: self.attempt_count >= self.max_present_attempts,
            attempt_number: self.attempt_count,
        }
    }

    pub(crate) fn record_present_failure(
        &mut self,
        failure: NativeProductFramePresentFailureKind,
        action: NativeProductFramePresentFailureAction,
    ) {
        self.recovery_metrics.present_failure_count = self
            .recovery_metrics
            .present_failure_count
            .saturating_add(1);
        if failure == NativeProductFramePresentFailureKind::RecoverableSurface {
            self.recovery_metrics.recoverable_surface_failure_count = self
                .recovery_metrics
                .recoverable_surface_failure_count
                .saturating_add(1);
        }
        if failure == NativeProductFramePresentFailureKind::RecoverableDevice {
            self.recovery_metrics.recoverable_device_failure_count = self
                .recovery_metrics
                .recoverable_device_failure_count
                .saturating_add(1);
        }
        self.recovery_metrics.last_present_failure_kind = Some(failure);
        self.recovery_metrics.last_recovery_action = Some(action);
    }

    pub(crate) fn record_surface_recovery_attempt(&mut self) {
        self.recovery_metrics.surface_recovery_attempt_count = self
            .recovery_metrics
            .surface_recovery_attempt_count
            .saturating_add(1);
    }

    pub(crate) fn record_surface_recovery_success(&mut self) {
        self.recovery_metrics.surface_recovery_success_count = self
            .recovery_metrics
            .surface_recovery_success_count
            .saturating_add(1);
        self.recovery_metrics.last_surface_recovery_status =
            Some(NativeProductSurfaceRecoveryStatus::Reconfigured);
    }

    pub(crate) fn record_surface_recovery_missing_size(&mut self) {
        self.recovery_metrics.surface_recovery_missing_size_count = self
            .recovery_metrics
            .surface_recovery_missing_size_count
            .saturating_add(1);
        self.recovery_metrics.last_surface_recovery_status =
            Some(NativeProductSurfaceRecoveryStatus::MissingSize);
    }

    pub(crate) fn record_surface_recovery_error(&mut self) {
        self.recovery_metrics.surface_recovery_error_count = self
            .recovery_metrics
            .surface_recovery_error_count
            .saturating_add(1);
        self.recovery_metrics.last_surface_recovery_status =
            Some(NativeProductSurfaceRecoveryStatus::Error);
    }

    pub(crate) fn record_device_recovery_attempt(&mut self) {
        self.recovery_metrics.device_recovery_attempt_count = self
            .recovery_metrics
            .device_recovery_attempt_count
            .saturating_add(1);
    }

    pub(crate) fn record_device_recovery_success(&mut self) {
        self.recovery_metrics.device_recovery_success_count = self
            .recovery_metrics
            .device_recovery_success_count
            .saturating_add(1);
        self.recovery_metrics.last_device_recovery_status =
            Some(NativeProductSurfaceRecoveryStatus::DeviceRebuilt);
    }

    pub(crate) fn record_device_recovery_missing_size(&mut self) {
        self.recovery_metrics.device_recovery_missing_size_count = self
            .recovery_metrics
            .device_recovery_missing_size_count
            .saturating_add(1);
        self.recovery_metrics.last_device_recovery_status =
            Some(NativeProductSurfaceRecoveryStatus::MissingSize);
    }

    pub(crate) fn record_device_recovery_error(&mut self) {
        self.recovery_metrics.device_recovery_error_count = self
            .recovery_metrics
            .device_recovery_error_count
            .saturating_add(1);
        self.recovery_metrics.last_device_recovery_status =
            Some(NativeProductSurfaceRecoveryStatus::Error);
    }

    pub(crate) fn classify_present_failure(
        &self,
        failure: NativeProductFramePresentFailureKind,
    ) -> NativeProductFramePresentFailureAction {
        if self.attempt_count >= self.max_present_attempts {
            return NativeProductFramePresentFailureAction::Fail;
        }

        match failure {
            NativeProductFramePresentFailureKind::OccludedOrTimedOut => {
                NativeProductFramePresentFailureAction::RetryRedraw
            }
            NativeProductFramePresentFailureKind::RecoverableSurface => {
                NativeProductFramePresentFailureAction::RecoverSurface
            }
            NativeProductFramePresentFailureKind::RecoverableDevice => {
                NativeProductFramePresentFailureAction::RecoverDevice
            }
            NativeProductFramePresentFailureKind::Fatal => {
                NativeProductFramePresentFailureAction::Fail
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_zero_targets_to_one_projection_frame() {
        let scheduler = NativeProductFrameScheduler::new(0);

        assert_eq!(scheduler.target_frame_count(), 1);
        assert!(scheduler.needs_more_frames(0));
        assert!(!scheduler.needs_more_frames(1));
    }

    #[test]
    fn reports_more_frames_until_the_target_count_is_reached() {
        let scheduler = NativeProductFrameScheduler::new(3);

        assert!(scheduler.needs_more_frames(0));
        assert!(scheduler.needs_more_frames(2));
        assert!(!scheduler.needs_more_frames(3));
        assert!(!scheduler.needs_more_frames(4));
    }

    #[test]
    fn allows_occluded_report_only_on_the_final_present_attempt() {
        let mut scheduler = NativeProductFrameScheduler::with_max_present_attempts(1, 3);

        assert_eq!(
            scheduler.begin_present_attempt(),
            NativeProductFrameAttempt {
                attempt_number: 1,
                allow_occluded_report: false,
            },
        );
        assert_eq!(
            scheduler.begin_present_attempt(),
            NativeProductFrameAttempt {
                attempt_number: 2,
                allow_occluded_report: false,
            },
        );
        assert_eq!(
            scheduler.begin_present_attempt(),
            NativeProductFrameAttempt {
                attempt_number: 3,
                allow_occluded_report: true,
            },
        );
        assert_eq!(scheduler.attempt_count(), 3);
    }

    #[test]
    fn classifies_retry_recover_and_fatal_present_failures() {
        let mut scheduler = NativeProductFrameScheduler::with_max_present_attempts(1, 3);
        scheduler.begin_present_attempt();

        assert_eq!(
            scheduler.classify_present_failure(
                NativeProductFramePresentFailureKind::OccludedOrTimedOut,
            ),
            NativeProductFramePresentFailureAction::RetryRedraw,
        );
        assert_eq!(
            scheduler.classify_present_failure(
                NativeProductFramePresentFailureKind::RecoverableSurface,
            ),
            NativeProductFramePresentFailureAction::RecoverSurface,
        );
        assert_eq!(
            scheduler
                .classify_present_failure(NativeProductFramePresentFailureKind::RecoverableDevice,),
            NativeProductFramePresentFailureAction::RecoverDevice,
        );
        assert_eq!(
            scheduler.classify_present_failure(NativeProductFramePresentFailureKind::Fatal),
            NativeProductFramePresentFailureAction::Fail,
        );
    }

    #[test]
    fn final_attempt_turns_retryable_failures_into_terminal_failures() {
        let mut scheduler = NativeProductFrameScheduler::with_max_present_attempts(1, 2);
        scheduler.begin_present_attempt();
        scheduler.begin_present_attempt();

        assert_eq!(
            scheduler.classify_present_failure(
                NativeProductFramePresentFailureKind::OccludedOrTimedOut,
            ),
            NativeProductFramePresentFailureAction::Fail,
        );
        assert_eq!(
            scheduler.classify_present_failure(
                NativeProductFramePresentFailureKind::RecoverableSurface,
            ),
            NativeProductFramePresentFailureAction::Fail,
        );
        assert_eq!(
            scheduler
                .classify_present_failure(NativeProductFramePresentFailureKind::RecoverableDevice,),
            NativeProductFramePresentFailureAction::Fail,
        );
    }

    #[test]
    fn records_surface_recoveries_as_transient_scheduler_metrics() {
        let mut scheduler = NativeProductFrameScheduler::new(1);

        scheduler.record_surface_recovery_attempt();
        scheduler.record_surface_recovery_success();
        scheduler.record_surface_recovery_attempt();
        scheduler.record_surface_recovery_error();

        assert_eq!(scheduler.surface_recovery_count(), 1);
        assert_eq!(
            scheduler.recovery_metrics(),
            NativeProductSurfaceRecoveryMetrics {
                surface_recovery_attempt_count: 2,
                surface_recovery_success_count: 1,
                surface_recovery_error_count: 1,
                last_surface_recovery_status: Some(NativeProductSurfaceRecoveryStatus::Error),
                ..NativeProductSurfaceRecoveryMetrics::default()
            }
        );
    }

    #[test]
    fn records_present_failure_classification_metrics() {
        let mut scheduler = NativeProductFrameScheduler::with_max_present_attempts(1, 3);
        scheduler.begin_present_attempt();
        let action = scheduler
            .classify_present_failure(NativeProductFramePresentFailureKind::RecoverableSurface);

        scheduler.record_present_failure(
            NativeProductFramePresentFailureKind::RecoverableSurface,
            action,
        );

        assert_eq!(
            scheduler.recovery_metrics(),
            NativeProductSurfaceRecoveryMetrics {
                present_failure_count: 1,
                recoverable_surface_failure_count: 1,
                last_present_failure_kind: Some(
                    NativeProductFramePresentFailureKind::RecoverableSurface
                ),
                last_recovery_action: Some(NativeProductFramePresentFailureAction::RecoverSurface),
                ..NativeProductSurfaceRecoveryMetrics::default()
            }
        );
        assert_eq!(
            NativeProductFramePresentFailureKind::RecoverableSurface.label(),
            "recoverable-surface"
        );
        assert_eq!(
            NativeProductFramePresentFailureAction::RecoverSurface.label(),
            "recover-surface"
        );
        assert_eq!(
            NativeProductSurfaceRecoveryStatus::Reconfigured.label(),
            "reconfigured"
        );
    }

    #[test]
    fn records_device_recoveries_as_transient_scheduler_metrics() {
        let mut scheduler = NativeProductFrameScheduler::new(1);
        scheduler.begin_present_attempt();
        let action = scheduler
            .classify_present_failure(NativeProductFramePresentFailureKind::RecoverableDevice);

        scheduler.record_present_failure(
            NativeProductFramePresentFailureKind::RecoverableDevice,
            action,
        );
        scheduler.record_device_recovery_attempt();
        scheduler.record_device_recovery_success();
        scheduler.record_device_recovery_attempt();
        scheduler.record_device_recovery_error();

        assert_eq!(scheduler.device_recovery_count(), 1);
        assert_eq!(
            scheduler.recovery_metrics(),
            NativeProductSurfaceRecoveryMetrics {
                present_failure_count: 1,
                recoverable_device_failure_count: 1,
                device_recovery_attempt_count: 2,
                device_recovery_success_count: 1,
                device_recovery_error_count: 1,
                last_present_failure_kind: Some(
                    NativeProductFramePresentFailureKind::RecoverableDevice
                ),
                last_recovery_action: Some(NativeProductFramePresentFailureAction::RecoverDevice),
                last_device_recovery_status: Some(NativeProductSurfaceRecoveryStatus::Error),
                ..NativeProductSurfaceRecoveryMetrics::default()
            }
        );
        assert_eq!(
            NativeProductFramePresentFailureKind::RecoverableDevice.label(),
            "recoverable-device"
        );
        assert_eq!(
            NativeProductFramePresentFailureAction::RecoverDevice.label(),
            "recover-device"
        );
        assert_eq!(
            NativeProductSurfaceRecoveryStatus::DeviceRebuilt.label(),
            "device-rebuilt"
        );
    }
}
