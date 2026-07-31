use std::collections::{BTreeMap, BTreeSet};
use std::time::Instant;

use crate::stage_layout::{StageClientPoint, StageClientRectOrigin};

use super::control::NativeUiControlInteractionState;
use super::{PointerIntentResolution, RendererIntentHit};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativePointerEventPhase {
    Press,
    Release,
    Move,
    Cancel,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativePointerButton {
    Primary,
    Secondary,
    Auxiliary,
    Other(u16),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NativePointerEvent {
    pub phase: NativePointerEventPhase,
    pub pointer_id: u64,
    pub point: StageClientPoint,
    pub container_rect: StageClientRectOrigin,
    pub button: Option<NativePointerButton>,
}

impl NativePointerEvent {
    pub fn new(
        phase: NativePointerEventPhase,
        point: StageClientPoint,
        container_rect: StageClientRectOrigin,
    ) -> Self {
        Self {
            phase,
            pointer_id: 0,
            point,
            container_rect,
            button: None,
        }
    }

    pub fn with_pointer_id(mut self, pointer_id: u64) -> Self {
        self.pointer_id = pointer_id;
        self
    }

    pub fn with_button(mut self, button: NativePointerButton) -> Self {
        self.button = Some(button);
        self
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativePointerEventResolution {
    pub event: NativePointerEvent,
    pub pointer: PointerIntentResolution,
    pub intent_to_dispatch: Option<RendererIntentHit>,
    pub visual_state_changed: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativePointerInteractionState {
    active_presses: BTreeMap<u64, NativePointerPress>,
    hovered_command_id: Option<String>,
    focused_command_id: Option<String>,
    pub(crate) controls: NativeUiControlInteractionState,
    visual_transition: Option<NativePointerVisualTransition>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct NativePointerVisualTransition {
    pub(crate) started_at: Instant,
    pub(crate) hovered_command_id: Option<String>,
    pub(crate) focused_command_id: Option<String>,
    pub(crate) pressed_command_ids: BTreeSet<String>,
}

impl NativePointerInteractionState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn active_press(&self, pointer_id: u64) -> Option<&NativePointerPress> {
        self.active_presses.get(&pointer_id)
    }

    pub fn active_press_count(&self) -> usize {
        self.active_presses.len()
    }

    pub fn hovered_command_id(&self) -> Option<&str> {
        self.hovered_command_id.as_deref()
    }

    pub fn focused_command_id(&self) -> Option<&str> {
        self.focused_command_id.as_deref()
    }

    pub fn is_pressed(&self, command_id: &str) -> bool {
        self.active_presses
            .values()
            .any(|press| press.command_id == command_id)
    }

    pub fn has_visual_feedback(&self) -> bool {
        self.hovered_command_id.is_some()
            || self.focused_command_id.is_some()
            || !self.active_presses.is_empty()
            || self.controls.has_feedback()
    }

    pub(crate) fn visual_transition(&self) -> Option<&NativePointerVisualTransition> {
        self.visual_transition.as_ref()
    }

    pub fn cancel_pointer(&mut self, pointer_id: u64) -> bool {
        let previous = self.visual_snapshot();
        let press_changed = self.active_presses.remove(&pointer_id).is_some();
        let hover_changed = self.hovered_command_id.take().is_some();
        let focus_changed = self.focused_command_id.take().is_some();
        let changed = press_changed || hover_changed || focus_changed;
        if changed {
            self.visual_transition = Some(previous);
        }
        changed
    }

    /// Reconcile interaction state against the current render graph.
    /// Prunes `focused_command_id` when the command no longer exists in the
    /// graph (e.g. after a scene transition), and delegates control-state
    /// reconciliation to [`NativeUiControlInteractionState::reconcile`].
    pub fn reconcile(&mut self, graph: &crate::render_graph::RenderGraph) {
        if let Some(focused_id) = &self.focused_command_id {
            let still_exists = graph.commands().iter().any(|cmd| cmd.id == *focused_id);
            if !still_exists {
                let previous = self.visual_snapshot();
                self.focused_command_id = None;
                self.visual_transition = Some(previous);
            }
        }
        self.controls.reconcile(graph);
    }

    pub fn clear(&mut self) {
        self.active_presses.clear();
        self.hovered_command_id = None;
        self.focused_command_id = None;
        self.controls.clear();
        self.visual_transition = None;
    }

    fn visual_snapshot(&self) -> NativePointerVisualTransition {
        NativePointerVisualTransition {
            started_at: Instant::now(),
            hovered_command_id: self.hovered_command_id.clone(),
            focused_command_id: self.focused_command_id.clone(),
            pressed_command_ids: self
                .active_presses
                .values()
                .map(|press| press.command_id.clone())
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativePointerPress {
    pub pointer_id: u64,
    pub command_id: String,
}

pub fn resolve_pointer_event(
    event: NativePointerEvent,
    pointer: PointerIntentResolution,
) -> NativePointerEventResolution {
    resolve_pointer_event_with_interaction(
        &mut NativePointerInteractionState::new(),
        event,
        pointer,
    )
}

pub fn resolve_pointer_event_with_interaction(
    interaction: &mut NativePointerInteractionState,
    event: NativePointerEvent,
    pointer: PointerIntentResolution,
) -> NativePointerEventResolution {
    let previous_hover = interaction.hovered_command_id.clone();
    let previous_focus = interaction.focused_command_id.clone();
    let previous_pressed = interaction.active_presses.clone();

    interaction.hovered_command_id = match event.phase {
        NativePointerEventPhase::Cancel => None,
        _ => pointer.intent.as_ref().map(|hit| hit.command_id.clone()),
    };

    if event.phase == NativePointerEventPhase::Press && is_primary_button(&event) {
        interaction.focused_command_id = pointer.intent.as_ref().map(|hit| hit.command_id.clone());
    }

    let intent_to_dispatch = match event.phase {
        NativePointerEventPhase::Press => {
            remember_pressed_intent(
                interaction,
                event.pointer_id,
                &event,
                pointer.intent.as_ref(),
            );
            None
        }
        NativePointerEventPhase::Release => {
            let pressed = interaction.active_presses.remove(&event.pointer_id);
            should_dispatch_pointer_intent(&event, pressed.as_ref(), pointer.intent.as_ref())
                .then(|| pointer.intent.clone())
                .flatten()
        }
        NativePointerEventPhase::Cancel => {
            interaction.active_presses.remove(&event.pointer_id);
            None
        }
        NativePointerEventPhase::Move => None,
    };

    let visual_state_changed = previous_hover != interaction.hovered_command_id
        || previous_focus != interaction.focused_command_id
        || previous_pressed != interaction.active_presses;
    if visual_state_changed {
        interaction.visual_transition = Some(NativePointerVisualTransition {
            started_at: Instant::now(),
            hovered_command_id: previous_hover,
            focused_command_id: previous_focus,
            pressed_command_ids: previous_pressed
                .values()
                .map(|press| press.command_id.clone())
                .collect(),
        });
    }

    NativePointerEventResolution {
        event,
        pointer,
        intent_to_dispatch,
        visual_state_changed,
    }
}

fn remember_pressed_intent(
    interaction: &mut NativePointerInteractionState,
    pointer_id: u64,
    event: &NativePointerEvent,
    hit: Option<&RendererIntentHit>,
) {
    if !is_primary_button(event) {
        interaction.active_presses.remove(&pointer_id);
        return;
    }

    match hit {
        Some(hit) => {
            interaction.active_presses.insert(
                pointer_id,
                NativePointerPress {
                    pointer_id,
                    command_id: hit.command_id.clone(),
                },
            );
        }
        None => {
            interaction.active_presses.remove(&pointer_id);
        }
    }
}

fn should_dispatch_pointer_intent(
    event: &NativePointerEvent,
    pressed: Option<&NativePointerPress>,
    hit: Option<&RendererIntentHit>,
) -> bool {
    if event.phase != NativePointerEventPhase::Release || !is_primary_button(event) {
        return false;
    }

    match (pressed, hit) {
        (Some(pressed), Some(hit)) => pressed.command_id == hit.command_id,
        _ => false,
    }
}

fn is_primary_button(event: &NativePointerEvent) -> bool {
    matches!(event.button, None | Some(NativePointerButton::Primary))
}
