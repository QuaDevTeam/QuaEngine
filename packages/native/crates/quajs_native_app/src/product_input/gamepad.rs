use super::*;
use quajs_wgpu_renderer::{
    input::native_renderer_intent_from_hit,
    renderer::state::{FocusAction, FocusResult},
};

impl NativeProductInputController {
    // Standard Gamepad button indices are shared with Web and scene renderers.
    pub(crate) fn dispatch_gamepad<B: NativeRenderBackend, A, V, F, H: NativeHostApi>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V, F>,
        host: &mut H,
        pad: u64,
        button: u8,
        pressed: bool,
    ) -> Result<bool, NativeProductInputError> {
        if !matches!(button, 0 | 1 | 5 | 7 | 9 | 12..=15) {
            return Ok(false);
        }
        let changed = if pressed {
            self.gamepad_buttons.insert((pad, button))
        } else {
            self.gamepad_buttons.remove(&(pad, button))
        };
        if !changed {
            return Ok(false);
        }
        if matches!(button, 5 | 7)
            && self
                .gamepad_buttons
                .iter()
                .any(|&(other, b)| other != pad && b == button)
        {
            return Ok(false);
        }
        if pressed {
            let navigation = match button {
                0 => Some(FocusAction::Activate),
                12 => Some(FocusAction::Previous),
                13 => Some(FocusAction::Next),
                14 => Some(FocusAction::Left),
                15 => Some(FocusAction::Right),
                _ => None,
            };
            if let Some(action) = navigation {
                match renderer.state_mut().navigate_focus(action) {
                    FocusResult::Intent(hit) => {
                        host.emit_renderer_intent(native_renderer_intent_from_hit(&hit))
                            .map_err(NativeProductInputError::from_host_error)?;
                        return Ok(true);
                    }
                    FocusResult::Focused => return Ok(true),
                    FocusResult::Unhandled => {}
                }
            }
        }
        emit_gamepad_command(host, pad, button, pressed)
    }

    pub(crate) fn release_gamepad_buttons<H: NativeHostApi>(
        &mut self,
        host: &mut H,
        pad: Option<u64>,
    ) -> Result<(), NativeProductInputError> {
        let held = self
            .gamepad_buttons
            .iter()
            .copied()
            .filter(|(id, _)| pad.is_none_or(|pad| pad == *id))
            .collect::<Vec<_>>();
        for (id, button) in held {
            self.gamepad_buttons.remove(&(id, button));
            if !self.gamepad_buttons.iter().any(|&(_, held)| held == button) {
                emit_gamepad_command(host, id, button, false)?;
            }
        }
        Ok(())
    }
}

fn emit_gamepad_command<H: NativeHostApi>(
    host: &mut H,
    pad: u64,
    button: u8,
    pressed: bool,
) -> Result<bool, NativeProductInputError> {
    let command = match (button, pressed) {
        (0, true) => "advance",
        (1, true) => "ui:cancel",
        (5, true) => "fastForward:start",
        (5, false) => "fastForward:stop",
        (7, true) => "skip:start",
        (7, false) => "skip:stop",
        (9, true) => "ui:menu",
        (12, true) => "choice:previous",
        (13, true) => "choice:next",
        _ => return Ok(false),
    };
    emit_native_renderer_intent(
        host,
        "user/input_command",
        Some(json!({
            "command": command, "device":"gamepad", "source": format!("gamepad:{pad}:button:{button}"),
            "pressed": pressed, "repeat": false, "timestamp":native_input_timestamp_ms(),
            "metadata":{"button":button,"gamepadIndex":pad},
        })),
    )?;
    Ok(true)
}
