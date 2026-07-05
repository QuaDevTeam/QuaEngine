use quajs_native_runtime::{
    InMemoryNativeHostApi, NativeHostApi, NativeHostApiError, NativeRendererIntent,
};
use quajs_wgpu_renderer::input::{
    NativePointerButton, NativePointerEvent, NativePointerEventPhase,
};
use quajs_wgpu_renderer::renderer::{
    parse_native_renderer_json_frame_input, NativeRenderBackend, NativeRenderer,
};
use quajs_wgpu_renderer::stage_layout::{
    stage_logical_to_client_point, StageClientPoint, StageClientRectOrigin, StageLogicalPoint,
};
use winit::dpi::PhysicalPosition;
use winit::event::{ElementState, Ime, KeyEvent};
use winit::keyboard::{KeyCode, PhysicalKey};

use super::error::NativeWindowSmokeError;

mod conversion;
mod keyboard;

use conversion::logical_client_point_from_physical;
pub(super) use conversion::{pointer_button_from_winit, pointer_phase_from_element_state};
use keyboard::build_keyboard_input_command_payload;

const WINDOW_SMOKE_POINTER_ID: u64 = 1;
const WINDOW_SMOKE_OPEN_SETTINGS_CENTER: StageLogicalPoint =
    StageLogicalPoint { x: 408.0, y: 354.0 };

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(super) struct NativeWindowSmokeInputMetrics {
    pub pointer_event_count: usize,
    pub pointer_dispatch_count: usize,
    pub pointer_intent_emit_count: usize,
    pub pointer_probe_count: usize,
    pub pointer_cancel_count: usize,
    pub focus_gain_count: usize,
    pub focus_loss_count: usize,
    pub focus_intent_emit_count: usize,
    pub keyboard_event_count: usize,
    pub keyboard_press_count: usize,
    pub keyboard_release_count: usize,
    pub keyboard_repeat_count: usize,
    pub keyboard_intent_emit_count: usize,
    pub ime_event_count: usize,
    pub ime_preedit_count: usize,
    pub ime_commit_count: usize,
    pub ime_last_text_byte_count: Option<usize>,
    pub last_intent_type: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub(super) struct NativeWindowSmokeInputState {
    cursor_client_point: Option<StageClientPoint>,
    metrics: NativeWindowSmokeInputMetrics,
}

impl NativeWindowSmokeInputState {
    pub(super) fn cursor_client_point(&self) -> Option<StageClientPoint> {
        self.cursor_client_point
    }

    pub(super) fn metrics(&self) -> &NativeWindowSmokeInputMetrics {
        &self.metrics
    }

    pub(super) fn update_cursor_position(
        &mut self,
        position: PhysicalPosition<f64>,
        scale_factor: f64,
    ) -> StageClientPoint {
        let point = logical_client_point_from_physical(position, scale_factor);
        self.cursor_client_point = Some(point);
        point
    }

    pub(super) fn clear_cursor_position(&mut self) {
        self.cursor_client_point = None;
    }

    pub(super) fn record_focus_event(&mut self, focused: bool) {
        if focused {
            self.metrics.focus_gain_count = self.metrics.focus_gain_count.saturating_add(1);
        } else {
            self.metrics.focus_loss_count = self.metrics.focus_loss_count.saturating_add(1);
        }
    }

    pub(super) fn dispatch_focus_event(
        &mut self,
        host: &mut InMemoryNativeHostApi,
        focused: bool,
    ) -> Result<(), NativeWindowSmokeError> {
        self.record_focus_event(focused);
        let event_type = if focused {
            "window/focus"
        } else {
            "window/blur"
        };
        emit_native_renderer_intent(host, event_type, None)?;
        self.metrics.focus_intent_emit_count =
            self.metrics.focus_intent_emit_count.saturating_add(1);
        Ok(())
    }

    pub(super) fn record_keyboard_event(&mut self, event: &KeyEvent) {
        self.record_keyboard_state(event.state, event.repeat);
    }

    pub(super) fn dispatch_keyboard_event(
        &mut self,
        host: &mut InMemoryNativeHostApi,
        event: &KeyEvent,
    ) -> Result<(), NativeWindowSmokeError> {
        match event.physical_key {
            PhysicalKey::Code(code) => {
                self.dispatch_keyboard_code(host, code, event.state, event.repeat)
            }
            PhysicalKey::Unidentified(_) => {
                self.record_keyboard_event(event);
                Ok(())
            }
        }
    }

    fn dispatch_keyboard_code(
        &mut self,
        host: &mut InMemoryNativeHostApi,
        code: KeyCode,
        state: ElementState,
        repeat: bool,
    ) -> Result<(), NativeWindowSmokeError> {
        self.record_keyboard_state(state, repeat);
        let Some(payload) =
            build_keyboard_input_command_payload(code, state, repeat, native_input_timestamp_ms())
        else {
            return Ok(());
        };
        emit_native_renderer_intent(host, "user/input_command", Some(payload))?;
        self.metrics.keyboard_intent_emit_count =
            self.metrics.keyboard_intent_emit_count.saturating_add(1);
        Ok(())
    }

    pub(super) fn record_ime_event(&mut self, event: &Ime) {
        self.metrics.ime_event_count = self.metrics.ime_event_count.saturating_add(1);
        match event {
            Ime::Preedit(text, _) => {
                self.metrics.ime_preedit_count = self.metrics.ime_preedit_count.saturating_add(1);
                self.metrics.ime_last_text_byte_count = Some(text.len());
            }
            Ime::Commit(text) => {
                self.metrics.ime_commit_count = self.metrics.ime_commit_count.saturating_add(1);
                self.metrics.ime_last_text_byte_count = Some(text.len());
            }
            Ime::Enabled | Ime::Disabled => {}
        }
    }

    pub(super) fn cancel_pointer_interaction<B, A>(
        &mut self,
        renderer: &mut NativeRenderer<B, A>,
    ) -> bool
    where
        B: NativeRenderBackend,
    {
        let canceled = renderer.cancel_pointer_interaction(WINDOW_SMOKE_POINTER_ID);
        if canceled {
            self.metrics.pointer_cancel_count = self.metrics.pointer_cancel_count.saturating_add(1);
        }
        canceled
    }

    pub(super) fn dispatch_pointer_event<B, A>(
        &mut self,
        renderer: &mut NativeRenderer<B, A>,
        host: &mut InMemoryNativeHostApi,
        phase: NativePointerEventPhase,
        point: StageClientPoint,
        button: NativePointerButton,
    ) -> Result<(), NativeWindowSmokeError>
    where
        B: NativeRenderBackend,
    {
        self.metrics.pointer_event_count = self.metrics.pointer_event_count.saturating_add(1);
        let before_intent_count = host.renderer_intents().len();
        let event = NativePointerEvent::new(phase, point, StageClientRectOrigin::default())
            .with_pointer_id(WINDOW_SMOKE_POINTER_ID)
            .with_button(button);
        let dispatch = renderer
            .pointer_event_and_emit_intent(event, host)
            .map_err(pointer_host_error)?;

        if dispatch.is_some() {
            self.metrics.pointer_dispatch_count =
                self.metrics.pointer_dispatch_count.saturating_add(1);
        }

        let emitted_count = host
            .renderer_intents()
            .len()
            .saturating_sub(before_intent_count);
        if emitted_count > 0 {
            self.metrics.pointer_intent_emit_count = self
                .metrics
                .pointer_intent_emit_count
                .saturating_add(emitted_count);
            self.metrics.last_intent_type = host
                .renderer_intents()
                .last()
                .map(|intent| intent.r#type.clone());
        }

        Ok(())
    }

    fn record_keyboard_state(&mut self, state: ElementState, repeat: bool) {
        self.metrics.keyboard_event_count = self.metrics.keyboard_event_count.saturating_add(1);
        match state {
            ElementState::Pressed => {
                self.metrics.keyboard_press_count =
                    self.metrics.keyboard_press_count.saturating_add(1);
            }
            ElementState::Released => {
                self.metrics.keyboard_release_count =
                    self.metrics.keyboard_release_count.saturating_add(1);
            }
        }
        if repeat {
            self.metrics.keyboard_repeat_count =
                self.metrics.keyboard_repeat_count.saturating_add(1);
        }
    }

    pub(super) fn run_open_settings_probe<B, A>(
        &mut self,
        renderer: &mut NativeRenderer<B, A>,
        host: &mut InMemoryNativeHostApi,
        frame_json: &str,
    ) -> Result<(), NativeWindowSmokeError>
    where
        B: NativeRenderBackend,
    {
        if self.metrics.pointer_probe_count > 0 {
            return Ok(());
        }

        self.metrics.pointer_probe_count = self.metrics.pointer_probe_count.saturating_add(1);
        let input = parse_native_renderer_json_frame_input(frame_json).map_err(|error| {
            NativeWindowSmokeError::new(format!(
                "Native renderer smoke pointer probe frame validation failed: {error}."
            ))
        })?;
        let client = stage_logical_to_client_point(
            &input.resolved_layout(),
            WINDOW_SMOKE_OPEN_SETTINGS_CENTER,
            StageClientRectOrigin::default(),
        );

        self.dispatch_pointer_event(
            renderer,
            host,
            NativePointerEventPhase::Press,
            client,
            NativePointerButton::Primary,
        )?;
        self.dispatch_pointer_event(
            renderer,
            host,
            NativePointerEventPhase::Release,
            client,
            NativePointerButton::Primary,
        )
    }
}

fn pointer_host_error(error: NativeHostApiError) -> NativeWindowSmokeError {
    NativeWindowSmokeError::new(format!(
        "Native renderer smoke input intent failed: {}.",
        error.message()
    ))
}

fn emit_native_renderer_intent(
    host: &mut InMemoryNativeHostApi,
    event_type: impl Into<String>,
    payload: Option<serde_json::Value>,
) -> Result<(), NativeWindowSmokeError> {
    let payload_json = payload
        .map(|value| serde_json::to_string(&value))
        .transpose()
        .map_err(|error| {
            NativeWindowSmokeError::new(format!(
                "Native renderer smoke input intent payload serialization failed: {error}."
            ))
        })?;
    host.emit_renderer_intent(NativeRendererIntent {
        r#type: event_type.into(),
        payload_json,
    })
    .map_err(pointer_host_error)
}

fn native_input_timestamp_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use quajs_wgpu_renderer::renderer::{NativeRenderer, NullNativeRenderBackend};

    use super::super::config::DEFAULT_WINDOW_SMOKE_FRAME;
    use super::super::frame::frame_json_for_window;
    use super::super::texture_host::create_window_smoke_texture_host;
    use super::*;

    #[test]
    fn open_settings_probe_emits_ui_intent_through_native_host() {
        let frame_json = frame_json_for_window(DEFAULT_WINDOW_SMOKE_FRAME, 960.0, 540.0, 1.0)
            .expect("window smoke frame should be rewritten");
        let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());
        renderer
            .prepare_and_render_json_str(&frame_json)
            .expect("default window smoke frame should render with null backend");
        let mut host = create_window_smoke_texture_host();
        let mut input = NativeWindowSmokeInputState::default();

        input
            .run_open_settings_probe(&mut renderer, &mut host, &frame_json)
            .expect("pointer probe should dispatch");

        assert_eq!(input.metrics().pointer_probe_count, 1);
        assert_eq!(input.metrics().pointer_event_count, 2);
        assert_eq!(input.metrics().pointer_dispatch_count, 2);
        assert_eq!(input.metrics().pointer_intent_emit_count, 1);
        assert_eq!(input.metrics().pointer_cancel_count, 0);
        assert_eq!(
            input.metrics().last_intent_type.as_deref(),
            Some("ui/intent")
        );
        let intent = host
            .renderer_intents()
            .last()
            .expect("host should receive emitted renderer intent");
        assert_eq!(intent.r#type, "ui/intent");
        assert!(intent
            .payload_json
            .as_deref()
            .expect("ui intent should carry payload JSON")
            .contains("\"action\":\"open\""));
    }

    #[test]
    fn records_focus_keyboard_and_ime_metrics_without_raw_text() {
        let mut input = NativeWindowSmokeInputState::default();

        input.record_focus_event(true);
        input.record_focus_event(false);
        input.record_keyboard_state(ElementState::Pressed, false);
        input.record_keyboard_state(ElementState::Pressed, true);
        input.record_keyboard_state(ElementState::Released, false);
        input.record_ime_event(&Ime::Preedit("候補".to_string(), Some((0, 1))));
        input.record_ime_event(&Ime::Commit("決定".to_string()));

        assert_eq!(input.metrics().focus_gain_count, 1);
        assert_eq!(input.metrics().focus_loss_count, 1);
        assert_eq!(input.metrics().focus_intent_emit_count, 0);
        assert_eq!(input.metrics().keyboard_event_count, 3);
        assert_eq!(input.metrics().keyboard_press_count, 2);
        assert_eq!(input.metrics().keyboard_release_count, 1);
        assert_eq!(input.metrics().keyboard_repeat_count, 1);
        assert_eq!(input.metrics().keyboard_intent_emit_count, 0);
        assert_eq!(input.metrics().ime_event_count, 2);
        assert_eq!(input.metrics().ime_preedit_count, 1);
        assert_eq!(input.metrics().ime_commit_count, 1);
        assert_eq!(input.metrics().ime_last_text_byte_count, Some("決定".len()));
        assert_eq!(input.metrics().last_intent_type, None);
    }

    #[test]
    fn dispatches_focus_and_default_keyboard_intents_through_native_host() {
        let mut host = create_window_smoke_texture_host();
        let mut input = NativeWindowSmokeInputState::default();

        input
            .dispatch_focus_event(&mut host, true)
            .expect("focus intent emits");
        input
            .dispatch_keyboard_code(&mut host, KeyCode::Space, ElementState::Pressed, false)
            .expect("keyboard intent emits");
        input
            .dispatch_keyboard_code(
                &mut host,
                KeyCode::ControlLeft,
                ElementState::Pressed,
                false,
            )
            .expect("skip start emits");
        input
            .dispatch_keyboard_code(
                &mut host,
                KeyCode::ControlLeft,
                ElementState::Released,
                false,
            )
            .expect("skip stop emits");
        input
            .dispatch_keyboard_code(&mut host, KeyCode::KeyA, ElementState::Pressed, true)
            .expect("repeat is observed but not dispatched");
        input
            .dispatch_focus_event(&mut host, false)
            .expect("blur intent emits");

        assert_eq!(input.metrics().focus_gain_count, 1);
        assert_eq!(input.metrics().focus_loss_count, 1);
        assert_eq!(input.metrics().focus_intent_emit_count, 2);
        assert_eq!(input.metrics().keyboard_event_count, 4);
        assert_eq!(input.metrics().keyboard_press_count, 3);
        assert_eq!(input.metrics().keyboard_release_count, 1);
        assert_eq!(input.metrics().keyboard_repeat_count, 1);
        assert_eq!(input.metrics().keyboard_intent_emit_count, 3);
        assert_eq!(
            host.renderer_intents()
                .iter()
                .map(|intent| intent.r#type.as_str())
                .collect::<Vec<_>>(),
            vec![
                "window/focus",
                "user/input_command",
                "user/input_command",
                "user/input_command",
                "window/blur",
            ]
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
        assert_eq!(advance_payload["pressed"], true);
        assert_eq!(advance_payload["repeat"], false);
        assert_eq!(advance_payload["metadata"]["code"], "Space");
        assert!(advance_payload["timestamp"].as_u64().is_some());
    }
}
