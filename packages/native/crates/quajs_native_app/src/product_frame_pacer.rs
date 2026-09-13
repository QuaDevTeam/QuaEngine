//! Target-frame-rate pacing for the continuous native render cadence.
//!
//! The native window keeps a browser-like continuous cadence while it is
//! visible and resumed. This module owns *how fast* that cadence runs: the app
//! loop asks the pacer for the next frame deadline and parks the winit event
//! loop in [`winit::event_loop::ControlFlow::WaitUntil`] until then.
//!
//! Pacing is deliberately separate from the surface present mode. Vsync (Fifo)
//! still prevents tearing, but it only ever caps the loop at the display
//! refresh rate; it cannot express "run this product at 60 FPS on a 120 Hz
//! panel". The requested rate is clamped to the display refresh rate because
//! asking for more frames than the panel can show only burns CPU/GPU.

use std::time::{Duration, Instant};

/// Floor for the render cadence. Anything below this reads as stutter, so the
/// pacer never targets less than 30 FPS even if a caller asks for it.
pub(crate) const MIN_TARGET_FPS: u32 = 30;
/// Browser-like default cadence.
pub(crate) const DEFAULT_TARGET_FPS: u32 = 60;
/// Upper bound, high enough for 240 Hz panels.
pub(crate) const MAX_TARGET_FPS: u32 = 240;

/// Clamps an arbitrary requested frame rate into the supported range.
pub(crate) fn clamp_target_fps(fps: u32) -> u32 {
    fps.clamp(MIN_TARGET_FPS, MAX_TARGET_FPS)
}

