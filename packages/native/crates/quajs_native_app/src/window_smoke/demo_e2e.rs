use std::time::{Duration, Instant};

use quajs_native_runtime::InMemoryNativeHostApi;
use quajs_wgpu_renderer::render_graph::DrawCommandParams;
use quajs_wgpu_renderer::renderer::{NativeRenderBackend, NativeRenderer};
use serde::Serialize;

use super::error::NativeWindowSmokeError;
use super::input::NativeWindowSmokeInputState;

const DEMO_E2E_MAX_DURATION: Duration = Duration::from_secs(8 * 60);
const DEMO_E2E_STALL_TIMEOUT: Duration = Duration::from_secs(30);

const TITLE_START: &str = "ui:native-app-shell:native-main-menu-start";
const TITLE_CONFIG: &str = "ui:native-app-shell:native-main-menu-config";
const TITLE_CHAPTERS: &str = "ui:native-app-shell:native-main-menu-story-tree";
const DIALOGUE_PANEL: &str = "dialogue:panel";
const FIRST_STORY_CHOICE: &str = "choice:catalog-first";
const GAME_HUD_SKIP: &str = "ui:native-app-shell:native-game-hud-skip";
const GAME_HUD_MENU: &str = "ui:native-app-shell:native-game-hud-menu";
const GAME_MENU_TITLE: &str = "ui:native-app-shell:native-game-menu-title-action";
const TITLE_CONFIRM: &str = "ui:native-app-shell:native-title-confirm-confirm";
const SETTINGS_CLOSE: &str = "ui:settings:settings-close";
const CHAPTERS_CLOSE: &str = "ui:native-app-shell:native-story-tree-close";
const SETTINGS_ELEMENT_ID: &str = "settings";
const CHAPTERS_ELEMENT_ID: &str = "native-app-shell";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct NativeDemoE2eReport {
    completed: bool,
    steps: Vec<String>,
    dialogue_line_count: usize,
    dialogue_advance_count: usize,
    skip_used: bool,
    selected_choice_id: Option<String>,
    settings_visited: bool,
    chapters_visited: bool,
    settings_topmost: bool,
    chapters_topmost: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum NativeDemoE2eStep {
    #[default]
    AwaitTitle,
    AwaitFirstDialogue,
    AdvanceToChoice,
    AwaitChoiceBranch,
    OpenGameMenu,
    AwaitGameMenu,
    AwaitTitleConfirmation,
    AwaitReturnedTitle,
    AwaitSettings,
    AwaitTitleAfterSettings,
    AwaitChapters,
    AwaitFinalTitle,
    Complete,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum DialogueClickPhase {
    #[default]
    Reveal,
    Advance,
    AwaitProjectionChange,
}

#[derive(Clone, Debug, Default)]
pub(super) struct NativeDemoE2eState {
    enabled: bool,
    step: NativeDemoE2eStep,
    started_at: Option<Instant>,
    last_progress_at: Option<Instant>,
    steps: Vec<String>,
    dialogue_signature: Option<String>,
    choice_dialogue_signature: Option<String>,
    dialogue_click_phase: DialogueClickPhase,
    dialogue_line_count: usize,
    dialogue_advance_count: usize,
    skip_started: bool,
    skip_stop_requested: bool,
    selected_choice_id: Option<String>,
    settings_visited: bool,
    chapters_visited: bool,
    settings_topmost: bool,
    chapters_topmost: bool,
    stop_requested: bool,
    stop_requested_at: Option<Instant>,
    report_emitted: bool,
    final_frame_presented: bool,
}

impl NativeDemoE2eState {
    pub(super) fn new(enabled: bool) -> Self {
        Self {
            enabled,
            ..Self::default()
        }
    }

    pub(super) fn is_complete(&self) -> bool {
        self.enabled && self.step == NativeDemoE2eStep::Complete
    }

    pub(super) fn is_running(&self) -> bool {
        self.enabled && !self.is_complete()
    }

    pub(super) fn is_awaiting_final_frame(&self) -> bool {
        self.is_complete() && !self.final_frame_presented
    }

    pub(super) fn is_finished(&self) -> bool {
        self.is_complete() && self.final_frame_presented
    }

    pub(super) fn mark_final_frame_presented(&mut self) {
        if self.is_awaiting_final_frame() {
            self.final_frame_presented = true;
        }
    }

    pub(super) fn tick<B, A, V, F>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V, F>,
        host: &mut InMemoryNativeHostApi,
        input: &mut NativeWindowSmokeInputState,
        frame_json: &str,
    ) -> Result<(), NativeWindowSmokeError>
    where
        B: NativeRenderBackend,
    {
        if !self.enabled || self.is_complete() {
            return Ok(());
        }
        if self.stop_requested {
            // Optional diagnostic delay: QUA_NATIVE_RENDERER_WINDOW_DEMO_E2E_STOP_DELAY_MS=<ms>
            // keeps the run alive after the stop step so transient states
            // (font atlas rebuilds, presence fades) settle before the capture.
            let delay_ms = std::env::var("QUA_NATIVE_RENDERER_WINDOW_DEMO_E2E_STOP_DELAY_MS")
                .ok()
                .and_then(|value| value.trim().parse::<u64>().ok())
                .unwrap_or(0);
            let stop_at = *self.stop_requested_at.get_or_insert_with(Instant::now);
            if stop_at.elapsed() >= Duration::from_millis(delay_ms) {
                self.step = NativeDemoE2eStep::Complete;
            }
            return Ok(());
        }
        let now = Instant::now();
        let started_at = *self.started_at.get_or_insert(now);
        let last_progress_at = *self.last_progress_at.get_or_insert(now);
        if now.duration_since(started_at) >= DEMO_E2E_MAX_DURATION {
            return Err(NativeWindowSmokeError::new(format!(
                "Native demo E2E exceeded its {} second maximum at {:?}; completed steps: {}.",
                DEMO_E2E_MAX_DURATION.as_secs(),
                self.step,
                self.steps.join(", ")
            )));
        }
        if now.duration_since(last_progress_at) >= DEMO_E2E_STALL_TIMEOUT {
            return Err(NativeWindowSmokeError::new(format!(
                "Native demo E2E made no projection progress for {} seconds at {:?}; completed steps: {}.",
                DEMO_E2E_STALL_TIMEOUT.as_secs(),
                self.step,
                self.steps.join(", ")
            )));
        }

        match self.step {
            NativeDemoE2eStep::AwaitTitle => {
                if self.click(renderer, host, input, TITLE_START)? {
                    self.record_step("title-menu");
                    self.step = NativeDemoE2eStep::AwaitFirstDialogue;
                }
            }
            NativeDemoE2eStep::AwaitFirstDialogue => {
                if command_visible(renderer, DIALOGUE_PANEL) {
                    if let Some(signature) = dialogue_signature(frame_json) {
                        self.observe_dialogue(signature);
                        self.record_step("story-main");
                        self.step = NativeDemoE2eStep::AdvanceToChoice;
                    }
                }
            }
            NativeDemoE2eStep::AdvanceToChoice => {
                self.observe_dialogue_frame(frame_json);
                if command_visible(renderer, FIRST_STORY_CHOICE) {
                    if self.skip_started && flow_control_is_skip(frame_json) {
                        if !self.skip_stop_requested
                            && self.click(renderer, host, input, GAME_HUD_SKIP)?
                        {
                            self.skip_stop_requested = true;
                            self.last_progress_at = Some(Instant::now());
                        }
                    } else {
                        self.record_step("story-choice");
                        self.choice_dialogue_signature = self.dialogue_signature.clone();
                        if self.click(renderer, host, input, FIRST_STORY_CHOICE)? {
                            self.selected_choice_id = Some("catalog-first".to_string());
                            self.step = NativeDemoE2eStep::AwaitChoiceBranch;
                        }
                    }
                } else if !self.skip_started
                    && self.dialogue_line_count >= 2
                    && self.dialogue_advance_count >= 1
                {
                    if self.click(renderer, host, input, GAME_HUD_SKIP)? {
                        self.skip_started = true;
                        self.last_progress_at = Some(Instant::now());
                    }
                } else if !flow_control_is_skip(frame_json) {
                    self.advance_dialogue(renderer, host, input)?;
                }
            }
            NativeDemoE2eStep::AwaitChoiceBranch => {
                let next_signature = dialogue_signature(frame_json);
                let branch_visible = command_visible(renderer, DIALOGUE_PANEL)
                    && next_signature.is_some()
                    && next_signature != self.choice_dialogue_signature;
                if branch_visible {
                    if let Some(signature) = next_signature {
                        self.observe_dialogue(signature);
                    }
                    self.record_step("story-branch");
                    self.step = NativeDemoE2eStep::OpenGameMenu;
                }
            }
            NativeDemoE2eStep::OpenGameMenu => {
                if self.click(renderer, host, input, GAME_HUD_MENU)? {
                    self.step = NativeDemoE2eStep::AwaitGameMenu;
                }
            }
            NativeDemoE2eStep::AwaitGameMenu => {
                if command_visible(renderer, GAME_MENU_TITLE) {
                    self.record_step("game-menu");
                    if self.click(renderer, host, input, GAME_MENU_TITLE)? {
                        self.step = NativeDemoE2eStep::AwaitTitleConfirmation;
                    }
                }
            }
            NativeDemoE2eStep::AwaitTitleConfirmation => {
                if command_visible(renderer, TITLE_CONFIRM) {
                    self.record_step("title-confirmation");
                    if self.click(renderer, host, input, TITLE_CONFIRM)? {
                        self.step = NativeDemoE2eStep::AwaitReturnedTitle;
                    }
                }
            }
            NativeDemoE2eStep::AwaitReturnedTitle => {
                if command_visible(renderer, TITLE_START) && command_visible(renderer, TITLE_CONFIG)
                {
                    self.record_step("title-return");
                    if self.click(renderer, host, input, TITLE_CONFIG)? {
                        self.step = NativeDemoE2eStep::AwaitSettings;
                    }
                }
            }
            NativeDemoE2eStep::AwaitSettings => {
                if command_visible(renderer, SETTINGS_CLOSE) {
                    self.settings_visited = true;
                    self.settings_topmost = topmost_ui_overlay_element_id(renderer).as_deref()
                        == Some(SETTINGS_ELEMENT_ID);
                    self.record_step("settings");
                    if self.click(renderer, host, input, SETTINGS_CLOSE)? {
                        self.step = NativeDemoE2eStep::AwaitTitleAfterSettings;
                    }
                }
            }
            NativeDemoE2eStep::AwaitTitleAfterSettings => {
                if command_visible(renderer, TITLE_START)
                    && command_visible(renderer, TITLE_CHAPTERS)
                {
                    self.record_step("settings-return");
                    if self.click(renderer, host, input, TITLE_CHAPTERS)? {
                        self.step = NativeDemoE2eStep::AwaitChapters;
                    }
                }
            }
            NativeDemoE2eStep::AwaitChapters => {
                if command_visible(renderer, CHAPTERS_CLOSE) {
                    self.chapters_visited = true;
                    self.chapters_topmost = topmost_ui_overlay_element_id(renderer).as_deref()
                        == Some(CHAPTERS_ELEMENT_ID);
                    self.record_step("chapters");
                    if self.click(renderer, host, input, CHAPTERS_CLOSE)? {
                        self.step = NativeDemoE2eStep::AwaitFinalTitle;
                    }
                }
            }
            NativeDemoE2eStep::AwaitFinalTitle => {
                if command_visible(renderer, TITLE_START) {
                    self.record_step("chapters-return");
                    self.finish()?;
                }
            }
            NativeDemoE2eStep::Complete => {}
        }
        Ok(())
    }

    fn advance_dialogue<B, A, V, F>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V, F>,
        host: &mut InMemoryNativeHostApi,
        input: &mut NativeWindowSmokeInputState,
    ) -> Result<(), NativeWindowSmokeError>
    where
        B: NativeRenderBackend,
    {
        match self.dialogue_click_phase {
            DialogueClickPhase::Reveal => {
                if self.click_dialogue_area(renderer, host, input)? {
                    self.dialogue_click_phase = DialogueClickPhase::Advance;
                }
            }
            DialogueClickPhase::Advance => {
                if self.click_dialogue_area(renderer, host, input)? {
                    self.dialogue_advance_count = self.dialogue_advance_count.saturating_add(1);
                    self.dialogue_click_phase = DialogueClickPhase::AwaitProjectionChange;
                }
            }
            DialogueClickPhase::AwaitProjectionChange => {}
        }
        Ok(())
    }

    fn observe_dialogue_frame(&mut self, frame_json: &str) {
        let Some(signature) = dialogue_signature(frame_json) else {
            return;
        };
        if self.dialogue_signature.as_deref() != Some(signature.as_str()) {
            self.observe_dialogue(signature);
        }
    }

    fn observe_dialogue(&mut self, signature: String) {
        if self.dialogue_signature.as_deref() == Some(signature.as_str()) {
            return;
        }
        self.dialogue_signature = Some(signature);
        self.dialogue_line_count = self.dialogue_line_count.saturating_add(1);
        self.dialogue_click_phase = DialogueClickPhase::Reveal;
        self.last_progress_at = Some(Instant::now());
    }

    fn record_step(&mut self, step: &str) {
        if self.steps.last().is_some_and(|current| current == step) {
            return;
        }
        self.steps.push(step.to_string());
        self.last_progress_at = Some(Instant::now());
        println!("Native demo E2E completed step: {step}.");
        // Diagnostic: QUA_NATIVE_RENDERER_WINDOW_DEMO_E2E_STOP_AT=<step> stops
        // the run right after the named step so the capture artifact shows
        // that exact screen (e.g. "game-menu" to inspect the menu panel).
        if std::env::var("QUA_NATIVE_RENDERER_WINDOW_DEMO_E2E_STOP_AT")
            .ok()
            .as_deref()
            == Some(step)
        {
            self.stop_requested = true;
        }
    }

    fn finish(&mut self) -> Result<(), NativeWindowSmokeError> {
        self.step = NativeDemoE2eStep::Complete;
        if self.report_emitted {
            return Ok(());
        }
        let report = NativeDemoE2eReport {
            completed: true,
            steps: self.steps.clone(),
            dialogue_line_count: self.dialogue_line_count,
            dialogue_advance_count: self.dialogue_advance_count,
            skip_used: self.skip_started,
            selected_choice_id: self.selected_choice_id.clone(),
            settings_visited: self.settings_visited,
            chapters_visited: self.chapters_visited,
            settings_topmost: self.settings_topmost,
            chapters_topmost: self.chapters_topmost,
        };
        let json = serde_json::to_string(&report).map_err(|error| {
            NativeWindowSmokeError::new(format!(
                "Failed to serialize native demo E2E report: {error}."
            ))
        })?;
        println!("Qua native demo e2e json: {json}");
        self.report_emitted = true;
        Ok(())
    }
    fn click<B, A, V, F>(
        &self,
        renderer: &mut NativeRenderer<B, A, V, F>,
        host: &mut InMemoryNativeHostApi,
        input: &mut NativeWindowSmokeInputState,
        command_id: &str,
    ) -> Result<bool, NativeWindowSmokeError>
    where
        B: NativeRenderBackend,
    {
        if self.stop_requested {
            return Ok(false);
        }
        let clicked = input.click_render_command(renderer, host, command_id)?;
        if clicked {
            println!("Native demo E2E clicked render command: {command_id}.");
        }
        Ok(clicked)
    }

    fn click_dialogue_area<B, A, V, F>(
        &self,
        renderer: &mut NativeRenderer<B, A, V, F>,
        host: &mut InMemoryNativeHostApi,
        input: &mut NativeWindowSmokeInputState,
    ) -> Result<bool, NativeWindowSmokeError>
    where
        B: NativeRenderBackend,
    {
        if self.stop_requested {
            return Ok(false);
        }
        let clicked = input.click_unhandled_render_command_area(renderer, host, DIALOGUE_PANEL)?;
        if clicked {
            println!("Native demo E2E clicked unhandled render command area: {DIALOGUE_PANEL}.");
        }
        Ok(clicked)
    }
}

