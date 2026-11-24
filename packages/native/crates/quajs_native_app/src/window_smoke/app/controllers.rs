use super::NativeWindowSmokeApp;
use crate::product_input::logical_client_point_from_physical;
use crate::window_smoke::{
    error::NativeWindowSmokeError, gamepads::GamepadEvent, input::input_error,
};

impl NativeWindowSmokeApp {
    pub(super) fn dispatch_window_touch(
        &mut self,
        touch: winit::event::Touch,
    ) -> Result<(), NativeWindowSmokeError> {
        let (Some(shell), Some(window)) = (self.product_shell.as_mut(), self.window.as_ref())
        else {
            return Ok(());
        };
        let point = logical_client_point_from_physical(touch.location, window.scale_factor());
        let (renderer, host) = shell
            .window_loop_mut()
            .runtime_mut()
            .renderer_and_host_mut();
        if let Some(delta) = self
            .input
            .product_input
            .dispatch_touch(renderer, host, touch.id, touch.phase, point)
            .map_err(input_error)?
        {
            self.scroll_window_at(delta.anchor, delta.dx, delta.dy);
        }
        self.last_input_at = Some(std::time::Instant::now());
        self.flush_dev_renderer_intents()?;
        self.request_redraw();
        Ok(())
    }

    pub(super) fn clear_window_input(&mut self) -> Result<(), NativeWindowSmokeError> {
        #[cfg(target_os = "android")]
        self.gamepads.android.clear();
        self.cancel_window_pointer_interaction();
        self.input.clear_cursor_position();
        if let Some(shell) = self.product_shell.as_mut() {
            let (renderer, host) = shell
                .window_loop_mut()
                .runtime_mut()
                .renderer_and_host_mut();
            self.input.product_input.cancel_touch(renderer);
            self.input
                .product_input
                .release_gamepad_buttons(host, None)
                .map_err(input_error)?;
        }
        self.flush_dev_renderer_intents()
    }

    pub(super) fn handle_gamepad(
        &mut self,
        event: GamepadEvent,
    ) -> Result<(), NativeWindowSmokeError> {
        let Some(shell) = self.product_shell.as_mut() else {
            return Ok(());
        };
        let (renderer, host) = shell
            .window_loop_mut()
            .runtime_mut()
            .renderer_and_host_mut();
        match event {
            GamepadEvent::Button(pad, button, pressed) => {
                if !self
                    .input
                    .product_input
                    .dispatch_gamepad(renderer, host, pad, button, pressed)
                    .map_err(input_error)?
                {
                    return Ok(());
                }
            }
            GamepadEvent::Disconnected(pad) => self
                .input
                .product_input
                .release_gamepad_buttons(host, Some(pad))
                .map_err(input_error)?,
        }
        self.last_input_at = Some(std::time::Instant::now());
        self.flush_dev_renderer_intents()?;
        self.request_redraw();
        Ok(())
    }

    pub(super) fn poll_window_gamepads(
        &mut self,
        visible: bool,
    ) -> Result<Option<std::time::Instant>, NativeWindowSmokeError> {
        let active = visible
            && self.first_frame_ready
            && !self.frame_resources_pending
            && !crate::window_smoke::editor_preview::enabled()
            && self
                .window
                .as_ref()
                .is_some_and(|window| window.has_focus());
        let mut events = Vec::new();
        let deadline = self.gamepads.poll(active, &mut events);
        for event in events {
            self.handle_gamepad(event)?;
        }
        Ok(deadline)
    }
}
