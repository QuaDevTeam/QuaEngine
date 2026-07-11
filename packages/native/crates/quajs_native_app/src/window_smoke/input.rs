use quajs_native_runtime::InMemoryNativeHostApi;
use quajs_wgpu_renderer::input::{NativePointerButton, NativePointerEventPhase};
use quajs_wgpu_renderer::renderer::{
    parse_native_renderer_json_frame_input, NativeRenderBackend, NativeRenderer,
};
use quajs_wgpu_renderer::stage_layout::{
    stage_logical_to_client_point, StageClientPoint, StageClientRectOrigin, StageLogicalPoint,
};
use winit::dpi::PhysicalPosition;
use winit::event::{ElementState, Ime, KeyEvent};
#[cfg(test)]
use winit::keyboard::KeyCode;

use crate::product_input::{
    NativeProductFocusEventReport, NativeProductImeEventKind, NativeProductInputController,
    NativeProductInputError, NativeProductKeyboardEventReport,
};

use super::error::NativeWindowSmokeError;

pub(super) use crate::product_input::{
    pointer_button_from_winit, pointer_phase_from_element_state,
};

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
    pub ime_enabled_count: usize,
    pub ime_disabled_count: usize,
    pub ime_preedit_count: usize,
    pub ime_commit_count: usize,
    pub ime_intent_emit_count: usize,
    pub ime_composition_active: bool,
    pub ime_last_text_byte_count: Option<usize>,
    pub ime_last_cursor_start: Option<usize>,
    pub ime_last_cursor_end: Option<usize>,
    pub last_intent_type: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub(super) struct NativeWindowSmokeInputState {
    product_input: NativeProductInputController,
    metrics: NativeWindowSmokeInputMetrics,
    pub(super) persisted_intent_count: usize,
}

impl NativeWindowSmokeInputState {
    pub(super) fn cursor_client_point(&self) -> Option<StageClientPoint> {
        self.product_input.cursor_client_point()
    }

    pub(super) fn metrics(&self) -> &NativeWindowSmokeInputMetrics {
        &self.metrics
    }

    pub(super) fn update_cursor_position(
        &mut self,
        position: PhysicalPosition<f64>,
        scale_factor: f64,
    ) -> StageClientPoint {
        self.product_input
            .update_cursor_position(position, scale_factor)
    }

    pub(super) fn clear_cursor_position(&mut self) {
        self.product_input.clear_cursor_position();
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
        let report = self
            .product_input
            .dispatch_focus_event(host, focused)
            .map_err(input_error)?;
        self.record_focus_report(report);
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
        let report = self
            .product_input
            .dispatch_keyboard_event(host, event)
            .map_err(input_error)?;
        self.record_keyboard_report(report);
        Ok(())
    }

    #[cfg(test)]
    fn dispatch_keyboard_code(
        &mut self,
        host: &mut InMemoryNativeHostApi,
        code: KeyCode,
        state: ElementState,
        repeat: bool,
    ) -> Result<(), NativeWindowSmokeError> {
        let report = self
            .product_input
            .dispatch_keyboard_code(host, code, state, repeat)
            .map_err(input_error)?;
        self.record_keyboard_report(report);
        Ok(())
    }

    pub(super) fn record_ime_event(&mut self, event: &Ime) {
        let report = self.product_input.record_ime_event(event);
        self.record_ime_report(report);
    }

    pub(super) fn dispatch_ime_event(
        &mut self,
        host: &mut InMemoryNativeHostApi,
        event: &Ime,
    ) -> Result<(), NativeWindowSmokeError> {
        let report = self
            .product_input
            .dispatch_ime_event(host, event)
            .map_err(input_error)?;
        self.record_ime_report(report);
        Ok(())
    }

    pub(super) fn record_ime_composition_cancelled(&mut self) {
        if let Some(report) = self.product_input.record_ime_composition_cancelled() {
            self.record_ime_report(report);
        }
    }

