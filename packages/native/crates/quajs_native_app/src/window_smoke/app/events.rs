use winit::application::ApplicationHandler;
use winit::event::WindowEvent;
use winit::event_loop::ActiveEventLoop;
use winit::window::WindowId;

use super::NativeWindowSmokeApp;
use crate::window_smoke::input::{pointer_button_from_winit, pointer_phase_from_element_state};
use crate::window_smoke::present_loop::NativeWindowSmokePresentFailureAction;

impl ApplicationHandler for NativeWindowSmokeApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if let Err(error) = self.initialize(event_loop) {
            self.fail_and_exit(event_loop, error);
        }
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        window_id: WindowId,
        event: WindowEvent,
    ) {
        if self.window.as_ref().map(|window| window.id()) != Some(window_id) {
            return;
        }

        match event {
            WindowEvent::CloseRequested => event_loop.exit(),
            WindowEvent::Resized(size) => {
                if let Err(error) = self.resize_surface(size) {
                    self.fail_and_exit(event_loop, error);
                } else {
                    self.request_redraw();
                }
            }
            WindowEvent::ScaleFactorChanged { .. } => {
                let size = self.window.as_ref().map(|window| window.inner_size());
                if let Some(size) = size {
                    if let Err(error) = self.resize_surface(size) {
                        self.fail_and_exit(event_loop, error);
                    } else {
                        self.request_redraw();
                    }
                }
            }
            WindowEvent::CursorMoved { position, .. } => {
                if let Some(window) = &self.window {
                    self.input
                        .update_cursor_position(position, window.scale_factor());
                }
            }
            WindowEvent::CursorLeft { .. } => {
                self.cancel_window_pointer_interaction();
                self.input.clear_cursor_position();
            }
            WindowEvent::Focused(focused) => {
                if let Err(error) = self
                    .input
                    .dispatch_focus_event(&mut self.texture_host, focused)
                {
                    self.fail_and_exit(event_loop, error);
                    return;
                }
                if !focused {
                    self.cancel_window_pointer_interaction();
                    self.input.clear_cursor_position();
                }
            }
            WindowEvent::KeyboardInput { event, .. } => {
                if let Err(error) = self
                    .input
                    .dispatch_keyboard_event(&mut self.texture_host, &event)
                {
                    self.fail_and_exit(event_loop, error);
                }
            }
            WindowEvent::Ime(event) => {
                self.input.record_ime_event(&event);
            }
            WindowEvent::MouseInput { state, button, .. } => {
                let phase = pointer_phase_from_element_state(state);
                let button = pointer_button_from_winit(button);
                if let Err(error) = self.dispatch_window_pointer_input(phase, button) {
                    self.fail_and_exit(event_loop, error);
                }
            }
            WindowEvent::RedrawRequested => {
                if self.needs_more_frames() && self.redraw_once_or_schedule_retry() {
                    return;
                }
                event_loop.exit();
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, _event_loop: &ActiveEventLoop) {
        if self.needs_more_frames() {
            self.request_redraw();
        }
    }
}

impl NativeWindowSmokeApp {
    fn needs_more_frames(&self) -> bool {
        self.rendered_frame_count < self.target_frame_count
    }

    fn redraw_once_or_schedule_retry(&mut self) -> bool {
        let allow_occluded_report = self.present_loop.next_attempt_allows_occluded_report();
        match self.render_once(allow_occluded_report) {
            Ok(report) => {
                self.report = Some(report);
                if self.needs_more_frames() {
                    self.request_redraw();
                    true
                } else {
                    false
                }
            }
            Err(error) => self.handle_redraw_failure(error),
        }
    }

    fn handle_redraw_failure(
        &mut self,
        error: crate::window_smoke::NativeWindowSmokeError,
    ) -> bool {
        match self.present_loop.classify_failure(&error) {
            NativeWindowSmokePresentFailureAction::RetryRedraw => {
                self.request_redraw();
                true
            }
            NativeWindowSmokePresentFailureAction::RecoverSurface => {
                if let Err(recovery_error) = self.recover_surface_from_window_size() {
                    self.error = Some(recovery_error);
                    false
                } else {
                    self.request_redraw();
                    true
                }
            }
            NativeWindowSmokePresentFailureAction::Fail => {
                self.error = Some(error);
                false
            }
        }
    }
}
