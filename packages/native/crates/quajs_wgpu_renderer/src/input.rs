pub mod event;
pub mod intent;
pub mod pointer;

pub use event::{
    resolve_pointer_event, resolve_pointer_event_with_interaction, NativePointerButton,
    NativePointerEvent, NativePointerEventPhase, NativePointerEventResolution,
    NativePointerInteractionState, NativePointerPress,
};
pub use intent::{renderer_intent_from_command, resolve_renderer_intent_at, RendererIntentHit};
pub use pointer::{resolve_pointer_intent_at, PointerIntentResolution};

#[cfg(test)]
mod tests;
