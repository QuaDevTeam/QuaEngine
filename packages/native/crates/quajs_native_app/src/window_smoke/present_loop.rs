use super::error::NativeWindowSmokeError;
use super::present::{is_occluded_or_timeout_present_error, is_recoverable_surface_present_error};

pub(super) const MAX_PRESENT_ATTEMPTS: usize = 8;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum NativeWindowSmokePresentFailureAction {
    RetryRedraw,
    RecoverSurface,
    Fail,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(super) struct NativeWindowSmokePresentLoop {
    attempt_count: usize,
    surface_recovery_count: usize,
}

impl NativeWindowSmokePresentLoop {
    pub(super) fn attempt_count(&self) -> usize {
        self.attempt_count
    }

    pub(super) fn surface_recovery_count(&self) -> usize {
        self.surface_recovery_count
    }

    pub(super) fn next_attempt_allows_occluded_report(&mut self) -> bool {
        self.attempt_count = self.attempt_count.saturating_add(1);
        self.attempt_count >= MAX_PRESENT_ATTEMPTS
    }

    pub(super) fn record_surface_recovery(&mut self) {
        self.surface_recovery_count = self.surface_recovery_count.saturating_add(1);
    }

    pub(super) fn classify_failure(
        &self,
        error: &NativeWindowSmokeError,
    ) -> NativeWindowSmokePresentFailureAction {
        if self.attempt_count >= MAX_PRESENT_ATTEMPTS {
            return NativeWindowSmokePresentFailureAction::Fail;
        }

        if is_occluded_or_timeout_present_error(error) {
            return NativeWindowSmokePresentFailureAction::RetryRedraw;
        }

        if is_recoverable_surface_present_error(error) {
            return NativeWindowSmokePresentFailureAction::RecoverSurface;
        }

        NativeWindowSmokePresentFailureAction::Fail
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_occluded_report_only_on_final_attempt() {
        let mut loop_state = NativeWindowSmokePresentLoop::default();

        for _ in 1..MAX_PRESENT_ATTEMPTS {
            assert!(!loop_state.next_attempt_allows_occluded_report());
        }

        assert!(loop_state.next_attempt_allows_occluded_report());
        assert_eq!(loop_state.attempt_count(), MAX_PRESENT_ATTEMPTS);
    }

    #[test]
    fn classifies_retryable_recoverable_and_terminal_failures() {
        let mut loop_state = NativeWindowSmokePresentLoop::default();
        loop_state.next_attempt_allows_occluded_report();

        assert_eq!(
            loop_state.classify_failure(&NativeWindowSmokeError::new(
                "Native renderer smoke surface present failed: InvalidOperationOrder: cannot present frame because surface is occluded.",
            )),
            NativeWindowSmokePresentFailureAction::RetryRedraw,
        );
        assert_eq!(
            loop_state.classify_failure(&NativeWindowSmokeError::new(
                "Native renderer smoke surface present failed: InvalidOperationOrder: cannot present frame because surface was lost.",
            )),
            NativeWindowSmokePresentFailureAction::RecoverSurface,
        );
        assert_eq!(
            loop_state.classify_failure(&NativeWindowSmokeError::new(
                "Native renderer smoke frame failed: validation error.",
            )),
            NativeWindowSmokePresentFailureAction::Fail,
        );
    }

    #[test]
    fn final_attempt_does_not_retry_or_recover() {
        let mut loop_state = NativeWindowSmokePresentLoop::default();
        for _ in 0..MAX_PRESENT_ATTEMPTS {
            loop_state.next_attempt_allows_occluded_report();
        }

        assert_eq!(
            loop_state.classify_failure(&NativeWindowSmokeError::new(
                "Native renderer smoke surface present failed: InvalidOperationOrder: cannot present frame because surface configuration is outdated.",
            )),
            NativeWindowSmokePresentFailureAction::Fail,
        );
        assert_eq!(
            loop_state.classify_failure(&NativeWindowSmokeError::new(
                "Native renderer smoke surface present failed: InvalidOperationOrder: cannot present frame because surface acquisition timed out.",
            )),
            NativeWindowSmokePresentFailureAction::Fail,
        );
    }

    #[test]
    fn records_surface_recovery_count() {
        let mut loop_state = NativeWindowSmokePresentLoop::default();

        loop_state.record_surface_recovery();
        loop_state.record_surface_recovery();

        assert_eq!(loop_state.surface_recovery_count(), 2);
    }
}
