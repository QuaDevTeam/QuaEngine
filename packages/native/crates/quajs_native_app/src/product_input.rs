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
    pub(crate) cursor_start: Option<usize>,
    pub(crate) cursor_end: Option<usize>,
    pub(crate) composition: NativeProductImeCompositionState,
    pub(crate) intent_emitted: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct NativeProductImeCompositionState {
    pub(crate) enabled: bool,
    pub(crate) active: bool,
    pub(crate) last_text_byte_count: Option<usize>,
    pub(crate) cursor_start: Option<usize>,
    pub(crate) cursor_end: Option<usize>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NativeProductPointerDispatchReport {
    pub(crate) dispatched: bool,
    pub(crate) visual_state_changed: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct NativeProductInputController {
    cursor_client_point: Option<StageClientPoint>,
    pointer_id: u64,
    ime_composition: NativeProductImeCompositionState,
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
            ime_composition: NativeProductImeCompositionState::default(),
        }
    }

    #[allow(dead_code)]
    pub(crate) fn with_pointer_id(pointer_id: u64) -> Self {
        Self {
            cursor_client_point: None,
            pointer_id,
            ime_composition: NativeProductImeCompositionState::default(),
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
        let timestamp = native_input_timestamp_ms();
        if let PhysicalKey::Code(code) = event.physical_key {
            if let Some(payload) =
                build_keyboard_input_command_payload(code, event.state, event.repeat, timestamp)
            {
                emit_native_renderer_intent(host, "user/input_command", Some(payload))?;
                return Ok(NativeProductKeyboardEventReport {
                    state: event.state,
                    repeat: event.repeat,
                    intent_emitted: true,
                });
            }
        }
        if let Some(payload) = build_keyboard_text_input_payload(
            event.text.as_deref(),
            event.state,
            event.repeat,
            timestamp,
        ) {
            emit_native_renderer_intent(host, "user/text_input", Some(payload))?;
            return Ok(NativeProductKeyboardEventReport {
                state: event.state,
                repeat: event.repeat,
                intent_emitted: true,
            });
        }
        Ok(NativeProductKeyboardEventReport {
            state: event.state,
            repeat: event.repeat,
            intent_emitted: false,
        })
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
        let mut controller = Self::new();
        controller.record_ime_event(event)
    }

    pub(crate) fn ime_composition(&self) -> NativeProductImeCompositionState {
        self.ime_composition
    }

    pub(crate) fn record_ime_event(&mut self, event: &Ime) -> NativeProductImeEventReport {
        let (kind, text_byte_count, cursor_range) = match event {
            Ime::Enabled => (NativeProductImeEventKind::Enabled, None, None),
            Ime::Disabled => (NativeProductImeEventKind::Disabled, None, None),
            Ime::Preedit(text, cursor) => (
                NativeProductImeEventKind::Preedit,
                Some(text.len()),
                *cursor,
            ),
            Ime::Commit(text) => (NativeProductImeEventKind::Commit, Some(text.len()), None),
        };
        self.ime_composition =
            next_ime_composition_state(self.ime_composition, kind, text_byte_count, cursor_range);
        NativeProductImeEventReport {
            kind,
            text_byte_count,
            cursor_start: cursor_range.map(|(start, _)| start),
            cursor_end: cursor_range.map(|(_, end)| end),
            composition: self.ime_composition,
            intent_emitted: false,
        }
    }

    pub(crate) fn dispatch_ime_event<H>(
        &mut self,
        host: &mut H,
        event: &Ime,
    ) -> Result<NativeProductImeEventReport, NativeProductInputError>
    where
        H: NativeHostApi,
    {
        let mut report = self.record_ime_event(event);
        emit_native_renderer_intent(
            host,
            "user/text_input",
            Some(build_ime_text_input_payload(
                event,
                native_input_timestamp_ms(),
            )),
        )?;
        report.intent_emitted = true;
        Ok(report)
    }

    pub(crate) fn record_ime_composition_cancelled(
        &mut self,
    ) -> Option<NativeProductImeEventReport> {
        if self.ime_composition == NativeProductImeCompositionState::default() {
            return None;
        }
        self.ime_composition = NativeProductImeCompositionState::default();
        Some(NativeProductImeEventReport {
            kind: NativeProductImeEventKind::Disabled,
            text_byte_count: None,
            cursor_start: None,
            cursor_end: None,
            composition: self.ime_composition,
            intent_emitted: false,
        })
    }

    pub(crate) fn cancel_ime_composition<H>(
        &mut self,
        host: &mut H,
    ) -> Result<Option<NativeProductImeEventReport>, NativeProductInputError>
    where
        H: NativeHostApi,
    {
        let Some(mut report) = self.record_ime_composition_cancelled() else {
            return Ok(None);
        };
        emit_native_renderer_intent(
            host,
            "user/text_input",
            Some(build_ime_text_input_payload(
                &Ime::Disabled,
                native_input_timestamp_ms(),
            )),
        )?;
        report.intent_emitted = true;
        Ok(Some(report))
    }

    pub(crate) fn cancel_pointer_interaction<B, A, V, F>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V, F>,
    ) -> bool
    where
        B: NativeRenderBackend,
    {
        renderer.cancel_pointer_interaction(self.pointer_id)
    }

    pub(crate) fn dispatch_pointer_event<B, A, V, F, H>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V, F>,
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

        // Match the Web renderer's stage click behavior: only an unhandled primary
        // release advances dialogue. Interactive controls keep their own intent.
        let hit_interactive_intent = dispatch
            .as_ref()
            .and_then(|dispatch| dispatch.resolution.pointer.intent.as_ref())
            .is_some();
        if !hit_interactive_intent
            && phase == NativePointerEventPhase::Release
            && button == NativePointerButton::Primary
        {
            emit_native_renderer_intent(
                host,
                "user/input_command",
                Some(build_pointer_advance_payload()),
            )?;
        }

        Ok(NativeProductPointerDispatchReport {
            dispatched: dispatch.is_some(),
            visual_state_changed: dispatch
                .as_ref()
                .map(|dispatch| dispatch.resolution.visual_state_changed)
                .unwrap_or(false),
        })
    }

    pub(crate) fn dispatch_pointer_move<B, A, V, F, H>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V, F>,
        host: &mut H,
        point: StageClientPoint,
    ) -> Result<NativeProductPointerDispatchReport, NativeProductInputError>
    where
        B: NativeRenderBackend,
        H: NativeHostApi,
    {
        let event = NativePointerEvent::new(
            NativePointerEventPhase::Move,
            point,
            StageClientRectOrigin::default(),
        )
        .with_pointer_id(self.pointer_id);
        let dispatch = renderer
            .pointer_event_and_emit_intent(event, host)
            .map_err(NativeProductInputError::from_host_error)?;

        Ok(NativeProductPointerDispatchReport {
            dispatched: dispatch.is_some(),
            visual_state_changed: dispatch
                .as_ref()
                .map(|dispatch| dispatch.resolution.visual_state_changed)
                .unwrap_or(false),
        })
    }
}