fn command_visible<B, A, V, F>(renderer: &NativeRenderer<B, A, V, F>, command_id: &str) -> bool
where
    B: NativeRenderBackend,
{
    renderer.state().frame().is_some_and(|frame| {
        frame
            .graph
            .commands()
            .iter()
            .any(|command| command.id == command_id)
    })
}

/// `command_visible` only proves a draw command exists, not that anything is
/// actually on screen: a UI overlay declaring a higher stack still paints over
/// it. Report the element id of the frontmost UI surface so the E2E can assert
/// the panel it just opened is the one the player can see.
fn topmost_ui_overlay_element_id<B, A, V, F>(
    renderer: &NativeRenderer<B, A, V, F>,
) -> Option<String>
where
    B: NativeRenderBackend,
{
    renderer.state().frame().and_then(|frame| {
        frame
            .graph
            .commands()
            .iter()
            .filter_map(|command| match &command.params {
                DrawCommandParams::UiSurface(params) => {
                    Some((command.z_index, params.element_id.clone()))
                }
                _ => None,
            })
            .max_by_key(|(z_index, _)| *z_index)
            .map(|(_, element_id)| element_id)
    })
}

fn dialogue_signature(frame_json: &str) -> Option<String> {
    let frame = serde_json::from_str::<serde_json::Value>(frame_json).ok()?;
    let dialogue = frame.pointer("/view/dialogue")?;
    let text = dialogue.get("text")?;
    let text = text
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| text.to_string());
    if text.is_empty() || text == "null" {
        return None;
    }
    let speaker = dialogue
        .get("speaker")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    Some(format!("{speaker}\n{text}"))
}

fn flow_control_is_skip(frame_json: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(frame_json)
        .ok()
        .and_then(|frame| {
            frame
                .pointer("/view/flowControl/mode")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string)
        })
        .as_deref()
        == Some("skip")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completed_e2e_waits_for_its_final_presented_frame() {
        let mut state = NativeDemoE2eState::new(true);
        state.step = NativeDemoE2eStep::Complete;

        assert!(state.is_complete());
        assert!(state.is_awaiting_final_frame());
        assert!(!state.is_finished());

        state.mark_final_frame_presented();

        assert!(!state.is_awaiting_final_frame());
        assert!(state.is_finished());
    }
}
