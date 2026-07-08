#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativeProductAppLifecycleState {
    Suspended,
    Running,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct NativeProductAppLoopAction {
    pub(crate) request_redraw: bool,
    pub(crate) tick_host_lifecycle: bool,
}

impl NativeProductAppLoopAction {
    fn none() -> Self {
        Self::default()
    }

    fn lifecycle_tick() -> Self {
        Self {
            request_redraw: false,
            tick_host_lifecycle: true,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductAppLoopSnapshot {
    pub(crate) lifecycle_state: NativeProductAppLifecycleState,
    pub(crate) focused: bool,
    pub(crate) visible: bool,
    pub(crate) redraw_pending: bool,
    pub(crate) resume_count: usize,
    pub(crate) suspend_count: usize,
    pub(crate) visibility_change_count: usize,
    pub(crate) lifecycle_tick_request_count: usize,
    pub(crate) redraw_request_count: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductAppLoop {
    lifecycle_state: NativeProductAppLifecycleState,
    focused: bool,
    visible: bool,
    redraw_pending: bool,
    resume_count: usize,
    suspend_count: usize,
    visibility_change_count: usize,
    lifecycle_tick_request_count: usize,
    redraw_request_count: usize,
}

impl Default for NativeProductAppLoop {
    fn default() -> Self {
        Self::new()
    }
}

impl NativeProductAppLoop {
    pub(crate) fn new() -> Self {
        Self {
            lifecycle_state: NativeProductAppLifecycleState::Suspended,
            focused: false,
            visible: false,
            redraw_pending: false,
            resume_count: 0,
            suspend_count: 0,
            visibility_change_count: 0,
            lifecycle_tick_request_count: 0,
            redraw_request_count: 0,
        }
    }

    pub(crate) fn snapshot(&self) -> NativeProductAppLoopSnapshot {
        NativeProductAppLoopSnapshot {
            lifecycle_state: self.lifecycle_state,
            focused: self.focused,
            visible: self.visible,
            redraw_pending: self.redraw_pending,
            resume_count: self.resume_count,
            suspend_count: self.suspend_count,
            visibility_change_count: self.visibility_change_count,
            lifecycle_tick_request_count: self.lifecycle_tick_request_count,
            redraw_request_count: self.redraw_request_count,
        }
    }

    pub(crate) fn record_resumed(&mut self) -> NativeProductAppLoopAction {
        self.lifecycle_state = NativeProductAppLifecycleState::Running;
        self.visible = true;
        self.resume_count = self.resume_count.saturating_add(1);
        self.lifecycle_and_maybe_redraw(true)
    }

    pub(crate) fn record_suspended(&mut self) -> NativeProductAppLoopAction {
        self.lifecycle_state = NativeProductAppLifecycleState::Suspended;
        self.visible = false;
        self.redraw_pending = false;
        self.suspend_count = self.suspend_count.saturating_add(1);
        self.lifecycle_tick_action()
    }

    pub(crate) fn record_visibility_changed(
        &mut self,
        visible: bool,
    ) -> NativeProductAppLoopAction {
        if self.visible != visible {
            self.visibility_change_count = self.visibility_change_count.saturating_add(1);
        }
        self.visible = visible;
        if !visible {
            self.redraw_pending = false;
            return self.lifecycle_tick_action();
        }
        self.lifecycle_and_maybe_redraw(true)
    }

    #[cfg_attr(not(feature = "native-window"), allow(dead_code))]
    pub(crate) fn record_focus_changed(&mut self, focused: bool) -> NativeProductAppLoopAction {
        self.focused = focused;
        self.maybe_request_redraw()
    }

    #[cfg_attr(not(feature = "native-window"), allow(dead_code))]
    pub(crate) fn record_surface_changed(&mut self) -> NativeProductAppLoopAction {
        self.maybe_request_redraw()
    }

    pub(crate) fn record_redraw_dispatch_started(&mut self) {
        self.redraw_pending = false;
    }

    pub(crate) fn record_frame_completed(
        &mut self,
        needs_more_frames: bool,
    ) -> NativeProductAppLoopAction {
        if needs_more_frames {
            self.maybe_request_redraw()
        } else {
            NativeProductAppLoopAction::none()
        }
    }

    pub(crate) fn record_frame_retry_requested(&mut self) -> NativeProductAppLoopAction {
        if !self.can_request_redraw() {
            return self.lifecycle_tick_action();
        }
        self.maybe_request_redraw()
    }

    pub(crate) fn about_to_wait(&mut self, needs_more_frames: bool) -> NativeProductAppLoopAction {
        if needs_more_frames {
            if !self.can_request_redraw() {
                return self.lifecycle_tick_action();
            }
            return self.maybe_request_redraw();
        }
        self.lifecycle_tick_action()
    }

    fn lifecycle_and_maybe_redraw(&mut self, request_redraw: bool) -> NativeProductAppLoopAction {
        let mut action = self.lifecycle_tick_action();
        if request_redraw {
            let redraw = self.maybe_request_redraw();
            action.request_redraw = redraw.request_redraw;
        }
        action
    }

    fn lifecycle_tick_action(&mut self) -> NativeProductAppLoopAction {
        self.lifecycle_tick_request_count = self.lifecycle_tick_request_count.saturating_add(1);
        NativeProductAppLoopAction::lifecycle_tick()
    }

    fn maybe_request_redraw(&mut self) -> NativeProductAppLoopAction {
        if !self.can_request_redraw() || self.redraw_pending {
            return NativeProductAppLoopAction::none();
        }
        self.redraw_pending = true;
        self.redraw_request_count = self.redraw_request_count.saturating_add(1);
        NativeProductAppLoopAction {
            request_redraw: true,
            tick_host_lifecycle: false,
        }
    }

    fn can_request_redraw(&self) -> bool {
        self.lifecycle_state == NativeProductAppLifecycleState::Running && self.visible
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_suspended_without_redraw_pressure() {
        let app_loop = NativeProductAppLoop::new();

        assert_eq!(
            app_loop.snapshot().lifecycle_state,
            NativeProductAppLifecycleState::Suspended
        );
        assert!(!app_loop.snapshot().visible);
        assert!(!app_loop.snapshot().redraw_pending);
    }

    #[test]
    fn resume_ticks_lifecycle_and_requests_first_redraw_once() {
        let mut app_loop = NativeProductAppLoop::new();

        let first = app_loop.record_resumed();
        let second = app_loop.about_to_wait(true);

        assert!(first.tick_host_lifecycle);
        assert!(first.request_redraw);
        assert!(!second.tick_host_lifecycle);
        assert!(!second.request_redraw);
        assert_eq!(app_loop.snapshot().resume_count, 1);
        assert_eq!(app_loop.snapshot().lifecycle_tick_request_count, 1);
        assert_eq!(app_loop.snapshot().redraw_request_count, 1);
    }

    #[test]
    fn completed_frame_requests_next_redraw_when_frames_remain() {
        let mut app_loop = NativeProductAppLoop::new();
        app_loop.record_resumed();
        app_loop.record_redraw_dispatch_started();

        let action = app_loop.record_frame_completed(true);

        assert!(action.request_redraw);
        assert_eq!(app_loop.snapshot().redraw_request_count, 2);
        assert!(app_loop.snapshot().redraw_pending);
    }

    #[test]
    fn completed_final_frame_does_not_schedule_more_redraws() {
        let mut app_loop = NativeProductAppLoop::new();
        app_loop.record_resumed();
        app_loop.record_redraw_dispatch_started();

        let action = app_loop.record_frame_completed(false);

        assert!(!action.request_redraw);
        assert_eq!(app_loop.snapshot().redraw_request_count, 1);
        assert!(!app_loop.snapshot().redraw_pending);
    }

    #[test]
    fn hidden_or_suspended_windows_tick_lifecycle_without_redraw() {
        let mut app_loop = NativeProductAppLoop::new();
        app_loop.record_resumed();
        app_loop.record_redraw_dispatch_started();

        let hidden = app_loop.record_visibility_changed(false);
        let waiting = app_loop.about_to_wait(true);
        let suspended = app_loop.record_suspended();

        assert!(hidden.tick_host_lifecycle);
        assert!(!hidden.request_redraw);
        assert!(!waiting.request_redraw);
        assert!(waiting.tick_host_lifecycle);
        assert!(suspended.tick_host_lifecycle);
        assert_eq!(app_loop.snapshot().visibility_change_count, 1);
        assert_eq!(app_loop.snapshot().suspend_count, 1);
        assert_eq!(app_loop.snapshot().lifecycle_tick_request_count, 4);
    }

    #[test]
    fn shown_window_ticks_lifecycle_and_requests_redraw_again() {
        let mut app_loop = NativeProductAppLoop::new();
        app_loop.record_resumed();
        app_loop.record_redraw_dispatch_started();
        app_loop.record_visibility_changed(false);

        let shown = app_loop.record_visibility_changed(true);

        assert!(shown.tick_host_lifecycle);
        assert!(shown.request_redraw);
        assert!(app_loop.snapshot().visible);
        assert_eq!(app_loop.snapshot().visibility_change_count, 2);
        assert_eq!(app_loop.snapshot().redraw_request_count, 2);
    }

    #[test]
    fn idle_wait_ticks_host_lifecycle_without_advancing_frames() {
        let mut app_loop = NativeProductAppLoop::new();
        app_loop.record_resumed();
        app_loop.record_redraw_dispatch_started();
        app_loop.record_frame_completed(false);

        let action = app_loop.about_to_wait(false);

        assert!(action.tick_host_lifecycle);
        assert!(!action.request_redraw);
        assert_eq!(app_loop.snapshot().lifecycle_tick_request_count, 2);
    }

    #[test]
    fn hidden_retry_ticks_host_lifecycle_until_redraw_is_available() {
        let mut app_loop = NativeProductAppLoop::new();
        app_loop.record_resumed();
        app_loop.record_redraw_dispatch_started();
        app_loop.record_visibility_changed(false);

        let hidden_retry = app_loop.record_frame_retry_requested();

        assert!(hidden_retry.tick_host_lifecycle);
        assert!(!hidden_retry.request_redraw);
        assert!(!app_loop.snapshot().redraw_pending);
        assert_eq!(app_loop.snapshot().redraw_request_count, 1);
        assert_eq!(app_loop.snapshot().lifecycle_tick_request_count, 3);
    }
}
