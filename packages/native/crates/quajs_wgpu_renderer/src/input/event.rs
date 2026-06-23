use crate::stage_layout::{StageClientPoint, StageClientRectOrigin};

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
}

pub fn resolve_pointer_event(
    event: NativePointerEvent,
    pointer: PointerIntentResolution,
) -> NativePointerEventResolution {
    let intent_to_dispatch = should_dispatch_pointer_intent(&event)
        .then(|| pointer.intent.clone())
        .flatten();

    NativePointerEventResolution {
        event,
        pointer,
        intent_to_dispatch,
    }
}

fn should_dispatch_pointer_intent(event: &NativePointerEvent) -> bool {
    event.phase == NativePointerEventPhase::Release
        && matches!(event.button, None | Some(NativePointerButton::Primary))
}
