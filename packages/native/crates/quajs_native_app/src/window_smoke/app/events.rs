use winit::application::ApplicationHandler;
use winit::event::WindowEvent;
use winit::event_loop::ActiveEventLoop;
use winit::window::WindowId;

use super::NativeWindowSmokeApp;
use crate::product_app_shell::NativeProductAppShellRedrawDecision;
use crate::product_window::{NativeProductWindowPhysicalSize, NativeProductWindowPresentFailure};
use crate::window_smoke::frame::normalized_physical_size;
use crate::window_smoke::input::{pointer_button_from_winit, pointer_phase_from_element_state};

impl ApplicationHandler for NativeWindowSmokeApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if let Err(error) = self.initialize(event_loop) {
            self.fail_and_exit(event_loop, error);
            return;
        }
        let action = match self.product_shell.as_mut() {
            Some(product_shell) => product_shell.record_resumed(),
            None => return,
        };
        match action {
            Ok(action) => {
                self.apply_product_shell_action(event_loop, action);
            }
            Err(error) => self.fail_and_exit(
                event_loop,
                crate::window_smoke::NativeWindowSmokeError::new(format!(
                    "Native renderer smoke app resume failed: {error}."
                )),
            ),
        }
    }

    fn suspended(&mut self, event_loop: &ActiveEventLoop) {
        let action = match self.product_shell.as_mut() {
            Some(product_shell) => product_shell.record_suspended(),
            None => return,
        };
        match action {
            Ok(action) => {
                self.apply_product_shell_action(event_loop, action);
            }
            Err(error) => self.fail_and_exit(
                event_loop,
                crate::window_smoke::NativeWindowSmokeError::new(format!(
                    "Native renderer smoke app suspend failed: {error}."
                )),
            ),
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
                    self.record_surface_changed(event_loop);
                }
            }
            WindowEvent::ScaleFactorChanged { .. } => {
                let size = self.window.as_ref().map(|window| window.inner_size());
                if let Some(size) = size {
                    if let Err(error) = self.resize_surface(size) {
                        self.fail_and_exit(event_loop, error);
                    } else {
                        self.record_surface_changed(event_loop);
                    }
                }
            }
            WindowEvent::Occluded(occluded) => {
                if occluded {
                    if let Err(error) = self.cancel_window_ime_composition() {
                        self.fail_and_exit(event_loop, error);
                        return;
                    }
                    self.cancel_window_pointer_interaction();
                    self.input.clear_cursor_position();
                }
                self.record_visibility_changed(event_loop, !occluded);
            }
            WindowEvent::CursorMoved { position, .. } => {
                if let Some(window) = &self.window {
                    self.input
                        .update_cursor_position(position, window.scale_factor());
                }
                if let Some(point) = self.input.cursor_client_point() {
                    match self.dispatch_window_pointer_move(point) {
                        Ok(true) => self.request_redraw(),
                        Ok(false) => {}
                        Err(error) => self.fail_and_exit(event_loop, error),
                    }
                }
            }
            WindowEvent::CursorLeft { .. } => {
                let visual_state_changed = self.cancel_window_pointer_interaction();
                self.input.clear_cursor_position();
                if visual_state_changed {
                    self.request_redraw();
                }
            }
            WindowEvent::Focused(focused) => {
                if let Err(error) = self.dispatch_window_focus_event(focused) {
                    self.fail_and_exit(event_loop, error);
                    return;
                }
                if !focused {
                    if let Err(error) = self.cancel_window_ime_composition() {
                        self.fail_and_exit(event_loop, error);
                        return;
                    }
                    self.cancel_window_pointer_interaction();
                    self.input.clear_cursor_position();
                }
                self.record_focus_changed(event_loop, focused);
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
                match self.dispatch_window_pointer_input(phase, button) {
                    Ok(true) => self.request_redraw(),
                    Ok(false) => {}
                    Err(error) => self.fail_and_exit(event_loop, error),
                }
            }
            WindowEvent::RedrawRequested => {
                if !self.needs_more_frames() {
                    event_loop.exit();
                    return;
                }
                if let Some(product_shell) = self.product_shell.as_mut() {
                    product_shell.record_redraw_dispatch_started();
                }
                if self.redraw_once_or_schedule_retry(event_loop) {
                    return;
                }
                event_loop.exit();
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        let action = match self.product_shell.as_mut() {
            Some(product_shell) => product_shell.about_to_wait(),
            None => return,
        };
        self.apply_or_fail_app_shell_action(
            event_loop,
            action,
            "Native renderer smoke idle lifecycle handling failed",
        );
    }
}