/// Clamps a floating-point requested frame rate (settings/projection values
/// arrive as JSON numbers) into the supported range. Non-finite and
/// non-positive values fall back to the default cadence.
pub(crate) fn clamp_target_fps_f64(fps: f64) -> u32 {
    if !fps.is_finite() || fps <= 0.0 {
        return DEFAULT_TARGET_FPS;
    }
    clamp_target_fps(fps.round().clamp(0.0, f64::from(u32::MAX)) as u32)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductFramePacer {
    /// What the product asked for: settings value, env override, or default.
    requested_fps: u32,
    /// Refresh rate of the monitor the window currently sits on, when winit
    /// reports one. `None` on headless/unknown displays.
    display_refresh_rate: Option<u32>,
    /// When the in-flight frame started. Deadlines are measured from frame
    /// *start* so the cadence stays even regardless of how long a frame took.
    last_frame_started_at: Option<Instant>,
}

impl Default for NativeProductFramePacer {
    fn default() -> Self {
        Self::new(DEFAULT_TARGET_FPS)
    }
}

impl NativeProductFramePacer {
    pub(crate) fn new(requested_fps: u32) -> Self {
        Self {
            requested_fps: clamp_target_fps(requested_fps),
            display_refresh_rate: None,
            last_frame_started_at: None,
        }
    }

    pub(crate) fn requested_fps(&self) -> u32 {
        self.requested_fps
    }

    pub(crate) fn display_refresh_rate(&self) -> Option<u32> {
        self.display_refresh_rate
    }

    /// The cadence actually used: the requested rate, capped by what the
    /// display can present, floored at [`MIN_TARGET_FPS`].
    pub(crate) fn effective_fps(&self) -> u32 {
        let capped = match self.display_refresh_rate {
            Some(refresh_rate) if refresh_rate > 0 => self.requested_fps.min(refresh_rate),
            _ => self.requested_fps,
        };
        clamp_target_fps(capped)
    }

    /// Wall-clock budget for one frame at the effective cadence.
    pub(crate) fn frame_interval(&self) -> Duration {
        Duration::from_secs_f64(1.0 / f64::from(self.effective_fps()))
    }

    /// Applies a new requested rate. Returns whether the effective cadence
    /// changed, so callers can skip redundant work.
    pub(crate) fn set_requested_fps(&mut self, fps: u32) -> bool {
        let next = clamp_target_fps(fps);
        if next == self.requested_fps {
            return false;
        }
        let previous_effective = self.effective_fps();
        self.requested_fps = next;
        self.effective_fps() != previous_effective
    }

    /// Records the refresh rate of the monitor the window is on. Returns
    /// whether the effective cadence changed.
    pub(crate) fn set_display_refresh_rate(&mut self, refresh_rate: Option<u32>) -> bool {
        let next = refresh_rate.filter(|rate| *rate > 0);
        if next == self.display_refresh_rate {
            return false;
        }
        let previous_effective = self.effective_fps();
        self.display_refresh_rate = next;
        self.effective_fps() != previous_effective
    }

    /// Marks the start of a frame. The next deadline is derived from this
    /// instant.
    pub(crate) fn record_frame_started(&mut self, started_at: Instant) {
        self.last_frame_started_at = Some(started_at);
    }

    /// Deadline for the next frame, measured from the last frame's start.
    ///
    /// When the previous frame overran its budget the deadline has already
    /// passed, so this returns `now`: the next frame is dispatched immediately
    /// and no backlog of missed frames is replayed. Frame pacing degrades to
    /// "as fast as the work allows" instead of bursting to catch up.
    pub(crate) fn next_deadline(&self, now: Instant) -> Instant {
        let Some(last_frame_started_at) = self.last_frame_started_at else {
            return now;
        };
        let deadline = last_frame_started_at + self.frame_interval();
        if deadline <= now {
            now
        } else {
            deadline
        }
    }

    /// Clears pacing history so the next frame runs immediately. Used when the
    /// window is hidden/suspended, since resuming should not wait out a
    /// deadline computed before the gap.
    pub(crate) fn reset(&mut self) {
        self.last_frame_started_at = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_requested_frame_rates_into_the_supported_range() {
        assert_eq!(clamp_target_fps(0), MIN_TARGET_FPS);
        assert_eq!(clamp_target_fps(24), MIN_TARGET_FPS);
        assert_eq!(clamp_target_fps(30), 30);
        assert_eq!(clamp_target_fps(60), 60);
        assert_eq!(clamp_target_fps(120), 120);
        assert_eq!(clamp_target_fps(1_000), MAX_TARGET_FPS);
    }

    #[test]
    fn clamps_json_frame_rates_and_falls_back_for_invalid_numbers() {
        assert_eq!(clamp_target_fps_f64(f64::NAN), DEFAULT_TARGET_FPS);
        assert_eq!(clamp_target_fps_f64(f64::INFINITY), DEFAULT_TARGET_FPS);
        assert_eq!(clamp_target_fps_f64(0.0), DEFAULT_TARGET_FPS);
        assert_eq!(clamp_target_fps_f64(-120.0), DEFAULT_TARGET_FPS);
        assert_eq!(clamp_target_fps_f64(59.6), 60);
        assert_eq!(clamp_target_fps_f64(120.0), 120);
        assert_eq!(clamp_target_fps_f64(10.0), MIN_TARGET_FPS);
    }

    #[test]
    fn defaults_to_sixty_frames_per_second() {
        let pacer = NativeProductFramePacer::default();

        assert_eq!(pacer.requested_fps(), DEFAULT_TARGET_FPS);
        assert_eq!(pacer.effective_fps(), DEFAULT_TARGET_FPS);
        assert_eq!(pacer.display_refresh_rate(), None);
    }

    #[test]
    fn caps_the_requested_rate_at_the_display_refresh_rate() {
        let mut pacer = NativeProductFramePacer::new(120);
        assert_eq!(pacer.effective_fps(), 120);

        assert!(pacer.set_display_refresh_rate(Some(60)));

        assert_eq!(pacer.requested_fps(), 120);
        assert_eq!(pacer.effective_fps(), 60);
    }

    #[test]
    fn keeps_the_requested_rate_on_a_faster_display() {
        let mut pacer = NativeProductFramePacer::new(60);

        assert!(!pacer.set_display_refresh_rate(Some(120)));

        assert_eq!(pacer.effective_fps(), 60);
    }

    #[test]
    fn never_paces_below_the_thirty_frame_floor() {
        let mut pacer = NativeProductFramePacer::new(30);

        // A display reporting an implausibly low refresh rate must not drag
        // the product cadence under the floor.
        pacer.set_display_refresh_rate(Some(10));

        assert_eq!(pacer.effective_fps(), MIN_TARGET_FPS);
    }

    #[test]
    fn ignores_a_zero_display_refresh_rate() {
        let mut pacer = NativeProductFramePacer::new(120);

        assert!(!pacer.set_display_refresh_rate(Some(0)));

        assert_eq!(pacer.display_refresh_rate(), None);
        assert_eq!(pacer.effective_fps(), 120);
    }

    #[test]
    fn computes_the_frame_interval_from_the_effective_rate() {
        assert_eq!(
            NativeProductFramePacer::new(30).frame_interval(),
            Duration::from_secs_f64(1.0 / 30.0)
        );
        assert_eq!(
            NativeProductFramePacer::new(60).frame_interval(),
            Duration::from_secs_f64(1.0 / 60.0)
        );
        assert_eq!(
            NativeProductFramePacer::new(120).frame_interval(),
            Duration::from_secs_f64(1.0 / 120.0)
        );
    }

    #[test]
    fn reports_no_cadence_change_when_the_requested_rate_is_unchanged() {
        let mut pacer = NativeProductFramePacer::new(60);

        assert!(!pacer.set_requested_fps(60));
        assert!(pacer.set_requested_fps(120));
        assert_eq!(pacer.effective_fps(), 120);
    }

    #[test]
    fn dispatches_the_first_frame_immediately() {
        let pacer = NativeProductFramePacer::new(60);
        let now = Instant::now();

        assert_eq!(pacer.next_deadline(now), now);
    }

    #[test]
    fn schedules_the_next_deadline_one_interval_after_the_frame_start() {
        let mut pacer = NativeProductFramePacer::new(60);
        let started_at = Instant::now();
        pacer.record_frame_started(started_at);

        // A frame that took 4ms still gets a deadline 16.6ms after it started,
        // so the cadence stays even instead of drifting by the frame cost.
        let now = started_at + Duration::from_millis(4);

        assert_eq!(
            pacer.next_deadline(now),
            started_at + Duration::from_secs_f64(1.0 / 60.0)
        );
    }

    #[test]
    fn does_not_burst_to_catch_up_after_an_overrun_frame() {
        let mut pacer = NativeProductFramePacer::new(60);
        let started_at = Instant::now();
        pacer.record_frame_started(started_at);

        // The frame blew through several intervals. The next deadline is now,
        // not a backlog of missed 16.6ms slots.
        let now = started_at + Duration::from_millis(100);

        assert_eq!(pacer.next_deadline(now), now);
    }

    #[test]
    fn reset_dispatches_the_next_frame_immediately() {
        let mut pacer = NativeProductFramePacer::new(60);
        let started_at = Instant::now();
        pacer.record_frame_started(started_at);
        pacer.reset();

        let now = started_at + Duration::from_millis(1);

        assert_eq!(pacer.next_deadline(now), now);
    }
}