fn build_pointer_advance_payload() -> Value {
    json!({
        "command": "advance",
        "device": "pointer",
        "source": "pointer:primary",
        "pressed": true,
        "repeat": false,
        "timestamp": native_input_timestamp_ms(),
    })
}

fn next_ime_composition_state(
    current: NativeProductImeCompositionState,
    kind: NativeProductImeEventKind,
    text_byte_count: Option<usize>,
    cursor_range: Option<(usize, usize)>,
) -> NativeProductImeCompositionState {
    match kind {
        NativeProductImeEventKind::Enabled => NativeProductImeCompositionState {
            enabled: true,
            ..NativeProductImeCompositionState::default()
        },
        NativeProductImeEventKind::Disabled => NativeProductImeCompositionState::default(),
        NativeProductImeEventKind::Preedit => NativeProductImeCompositionState {
            enabled: true,
            active: text_byte_count.unwrap_or(0) > 0 || cursor_range.is_some(),
            last_text_byte_count: text_byte_count,
            cursor_start: cursor_range.map(|(start, _)| start),
            cursor_end: cursor_range.map(|(_, end)| end),
        },
        NativeProductImeEventKind::Commit => NativeProductImeCompositionState {
            enabled: current.enabled,
            active: false,
            last_text_byte_count: text_byte_count,
            cursor_start: None,
            cursor_end: None,
        },
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

fn build_keyboard_text_input_payload(
    text: Option<&str>,
    state: ElementState,
    repeat: bool,
    timestamp: u64,
) -> Option<Value> {
    if state != ElementState::Pressed {
        return None;
    }
    let text = text?;
    if !is_keyboard_commit_text(text) {
        return None;
    }
    Some(json!({
        "phase": "commit",
        "source": "keyboard",
        "timestamp": timestamp,
        "text": text,
        "metadata": {
            "textByteCount": text.len(),
            "repeat": repeat,
        },
    }))
}

fn is_keyboard_commit_text(text: &str) -> bool {
    !text.is_empty() && text.chars().all(|character| !character.is_control())
}

fn build_ime_text_input_payload(event: &Ime, timestamp: u64) -> Value {
    match event {
        Ime::Enabled => json!({
            "phase": "enabled",
            "source": "ime",
            "timestamp": timestamp,
        }),
        Ime::Disabled => json!({
            "phase": "disabled",
            "source": "ime",
            "timestamp": timestamp,
        }),
        Ime::Preedit(text, cursor) => {
            let mut payload = json!({
                "phase": "preedit",
                "source": "ime",
                "timestamp": timestamp,
                "text": text,
                "metadata": {
                    "textByteCount": text.len(),
                },
            });
            if let Some((start, end)) = cursor {
                payload["cursorStart"] = json!(*start);
                payload["cursorEnd"] = json!(*end);
            }
            payload
        }
        Ime::Commit(text) => json!({
            "phase": "commit",
            "source": "ime",
            "timestamp": timestamp,
            "text": text,
            "metadata": {
                "textByteCount": text.len(),
            },
        }),
    }
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
    fn builds_keyboard_text_input_commit_payloads_for_printable_text() {
        let payload =
            build_keyboard_text_input_payload(Some("かな"), ElementState::Pressed, false, 42)
                .expect("printable text commits");

        assert_eq!(payload["phase"], "commit");
        assert_eq!(payload["source"], "keyboard");
        assert_eq!(payload["timestamp"], 42);
        assert_eq!(payload["text"], "かな");
        assert_eq!(payload["metadata"]["textByteCount"], "かな".len());
        assert_eq!(payload["metadata"]["repeat"], false);

        let repeat = build_keyboard_text_input_payload(Some("a"), ElementState::Pressed, true, 43)
            .expect("text repeats commit");
        assert_eq!(repeat["metadata"]["repeat"], true);
    }

    #[test]
    fn skips_keyboard_text_input_for_releases_and_control_text() {
        assert!(
            build_keyboard_text_input_payload(Some("a"), ElementState::Released, false, 42,)
                .is_none()
        );
        assert!(
            build_keyboard_text_input_payload(Some("\r"), ElementState::Pressed, false, 42)
                .is_none()
        );
        assert!(
            build_keyboard_text_input_payload(Some(""), ElementState::Pressed, false, 42).is_none()
        );
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
    fn advances_on_release_outside_interactive_renderer_commands() {
        let mut renderer =
            NativeRenderer::new(quajs_wgpu_renderer::renderer::NullNativeRenderBackend::new());
        renderer
            .prepare_and_render_json_str(include_str!(
                "../../../test-fixtures/renderer/qui-qss-surface-frame.json"
            ))
            .expect("fixture frame should render");
        let mut host = product_input_host();
        let mut input = NativeProductInputController::new();
        let point = StageClientPoint {
            client_x: 20.0,
            client_y: 20.0,
        };

        input
            .dispatch_pointer_event(
                &mut renderer,
                &mut host,
                NativePointerEventPhase::Press,
                point,
                NativePointerButton::Primary,
            )
            .expect("pointer press should be handled");
        input
            .dispatch_pointer_event(
                &mut renderer,
                &mut host,
                NativePointerEventPhase::Release,
                point,
                NativePointerButton::Primary,
            )
            .expect("pointer release should advance");

        assert_eq!(host.renderer_intents().len(), 1);
        assert_eq!(host.renderer_intents()[0].r#type, "user/input_command");
        assert!(host.renderer_intents()[0]
            .payload_json
            .as_deref()
            .unwrap_or_default()
            .contains("\"command\":\"advance\""));
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
                cursor_start: Some(0),
                cursor_end: Some(1),
                composition: NativeProductImeCompositionState {
                    enabled: true,
                    active: true,
                    last_text_byte_count: Some("候補".len()),
                    cursor_start: Some(0),
                    cursor_end: Some(1),
                },
                intent_emitted: false,
            }
        );
        assert_eq!(
            NativeProductInputController::summarize_ime_event(&Ime::Commit("決定".to_string())),
            NativeProductImeEventReport {
                kind: NativeProductImeEventKind::Commit,
                text_byte_count: Some("決定".len()),
                cursor_start: None,
                cursor_end: None,
                composition: NativeProductImeCompositionState {
                    last_text_byte_count: Some("決定".len()),
                    ..NativeProductImeCompositionState::default()
                },
                intent_emitted: false,
            }
        );
        assert_eq!(
            NativeProductInputController::summarize_ime_event(&Ime::Enabled),
            NativeProductImeEventReport {
                kind: NativeProductImeEventKind::Enabled,
                text_byte_count: None,
                cursor_start: None,
                cursor_end: None,
                composition: NativeProductImeCompositionState {
                    enabled: true,
                    ..NativeProductImeCompositionState::default()
                },
                intent_emitted: false,
            }
        );
    }

    #[test]
    fn dispatches_ime_text_input_intents_without_retaining_text_in_report() {
        let mut host = product_input_host();
        let mut input = NativeProductInputController::new();

        let preedit = input
            .dispatch_ime_event(&mut host, &Ime::Preedit("候補".to_string(), Some((0, 1))))
            .expect("preedit emits");
        let commit = input
            .dispatch_ime_event(&mut host, &Ime::Commit("決定".to_string()))
            .expect("commit emits");
        let disabled = input
            .dispatch_ime_event(&mut host, &Ime::Disabled)
            .expect("disabled emits");

        assert_eq!(
            preedit,
            NativeProductImeEventReport {
                kind: NativeProductImeEventKind::Preedit,
                text_byte_count: Some("候補".len()),
                cursor_start: Some(0),
                cursor_end: Some(1),
                composition: NativeProductImeCompositionState {
                    enabled: true,
                    active: true,
                    last_text_byte_count: Some("候補".len()),
                    cursor_start: Some(0),
                    cursor_end: Some(1),
                },
                intent_emitted: true,
            }
        );
        assert_eq!(commit.kind, NativeProductImeEventKind::Commit);
        assert_eq!(commit.text_byte_count, Some("決定".len()));
        assert!(!commit.composition.active);
        assert_eq!(commit.composition.last_text_byte_count, Some("決定".len()));
        assert!(commit.intent_emitted);
        assert_eq!(disabled.kind, NativeProductImeEventKind::Disabled);
        assert_eq!(disabled.text_byte_count, None);
        assert_eq!(
            disabled.composition,
            NativeProductImeCompositionState::default()
        );
        assert!(disabled.intent_emitted);
        assert_eq!(
            input.ime_composition(),
            NativeProductImeCompositionState::default()
        );

        assert_eq!(
            host.renderer_intents()
                .iter()
                .map(|intent| intent.r#type.as_str())
                .collect::<Vec<_>>(),
            vec!["user/text_input", "user/text_input", "user/text_input"]
        );
        let preedit_payload: serde_json::Value = serde_json::from_str(
            host.renderer_intents()[0]
                .payload_json
                .as_deref()
                .expect("preedit intent carries payload"),
        )
        .expect("payload parses");
        assert_eq!(preedit_payload["phase"], "preedit");
        assert_eq!(preedit_payload["source"], "ime");
        assert_eq!(preedit_payload["text"], "候補");
        assert_eq!(preedit_payload["cursorStart"], 0);
        assert_eq!(preedit_payload["cursorEnd"], 1);
        assert_eq!(preedit_payload["metadata"]["textByteCount"], "候補".len());
    }

    #[test]
    fn records_ime_composition_cancellation_without_retaining_text() {
        let mut input = NativeProductInputController::new();
        input.record_ime_event(&Ime::Enabled);
        input.record_ime_event(&Ime::Preedit("候補".to_string(), Some((0, 1))));

        let cancelled = input
            .record_ime_composition_cancelled()
            .expect("active composition should be cancelled");

        assert_eq!(
            cancelled,
            NativeProductImeEventReport {
                kind: NativeProductImeEventKind::Disabled,
                text_byte_count: None,
                cursor_start: None,
                cursor_end: None,
                composition: NativeProductImeCompositionState::default(),
                intent_emitted: false,
            }
        );
        assert_eq!(
            input.ime_composition(),
            NativeProductImeCompositionState::default()
        );
        assert!(input.record_ime_composition_cancelled().is_none());
    }

    #[test]
    fn cancels_ime_composition_through_native_host_once() {
        let mut host = product_input_host();
        let mut input = NativeProductInputController::new();

        input
            .dispatch_ime_event(&mut host, &Ime::Enabled)
            .expect("enabled emits");
        input
            .dispatch_ime_event(&mut host, &Ime::Preedit("候補".to_string(), Some((0, 1))))
            .expect("preedit emits");

        let cancelled = input
            .cancel_ime_composition(&mut host)
            .expect("cancellation emits")
            .expect("active composition should be cancelled");

        assert_eq!(
            cancelled,
            NativeProductImeEventReport {
                kind: NativeProductImeEventKind::Disabled,
                text_byte_count: None,
                cursor_start: None,
                cursor_end: None,
                composition: NativeProductImeCompositionState::default(),
                intent_emitted: true,
            }
        );
        assert_eq!(
            input.ime_composition(),
            NativeProductImeCompositionState::default()
        );
        assert_eq!(host.renderer_intents().len(), 3);
        assert!(input
            .cancel_ime_composition(&mut host)
            .expect("second cancellation is a no-op")
            .is_none());
        assert_eq!(host.renderer_intents().len(), 3);

        let disabled_payload: serde_json::Value = serde_json::from_str(
            host.renderer_intents()[2]
                .payload_json
                .as_deref()
                .expect("disabled intent carries payload"),
        )
        .expect("payload parses");
        assert_eq!(disabled_payload["phase"], "disabled");
        assert_eq!(disabled_payload["source"], "ime");
        assert!(disabled_payload.get("text").is_none());
        assert!(disabled_payload["timestamp"].as_u64().is_some());
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