impl NativeWindowSmokeApp {
    fn needs_more_frames(&self) -> bool {
        self.product_shell
            .as_ref()
            .map(|product_shell| product_shell.needs_more_frames())
            .unwrap_or(true)
    }

    fn redraw_once_or_schedule_retry(&mut self, event_loop: &ActiveEventLoop) -> bool {
        match self.render_once() {
            Ok(report) => {
                self.report = Some(report);
                let action = match self.product_shell.as_mut() {
                    Some(product_shell) => product_shell.record_frame_completed(),
                    None => return false,
                };
                match action {
                    Ok(action) => {
                        let request_redraw = action.request_redraw;
                        self.apply_product_shell_action(event_loop, action) && request_redraw
                    }
                    Err(error) => {
                        self.fail_and_exit(
                            event_loop,
                            crate::window_smoke::NativeWindowSmokeError::new(format!(
                                "Native renderer smoke frame completion failed: {error}."
                            )),
                        );
                        false
                    }
                }
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
        let Some(product_shell) = self.product_shell.as_mut() else {
            self.error = Some(error);
            return false;
        };
        let present_failure = error
            .present_failure()
            .cloned()
            .unwrap_or_else(|| NativeProductWindowPresentFailure::from_message(error.to_string()));
        match product_shell.handle_redraw_failure(&present_failure, recovery_size) {
            Ok(NativeProductAppShellRedrawDecision::RetryRedraw { action, .. }) => {
                let progressed = action.request_redraw || action.lifecycle_report.is_some();
                self.apply_product_shell_action(event_loop, action) && progressed
            }
            Ok(NativeProductAppShellRedrawDecision::Fail { .. }) => {
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

    fn record_surface_changed(&mut self, event_loop: &ActiveEventLoop) {
        let action = match self.product_shell.as_mut() {
            Some(product_shell) => product_shell.record_surface_changed(),
            None => return,
        };
        self.apply_or_fail_app_shell_action(
            event_loop,
            action,
            "Native renderer smoke surface-change handling failed",
        );
    }

    fn record_visibility_changed(&mut self, event_loop: &ActiveEventLoop, visible: bool) {
        let action = match self.product_shell.as_mut() {
            Some(product_shell) => product_shell.record_visibility_changed(visible),
            None => return,
        };
        self.apply_or_fail_app_shell_action(
            event_loop,
            action,
            "Native renderer smoke visibility handling failed",
        );
    }

    fn record_focus_changed(&mut self, event_loop: &ActiveEventLoop, focused: bool) {
        let action = match self.product_shell.as_mut() {
            Some(product_shell) => product_shell.record_focus_changed(focused),
            None => return,
        };
        self.apply_or_fail_app_shell_action(
            event_loop,
            action,
            "Native renderer smoke focus handling failed",
        );
    }

    fn apply_or_fail_app_shell_action(
        &mut self,
        event_loop: &ActiveEventLoop,
        action: Result<
            crate::product_app_shell::NativeProductAppShellAction,
            crate::product_window_loop::NativeProductWindowLoopError,
        >,
        label: &str,
    ) {
        match action {
            Ok(action) => {
                self.apply_product_shell_action(event_loop, action);
            }
            Err(error) => self.fail_and_exit(
                event_loop,
                crate::window_smoke::NativeWindowSmokeError::new(format!("{label}: {error}.")),
            ),
        }
    }
}
