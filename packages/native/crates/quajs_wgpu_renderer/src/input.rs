pub(crate) mod control;
pub mod event;
pub mod intent;
pub mod pointer;

pub(crate) use event::NativePointerVisualTransition;
pub use event::{
    resolve_pointer_event, resolve_pointer_event_with_interaction, NativePointerButton,
    NativePointerEvent, NativePointerEventPhase, NativePointerEventResolution,
    NativePointerInteractionState, NativePointerPress,
};
pub use intent::{
    native_renderer_intent_from_hit, native_renderer_intent_from_renderer_intent,
    renderer_intent_from_command, resolve_renderer_intent_at, RendererIntentHit,
};
pub use pointer::{resolve_pointer_intent_at, PointerIntentResolution};

#[cfg(test)]
mod tests;