    pub(super) fn cancel_ime_composition(
        &mut self,
        host: &mut InMemoryNativeHostApi,
    ) -> Result<(), NativeWindowSmokeError> {
        if let Some(report) = self
            .product_input
            .cancel_ime_composition(host)
            .map_err(input_error)?
        {
            self.record_ime_report(report);
        }
        Ok(())
    }

    fn record_ime_report(&mut self, report: crate::product_input::NativeProductImeEventReport) {
        self.metrics.ime_event_count = self.metrics.ime_event_count.saturating_add(1);
        match report.kind {
            NativeProductImeEventKind::Enabled => {
                self.metrics.ime_enabled_count = self.metrics.ime_enabled_count.saturating_add(1);
            }
            NativeProductImeEventKind::Disabled => {
                self.metrics.ime_disabled_count = self.metrics.ime_disabled_count.saturating_add(1);
            }
            NativeProductImeEventKind::Preedit => {
                self.metrics.ime_preedit_count = self.metrics.ime_preedit_count.saturating_add(1);
                self.metrics.ime_last_text_byte_count = report.text_byte_count;
            }
            NativeProductImeEventKind::Commit => {
                self.metrics.ime_commit_count = self.metrics.ime_commit_count.saturating_add(1);
                self.metrics.ime_last_text_byte_count = report.text_byte_count;
            }
        }
        if report.intent_emitted {
            self.metrics.ime_intent_emit_count =
                self.metrics.ime_intent_emit_count.saturating_add(1);
        }
        self.metrics.ime_composition_active = report.composition.active;
        self.metrics.ime_last_cursor_start = report.composition.cursor_start;
        self.metrics.ime_last_cursor_end = report.composition.cursor_end;
    }

    pub(super) fn cancel_pointer_interaction<B, A, V, F>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V, F>,
    ) -> bool
    where
        B: NativeRenderBackend,
    {
        let canceled = self.product_input.cancel_pointer_interaction(renderer);
        if canceled {
            self.metrics.pointer_cancel_count = self.metrics.pointer_cancel_count.saturating_add(1);
        }
        canceled
    }

    pub(super) fn dispatch_pointer_event<B, A, V, F>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V, F>,
        host: &mut InMemoryNativeHostApi,
        phase: NativePointerEventPhase,
        point: StageClientPoint,
        button: NativePointerButton,
    ) -> Result<bool, NativeWindowSmokeError>
    where
        B: NativeRenderBackend,
    {
        self.metrics.pointer_event_count = self.metrics.pointer_event_count.saturating_add(1);
        let before_intent_count = host.renderer_intents().len();
        let dispatch = self
            .product_input
            .dispatch_pointer_event(renderer, host, phase, point, button)
            .map_err(input_error)?;

        if dispatch.dispatched {
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

        Ok(dispatch.visual_state_changed)
    }

    pub(super) fn dispatch_pointer_move<B, A, V, F>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V, F>,
        host: &mut InMemoryNativeHostApi,
        point: StageClientPoint,
    ) -> Result<bool, NativeWindowSmokeError>
    where
        B: NativeRenderBackend,
    {
        self.metrics.pointer_event_count = self.metrics.pointer_event_count.saturating_add(1);
        let dispatch = self
            .product_input
            .dispatch_pointer_move(renderer, host, point)
            .map_err(input_error)?;
        if dispatch.dispatched {
            self.metrics.pointer_dispatch_count =
                self.metrics.pointer_dispatch_count.saturating_add(1);
        }
        Ok(dispatch.visual_state_changed)
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

    fn record_focus_report(&mut self, report: NativeProductFocusEventReport) {
        self.record_focus_event(report.focused);
        if report.intent_emitted {
            self.metrics.focus_intent_emit_count =
                self.metrics.focus_intent_emit_count.saturating_add(1);
        }
    }

    fn record_keyboard_report(&mut self, report: NativeProductKeyboardEventReport) {
        self.record_keyboard_state(report.state, report.repeat);
        if report.intent_emitted {
            self.metrics.keyboard_intent_emit_count =
                self.metrics.keyboard_intent_emit_count.saturating_add(1);
        }
    }

    pub(super) fn run_open_settings_probe<B, A, V, F>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V, F>,
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
        .map(|_| ())
    }
}

