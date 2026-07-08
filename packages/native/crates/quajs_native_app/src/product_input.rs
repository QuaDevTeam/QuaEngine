use std::fmt::{Display, Formatter};

use quajs_native_runtime::{NativeHostApi, NativeHostApiError, NativeRendererIntent};
use quajs_wgpu_renderer::input::{
    NativePointerButton, NativePointerEvent, NativePointerEventPhase,
};
use quajs_wgpu_renderer::renderer::{NativeRenderBackend, NativeRenderer};
use quajs_wgpu_renderer::stage_layout::{StageClientPoint, StageClientRectOrigin};
use serde_json::{json, Value};
use winit::dpi::PhysicalPosition;
use winit::event::{ElementState, Ime, KeyEvent, MouseButton};
use winit::keyboard::{KeyCode, PhysicalKey};

const DEFAULT_NATIVE_PRODUCT_POINTER_ID: u64 = 1;

#[derive(Debug)]
pub(crate) struct NativeProductInputError {
    message: String,
}

impl NativeProductInputError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    fn from_host_error(error: NativeHostApiError) -> Self {
        Self::new(format!(
            "native product input intent failed: {}",
            error.message()
        ))
    }
}

impl Display for NativeProductInputError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for NativeProductInputError {}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductFocusEventReport {
    pub(crate) focused: bool,
    pub(crate) intent_emitted: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductKeyboardEventReport {
    pub(crate) state: ElementState,
    pub(crate) repeat: bool,
    pub(crate) intent_emitted: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NativeProductImeEventKind {
    Enabled,
    Disabled,
    Preedit,
    Commit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductImeEventReport {
    pub(crate) kind: NativeProductImeEventKind,
    pub(crate) text_byte_count: Option<usize>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductPointerDispatchReport {
    pub(crate) dispatched: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct NativeProductInputController {
    cursor_client_point: Option<StageClientPoint>,
    pointer_id: u64,
}

impl Default for NativeProductInputController {
    fn default() -> Self {
        Self::new()
    }
}

impl NativeProductInputController {
    pub(crate) fn new() -> Self {
        Self {
            cursor_client_point: None,
            pointer_id: DEFAULT_NATIVE_PRODUCT_POINTER_ID,
        }
    }

    #[allow(dead_code)]
    pub(crate) fn with_pointer_id(pointer_id: u64) -> Self {
        Self {
            cursor_client_point: None,
            pointer_id,
        }
    }

    pub(crate) fn cursor_client_point(&self) -> Option<StageClientPoint> {
        self.cursor_client_point
    }

    pub(crate) fn update_cursor_position(
        &mut self,
        position: PhysicalPosition<f64>,
        scale_factor: f64,
    ) -> StageClientPoint {
        let point = logical_client_point_from_physical(position, scale_factor);
        self.cursor_client_point = Some(point);
        point
    }

    pub(crate) fn clear_cursor_position(&mut self) {
        self.cursor_client_point = None;
    }

    pub(crate) fn dispatch_focus_event<H>(
        &mut self,
        host: &mut H,
        focused: bool,
    ) -> Result<NativeProductFocusEventReport, NativeProductInputError>
    where
        H: NativeHostApi,
    {
        let event_type = if focused {
            "window/focus"
        } else {
            "window/blur"
        };
        emit_native_renderer_intent(host, event_type, None)?;
        Ok(NativeProductFocusEventReport {
            focused,
            intent_emitted: true,
        })
    }

    pub(crate) fn dispatch_keyboard_event<H>(
        &mut self,
        host: &mut H,
        event: &KeyEvent,
    ) -> Result<NativeProductKeyboardEventReport, NativeProductInputError>
    where
        H: NativeHostApi,
    {
        match event.physical_key {
            PhysicalKey::Code(code) => {
                self.dispatch_keyboard_code(host, code, event.state, event.repeat)
            }
            PhysicalKey::Unidentified(_) => Ok(NativeProductKeyboardEventReport {
                state: event.state,
                repeat: event.repeat,
                intent_emitted: false,
            }),
        }
    }

    pub(crate) fn dispatch_keyboard_code<H>(
        &mut self,
        host: &mut H,
        code: KeyCode,
        state: ElementState,
        repeat: bool,
    ) -> Result<NativeProductKeyboardEventReport, NativeProductInputError>
    where
        H: NativeHostApi,
    {
        let Some(payload) =
            build_keyboard_input_command_payload(code, state, repeat, native_input_timestamp_ms())
        else {
            return Ok(NativeProductKeyboardEventReport {
                state,
                repeat,
                intent_emitted: false,
            });
        };
        emit_native_renderer_intent(host, "user/input_command", Some(payload))?;
        Ok(NativeProductKeyboardEventReport {
            state,
            repeat,
            intent_emitted: true,
        })
    }

    pub(crate) fn summarize_ime_event(event: &Ime) -> NativeProductImeEventReport {
        match event {
            Ime::Enabled => NativeProductImeEventReport {
                kind: NativeProductImeEventKind::Enabled,
                text_byte_count: None,
            },
            Ime::Disabled => NativeProductImeEventReport {
                kind: NativeProductImeEventKind::Disabled,
                text_byte_count: None,
            },
            Ime::Preedit(text, _) => NativeProductImeEventReport {
                kind: NativeProductImeEventKind::Preedit,
                text_byte_count: Some(text.len()),
            },
            Ime::Commit(text) => NativeProductImeEventReport {
                kind: NativeProductImeEventKind::Commit,
                text_byte_count: Some(text.len()),
            },
        }
    }

    pub(crate) fn cancel_pointer_interaction<B, A>(
        &mut self,
        renderer: &mut NativeRenderer<B, A>,
    ) -> bool
    where
        B: NativeRenderBackend,
    {
        renderer.cancel_pointer_interaction(self.pointer_id)
    }

    pub(crate) fn dispatch_pointer_event<B, A, H>(
        &mut self,
        renderer: &mut NativeRenderer<B, A>,
        host: &mut H,
        phase: NativePointerEventPhase,
        point: StageClientPoint,
        button: NativePointerButton,
    ) -> Result<NativeProductPointerDispatchReport, NativeProductInputError>
    where
        B: NativeRenderBackend,
        H: NativeHostApi,
    {
        let event = NativePointerEvent::new(phase, point, StageClientRectOrigin::default())
            .with_pointer_id(self.pointer_id)
            .with_button(button);
        let dispatch = renderer
            .pointer_event_and_emit_intent(event, host)
            .map_err(NativeProductInputError::from_host_error)?;

        Ok(NativeProductPointerDispatchReport {
            dispatched: dispatch.is_some(),
        })
    }
}

pub(crate) fn pointer_phase_from_element_state(state: ElementState) -> NativePointerEventPhase {
    match state {
        ElementState::Pressed => NativePointerEventPhase::Press,
        ElementState::Released => NativePointerEventPhase::Release,
    }
}

pub(crate) fn pointer_button_from_winit(button: MouseButton) -> NativePointerButton {
    match button {
        MouseButton::Left => NativePointerButton::Primary,
        MouseButton::Right => NativePointerButton::Secondary,
        MouseButton::Middle => NativePointerButton::Auxiliary,
        MouseButton::Back => NativePointerButton::Other(4),
        MouseButton::Forward => NativePointerButton::Other(5),
        MouseButton::Other(value) => NativePointerButton::Other(value),
    }
}

fn logical_client_point_from_physical(
    position: PhysicalPosition<f64>,
    scale_factor: f64,
) -> StageClientPoint {
    let scale_factor = normalized_scale_factor(scale_factor);
    StageClientPoint {
        client_x: position.x / scale_factor,
        client_y: position.y / scale_factor,
    }
}

fn normalized_scale_factor(scale_factor: f64) -> f64 {
    if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    }
}

fn build_keyboard_input_command_payload(
    code: KeyCode,
    state: ElementState,
    repeat: bool,
    timestamp: u64,
) -> Option<Value> {
    let command = resolve_keyboard_command(code, state, repeat)?;
    let code_name = key_code_name(code)?;
    Some(json!({
        "command": command,
        "device": "keyboard",
        "source": format!("keyboard:{code_name}"),
        "repeat": repeat,
        "pressed": state == ElementState::Pressed,
        "timestamp": timestamp,
        "metadata": {
            "code": code_name,
        },
    }))
}

fn resolve_keyboard_command(
    code: KeyCode,
    phase: ElementState,
    repeat: bool,
) -> Option<&'static str> {
    if repeat {
        return None;
    }
    match (code, phase) {
        (KeyCode::Enter, ElementState::Pressed)
        | (KeyCode::Space, ElementState::Pressed)
        | (KeyCode::ArrowRight, ElementState::Pressed)
        | (KeyCode::ArrowDown, ElementState::Pressed)
        | (KeyCode::PageDown, ElementState::Pressed) => Some("advance"),
        (KeyCode::ControlLeft | KeyCode::ControlRight, ElementState::Pressed) => Some("skip:start"),
        (KeyCode::ControlLeft | KeyCode::ControlRight, ElementState::Released) => Some("skip:stop"),
        (KeyCode::KeyF, ElementState::Pressed) => Some("fastForward:start"),
        (KeyCode::KeyF, ElementState::Released) => Some("fastForward:stop"),
        (KeyCode::KeyA, ElementState::Pressed) => Some("auto:toggle"),
        (KeyCode::ArrowUp, ElementState::Pressed) => Some("choice:previous"),
        (KeyCode::Escape, ElementState::Pressed) => Some("ui:cancel"),
        _ => None,
    }
}

fn key_code_name(code: KeyCode) -> Option<&'static str> {
    match code {
        KeyCode::Enter => Some("Enter"),
        KeyCode::Space => Some("Space"),
        KeyCode::ArrowRight => Some("ArrowRight"),
        KeyCode::ArrowDown => Some("ArrowDown"),
        KeyCode::PageDown => Some("PageDown"),
        KeyCode::ControlLeft => Some("ControlLeft"),
        KeyCode::ControlRight => Some("ControlRight"),
        KeyCode::KeyF => Some("KeyF"),
        KeyCode::KeyA => Some("KeyA"),
        KeyCode::ArrowUp => Some("ArrowUp"),
        KeyCode::Escape => Some("Escape"),
        _ => None,
    }
}

fn emit_native_renderer_intent<H>(
    host: &mut H,
    event_type: impl Into<String>,
    payload: Option<serde_json::Value>,
) -> Result<(), NativeProductInputError>
where
    H: NativeHostApi,
{
    let payload_json = payload
        .map(|value| serde_json::to_string(&value))
        .transpose()
        .map_err(|error| {
            NativeProductInputError::new(format!(
                "native product input intent payload serialization failed: {error}"
            ))
        })?;
    host.emit_renderer_intent(NativeRendererIntent {
        r#type: event_type.into(),
        payload_json,
    })
    .map_err(NativeProductInputError::from_host_error)
}

fn native_input_timestamp_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use quajs_native_runtime::{
        InMemoryNativeHostApi, NativeHostInfoBuilder, NativePlatform, NativeProfile,
    };

    use super::*;

    #[test]
    fn converts_winit_physical_cursor_position_to_logical_client_point() {
        let mut input = NativeProductInputController::new();
        let point = input.update_cursor_position(PhysicalPosition::new(300.0, 180.0), 2.0);

        assert_eq!(point.client_x, 150.0);
        assert_eq!(point.client_y, 90.0);
        assert_eq!(input.cursor_client_point(), Some(point));
    }

    #[test]
    fn maps_winit_pointer_phase_and_buttons() {
        assert_eq!(
            pointer_phase_from_element_state(ElementState::Pressed),
            NativePointerEventPhase::Press
        );
        assert_eq!(
            pointer_phase_from_element_state(ElementState::Released),
            NativePointerEventPhase::Release
        );
        assert_eq!(
            pointer_button_from_winit(MouseButton::Left),
            NativePointerButton::Primary
        );
        assert_eq!(
            pointer_button_from_winit(MouseButton::Right),
            NativePointerButton::Secondary
        );
        assert_eq!(
            pointer_button_from_winit(MouseButton::Middle),
            NativePointerButton::Auxiliary
        );
        assert_eq!(
            pointer_button_from_winit(MouseButton::Other(9)),
            NativePointerButton::Other(9)
        );
    }

    #[test]
    fn builds_default_keyboard_input_command_payloads() {
        let advance =
            build_keyboard_input_command_payload(KeyCode::Space, ElementState::Pressed, false, 42)
                .expect("space advances");

        assert_eq!(advance["command"], "advance");
        assert_eq!(advance["source"], "keyboard:Space");
        assert_eq!(advance["pressed"], true);
        assert_eq!(advance["repeat"], false);
        assert_eq!(advance["timestamp"], 42);
        assert_eq!(advance["metadata"]["code"], "Space");

        assert_eq!(
            build_keyboard_input_command_payload(
                KeyCode::ControlLeft,
                ElementState::Pressed,
                false,
                42
            )
            .expect("ctrl starts skip")["command"],
            "skip:start",
        );
        assert_eq!(
            build_keyboard_input_command_payload(
                KeyCode::ControlLeft,
                ElementState::Released,
                false,
                42,
            )
            .expect("ctrl release stops skip")["command"],
            "skip:stop",
        );
        assert!(build_keyboard_input_command_payload(
            KeyCode::KeyA,
            ElementState::Pressed,
            true,
            42,
        )
        .is_none());
    }

    #[test]
    fn dispatches_focus_and_default_keyboard_intents_through_native_host() {
        let mut host = product_input_host();
        let mut input = NativeProductInputController::new();

        assert_eq!(
            input
                .dispatch_focus_event(&mut host, true)
                .expect("focus emits"),
            NativeProductFocusEventReport {
                focused: true,
                intent_emitted: true,
            }
        );
        assert!(
            input
                .dispatch_keyboard_code(&mut host, KeyCode::Space, ElementState::Pressed, false)
                .expect("space emits")
                .intent_emitted
        );
        assert!(
            !input
                .dispatch_keyboard_code(&mut host, KeyCode::KeyA, ElementState::Pressed, true)
                .expect("repeat is observed")
                .intent_emitted
        );
        input
            .dispatch_focus_event(&mut host, false)
            .expect("blur emits");

        assert_eq!(
            host.renderer_intents()
                .iter()
                .map(|intent| intent.r#type.as_str())
                .collect::<Vec<_>>(),
            vec!["window/focus", "user/input_command", "window/blur"]
        );
        let advance_payload: serde_json::Value = serde_json::from_str(
            host.renderer_intents()[1]
                .payload_json
                .as_deref()
                .expect("keyboard intent carries payload"),
        )
        .expect("payload parses");
        assert_eq!(advance_payload["command"], "advance");
        assert_eq!(advance_payload["device"], "keyboard");
        assert_eq!(advance_payload["source"], "keyboard:Space");
        assert_eq!(advance_payload["metadata"]["code"], "Space");
        assert!(advance_payload["timestamp"].as_u64().is_some());
    }

    #[test]
    fn summarizes_ime_without_retaining_raw_text() {
        assert_eq!(
            NativeProductInputController::summarize_ime_event(&Ime::Preedit(
                "候補".to_string(),
                Some((0, 1))
            )),
            NativeProductImeEventReport {
                kind: NativeProductImeEventKind::Preedit,
                text_byte_count: Some("候補".len()),
            }
        );
        assert_eq!(
            NativeProductInputController::summarize_ime_event(&Ime::Commit("決定".to_string())),
            NativeProductImeEventReport {
                kind: NativeProductImeEventKind::Commit,
                text_byte_count: Some("決定".len()),
            }
        );
        assert_eq!(
            NativeProductInputController::summarize_ime_event(&Ime::Enabled),
            NativeProductImeEventReport {
                kind: NativeProductImeEventKind::Enabled,
                text_byte_count: None,
            }
        );
    }

    fn product_input_host() -> InMemoryNativeHostApi {
        InMemoryNativeHostApi::new(
            NativeHostInfoBuilder::new("Fixture", "dev.quajs.fixture")
                .app_version("1.0.0")
                .build_number("100")
                .profile(NativeProfile::Debug)
                .platform(NativePlatform::MacOs)
                .arch("arm64")
                .build(),
        )
    }
}
