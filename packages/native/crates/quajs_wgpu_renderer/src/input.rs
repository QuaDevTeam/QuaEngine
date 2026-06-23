pub mod intent;

pub use intent::{renderer_intent_from_command, resolve_renderer_intent_at, RendererIntentHit};

#[cfg(test)]
mod tests;