fn input_error(error: NativeProductInputError) -> NativeWindowSmokeError {
    NativeWindowSmokeError::new(format!(
        "Native renderer smoke input intent failed: {error}."
    ))
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
        input.record_ime_event(&Ime::Enabled);
        input.record_ime_event(&Ime::Preedit("候補".to_string(), Some((0, 1))));
        input.record_ime_event(&Ime::Commit("決定".to_string()));
        input.record_ime_event(&Ime::Disabled);

        assert_eq!(input.metrics().focus_gain_count, 1);
        assert_eq!(input.metrics().focus_loss_count, 1);
        assert_eq!(input.metrics().focus_intent_emit_count, 0);
        assert_eq!(input.metrics().keyboard_event_count, 3);
        assert_eq!(input.metrics().keyboard_press_count, 2);
        assert_eq!(input.metrics().keyboard_release_count, 1);
        assert_eq!(input.metrics().keyboard_repeat_count, 1);
        assert_eq!(input.metrics().keyboard_intent_emit_count, 0);
        assert_eq!(input.metrics().ime_event_count, 4);
        assert_eq!(input.metrics().ime_enabled_count, 1);
        assert_eq!(input.metrics().ime_disabled_count, 1);
        assert_eq!(input.metrics().ime_preedit_count, 1);
        assert_eq!(input.metrics().ime_commit_count, 1);
        assert_eq!(input.metrics().ime_last_text_byte_count, Some("決定".len()));
        assert!(!input.metrics().ime_composition_active);
        assert_eq!(input.metrics().ime_last_cursor_start, None);
        assert_eq!(input.metrics().ime_last_cursor_end, None);
        assert_eq!(input.metrics().last_intent_type, None);
    }

    #[test]
    fn cancels_ime_composition_through_native_host_once() {
        let mut host = create_window_smoke_texture_host();
        let mut input = NativeWindowSmokeInputState::default();

        input
            .dispatch_ime_event(&mut host, &Ime::Preedit("候補".to_string(), Some((0, 1))))
            .expect("preedit emits");

        assert_eq!(input.metrics().ime_event_count, 1);
        assert_eq!(input.metrics().ime_preedit_count, 1);
        assert_eq!(input.metrics().ime_intent_emit_count, 1);
        assert!(input.metrics().ime_composition_active);
        assert_eq!(input.metrics().ime_last_cursor_start, Some(0));
        assert_eq!(input.metrics().ime_last_cursor_end, Some(1));

        input
            .cancel_ime_composition(&mut host)
            .expect("cancellation emits");

        assert_eq!(input.metrics().ime_event_count, 2);
        assert_eq!(input.metrics().ime_preedit_count, 1);
        assert_eq!(input.metrics().ime_disabled_count, 1);
        assert_eq!(input.metrics().ime_intent_emit_count, 2);
        assert_eq!(input.metrics().ime_last_text_byte_count, Some("候補".len()));
        assert!(!input.metrics().ime_composition_active);
        assert_eq!(input.metrics().ime_last_cursor_start, None);
        assert_eq!(input.metrics().ime_last_cursor_end, None);
        assert_eq!(host.renderer_intents().len(), 2);

        let disabled_payload: serde_json::Value = serde_json::from_str(
            host.renderer_intents()[1]
                .payload_json
                .as_deref()
                .expect("disabled intent carries payload"),
        )
        .expect("payload parses");
        assert_eq!(disabled_payload["phase"], "disabled");
        assert_eq!(disabled_payload["source"], "ime");
        assert!(disabled_payload.get("text").is_none());

        input
            .cancel_ime_composition(&mut host)
            .expect("second cancellation is a no-op");
        assert_eq!(input.metrics().ime_event_count, 2);
        assert_eq!(input.metrics().ime_disabled_count, 1);
        assert_eq!(input.metrics().ime_intent_emit_count, 2);
        assert_eq!(host.renderer_intents().len(), 2);
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
