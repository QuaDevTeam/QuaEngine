use crate::input::{
    resolve_pointer_event_with_interaction, NativePointerEvent, NativePointerEventResolution,
    PointerIntentResolution, RendererIntentHit,
};
use crate::stage_layout::{StageClientPoint, StageClientRectOrigin};

use super::NativeRendererState;

impl NativeRendererState {
    pub fn hit_intent(&self, logical_x: f64, logical_y: f64) -> Option<RendererIntentHit> {
        self.frame
            .as_ref()
            .and_then(|frame| frame.hit_intent(logical_x, logical_y))
    }

    pub fn pointer_intent(
        &self,
        point: StageClientPoint,
        container_rect: StageClientRectOrigin,
    ) -> Option<PointerIntentResolution> {
        self.frame
            .as_ref()
            .map(|frame| frame.pointer_intent(point, container_rect))
    }

    pub fn pointer_event(
        &mut self,
        event: NativePointerEvent,
    ) -> Option<NativePointerEventResolution> {
        let frame = self.frame.as_ref()?;
        // Interaction geometry is authoritative from the projected frame. Visual
        // hover variants may translate/resize paint, but must never move the hit
        // target underneath a stationary pointer (which causes hover flicker).
        let pointer = frame.pointer_intent(event.point, event.container_rect);
        let pointer = self
            .pointer_interaction
            .controls
            .resolve_pointer(&frame.graph, pointer);
        let mut resolution =
            resolve_pointer_event_with_interaction(&mut self.pointer_interaction, event, pointer);
        self.pointer_interaction
            .controls
            .apply_event(&frame.graph, &mut resolution);
        Some(resolution)
    }

    pub fn cancel_pointer_interaction(&mut self, pointer_id: u64) -> bool {
        self.pointer_interaction.cancel_pointer(pointer_id)
    }
}
