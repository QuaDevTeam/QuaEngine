use winit::application::ApplicationHandler;
use winit::event::{MouseScrollDelta, WindowEvent};
use winit::event_loop::{ActiveEventLoop, ControlFlow};
use winit::window::WindowId;

use super::{NativeWindowSmokeApp, INTERACTION_PROBE_TIMEOUT};
/// Logical pixels per notched wheel line. Browsers use ~40 px; matching that
/// keeps native scroll speed consistent with the Web demo.
const WHEEL_LINE_LOGICAL_PIXELS: f64 = 40.0;
use crate::product_app_shell::NativeProductAppShellRedrawDecision;
use crate::product_window::{
    NativeProductWindowPhysicalSize, NativeProductWindowPresentFailure,
    NativeProductWindowPresentFailureKind,
};
use crate::window_smoke::config::{
    native_window_dev_enabled, native_window_interaction_probe_enabled,
};
use crate::window_smoke::frame::normalized_physical_size;
use crate::window_smoke::input::{pointer_button_from_winit, pointer_phase_from_element_state};

impl ApplicationHandler for NativeWindowSmokeApp {
    fn user_event(&mut self, _event_loop: &ActiveEventLoop, _event: ()) {
        #[cfg(feature = "quickjs-rquickjs")]
        {
            self.ingest_quickjs_pipeline_updates();
            // The projection worker also wakes the loop after publishing a
            // frame. Draw it instead of waiting for the next input event.
            if self
                .projection_worker
                .as_ref()
                .is_some_and(|worker| worker.has_fresh_projection())
            {
                self.request_redraw();
            }
        }
    }

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
                self.last_input_at = Some(std::time::Instant::now());
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
                self.last_input_at = Some(std::time::Instant::now());
                let phase = pointer_phase_from_element_state(state);
                let button = pointer_button_from_winit(button);
                match self.dispatch_window_pointer_input(phase, button) {
                    Ok(true) => self.request_redraw(),
                    Ok(false) => {}
                    Err(error) => self.fail_and_exit(event_loop, error),
                }
            }
            WindowEvent::MouseWheel { delta, .. } => {
                let (delta_x, delta_y) = match delta {
                    // A line delta is a notched wheel. Browsers translate one
                    // notch to roughly 40 logical pixels, so match that to keep
                    // native scroll distance comparable to the Web build.
                    MouseScrollDelta::LineDelta(x, y) => (
                        f64::from(x) * WHEEL_LINE_LOGICAL_PIXELS,
                        f64::from(y) * WHEEL_LINE_LOGICAL_PIXELS,
                    ),
                    // A pixel delta is a trackpad/precision device and arrives in
                    // physical pixels, so it needs the same scale-factor divide
                    // the cursor position gets.
                    MouseScrollDelta::PixelDelta(position) => {
                        let scale_factor = self
                            .window
                            .as_ref()
                            .map(|window| window.scale_factor())
                            .unwrap_or(1.0);
                        let scale_factor = if scale_factor > 0.0 {
                            scale_factor
                        } else {
                            1.0
                        };
                        (position.x / scale_factor, position.y / scale_factor)
                    }
                };
                // Wheel y is positive when scrolling up, but scroll offsets grow
                // downward, so the sign flips.
                self.last_input_at = Some(std::time::Instant::now());
                if self.dispatch_window_scroll(-delta_x, -delta_y) {
                    self.request_redraw();
                }
            }
            WindowEvent::RedrawRequested => {
                if !self.needs_more_frames() {
                    if native_window_dev_enabled() {
                        return;
                    }
                    event_loop.exit();
                    return;
                }
                if let Some(product_shell) = self.product_shell.as_mut() {
                    product_shell.record_redraw_dispatch_started();
                }
                if self.redraw_once_or_schedule_retry(event_loop) {
                    return;
                }
                // Dev windows stay interactive after a frame that does not
                // schedule another redraw. Smoke runs exit once their target
                // frame count has been reached, while dev runs must wait for
                // user input, resize, or a QuickJS pipeline update.
                if !native_window_dev_enabled() {
                    event_loop.exit();
                }
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        #[cfg(feature = "quickjs-rquickjs")]
        self.ingest_quickjs_pipeline_updates();
        // Frame pacing is owned by the surface present mode (vsync), so the
        // event loop simply sleeps until winit, the compositor, or the
        // projection worker wakes it. No software frame deadline is polled.
        event_loop.set_control_flow(ControlFlow::Wait);
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
        #[cfg(feature = "quickjs-rquickjs")]
        if self.quickjs_product.is_some() {
            let product_needs_frames = self
                .product_shell
                .as_ref()
                .is_some_and(|shell| shell.needs_more_frames());
            return native_window_dev_enabled()
                || product_needs_frames
                || self.renderer_redraw_pending
                || self.renderer_local_work_active
                || self
                    .product_shell
                    .as_ref()
                    .is_some_and(|shell| shell.window_loop().has_active_interaction_transition())
                || (native_window_interaction_probe_enabled()
                    && !self.interaction_probe_advance_observed
                    && self
                        .interaction_probe_started_at
                        .map(|started_at| started_at.elapsed() < INTERACTION_PROBE_TIMEOUT)
                        .unwrap_or(true));
        }
        if native_window_interaction_probe_enabled() {
            return !self.interaction_probe_advance_observed
                && self
                    .interaction_probe_started_at
                    .map(|started_at| started_at.elapsed() < INTERACTION_PROBE_TIMEOUT)
                    .unwrap_or(true);
        }
        let product_needs_frames = self
            .product_shell
            .as_ref()
            .map(|product_shell| product_shell.needs_more_frames())
            .unwrap_or(true);
        product_needs_frames
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
                        #[cfg(feature = "quickjs-rquickjs")]
                        let request_redraw = if self.quickjs_product.is_some() {
                            self.product_shell
                                .as_ref()
                                .is_some_and(|shell| shell.needs_more_frames())
                                || self.renderer_local_work_active
                                || self.product_shell.as_ref().is_some_and(|shell| {
                                    shell.window_loop().has_active_interaction_transition()
                                })
                                || (native_window_interaction_probe_enabled()
                                    && !self.interaction_probe_advance_observed
                                    && self
                                        .interaction_probe_started_at
                                        .map(|started_at| {
                                            started_at.elapsed() < INTERACTION_PROBE_TIMEOUT
                                        })
                                        .unwrap_or(true))
                        } else {
                            action.request_redraw
                        };
                        #[cfg(not(feature = "quickjs-rquickjs"))]
                        let request_redraw = action.request_redraw;
                        let applied = self.apply_product_shell_action(event_loop, action);
                        if request_redraw {
                            self.request_redraw();
                        }
                        applied && request_redraw
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
        if let Some(product_frame) = error.product_frame().cloned() {
            self.record_product_frame_texture_metrics(&product_frame);
        }
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
                if native_window_dev_enabled()
                    && matches!(
                        present_failure.kind(),
                        NativeProductWindowPresentFailureKind::Occluded
                            | NativeProductWindowPresentFailureKind::Timeout
                    )
                {
                    return true;
                }
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
