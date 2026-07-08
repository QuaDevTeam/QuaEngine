use winit::application::ApplicationHandler;
use winit::event::WindowEvent;
use winit::event_loop::ActiveEventLoop;
use winit::window::WindowId;

use super::NativeWindowSmokeApp;
use crate::product_window::{NativeProductWindowPhysicalSize, NativeProductWindowPresentFailure};
use crate::product_window_loop::NativeProductWindowLoopFailureAction;
use crate::window_smoke::frame::normalized_physical_size;
use crate::window_smoke::input::{pointer_button_from_winit, pointer_phase_from_element_state};

impl ApplicationHandler for NativeWindowSmokeApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if let Err(error) = self.initialize(event_loop) {
            self.fail_and_exit(event_loop, error);
            return;
        }
        let action = self.app_loop.record_resumed();
        self.apply_app_loop_action(event_loop, action);
    }

    fn suspended(&mut self, event_loop: &ActiveEventLoop) {
        let action = self.app_loop.record_suspended();
        self.apply_app_loop_action(event_loop, action);
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
                    let action = self.app_loop.record_surface_changed();
                    self.apply_app_loop_action(event_loop, action);
                }
            }
            WindowEvent::ScaleFactorChanged { .. } => {
                let size = self.window.as_ref().map(|window| window.inner_size());
                if let Some(size) = size {
                    if let Err(error) = self.resize_surface(size) {
                        self.fail_and_exit(event_loop, error);
                    } else {
                        let action = self.app_loop.record_surface_changed();
                        self.apply_app_loop_action(event_loop, action);
                    }
                }
            }
            WindowEvent::Occluded(occluded) => {
                let action = self.app_loop.record_visibility_changed(!occluded);
                if occluded {
                    self.cancel_window_pointer_interaction();
                    self.input.clear_cursor_position();
                }
                self.apply_app_loop_action(event_loop, action);
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
                if let Err(error) = self.dispatch_window_focus_event(focused) {
                    self.fail_and_exit(event_loop, error);
                    return;
                }
                if !focused {
                    self.cancel_window_pointer_interaction();
                    self.input.clear_cursor_position();
                }
                let action = self.app_loop.record_focus_changed(focused);
                self.apply_app_loop_action(event_loop, action);
            }
            WindowEvent::KeyboardInput { event, .. } => {
                if let Err(error) = self.dispatch_window_keyboard_event(&event) {
                    self.fail_and_exit(event_loop, error);
                }
            }
            WindowEvent::Ime(event) => {
                if let Err(error) = self.dispatch_window_ime_event(&event) {
                    self.fail_and_exit(event_loop, error);
                }
            }
            WindowEvent::MouseInput { state, button, .. } => {
                let phase = pointer_phase_from_element_state(state);
                let button = pointer_button_from_winit(button);
                if let Err(error) = self.dispatch_window_pointer_input(phase, button) {
                    self.fail_and_exit(event_loop, error);
                }
            }
            WindowEvent::RedrawRequested => {
                if !self.needs_more_frames() {
                    event_loop.exit();
                    return;
                }
                self.app_loop.record_redraw_dispatch_started();
                if self.redraw_once_or_schedule_retry(event_loop) {
                    return;
                }
                event_loop.exit();
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        let action = self.app_loop.about_to_wait(self.needs_more_frames());
        self.apply_app_loop_action(event_loop, action);
    }
}

impl NativeWindowSmokeApp {
    fn needs_more_frames(&self) -> bool {
        self.window_loop
            .as_ref()
            .map(|window_loop| window_loop.needs_more_frames())
            .unwrap_or(true)
    }

    fn redraw_once_or_schedule_retry(&mut self, event_loop: &ActiveEventLoop) -> bool {
        match self.render_once() {
            Ok(report) => {
                self.report = Some(report);
                let action = self
                    .app_loop
                    .record_frame_completed(self.needs_more_frames());
                self.apply_app_loop_action(event_loop, action) && action.request_redraw
            }
            Err(error) => self.handle_redraw_failure(event_loop, error),
        }
    }

    fn handle_redraw_failure(
        &mut self,
        event_loop: &ActiveEventLoop,
        error: crate::window_smoke::NativeWindowSmokeError,
    ) -> bool {
        let recovery_size = self.window.as_ref().map(|window| {
            let size = normalized_physical_size(window.inner_size());
            NativeProductWindowPhysicalSize::new(size.width, size.height)
        });
        let Some(window_loop) = self.window_loop.as_mut() else {
            self.error = Some(error);
            return false;
        };
        let present_failure = error
            .present_failure()
            .cloned()
            .unwrap_or_else(|| NativeProductWindowPresentFailure::from_message(error.to_string()));
        match window_loop.handle_redraw_failure(&present_failure, recovery_size) {
            Ok(report) if report.action == NativeProductWindowLoopFailureAction::RetryRedraw => {
                let action = self.app_loop.record_frame_retry_requested();
                self.apply_app_loop_action(event_loop, action)
                    && (action.request_redraw || action.tick_host_lifecycle)
            }
            Ok(_) => {
                self.error = Some(error);
                false
            }
            Err(recovery_error) => {
                self.error = Some(crate::window_smoke::NativeWindowSmokeError::new(format!(
                    "Failed to recover native renderer smoke product window surface: {recovery_error}."
                )));
                false
            }
        }
    }
}
