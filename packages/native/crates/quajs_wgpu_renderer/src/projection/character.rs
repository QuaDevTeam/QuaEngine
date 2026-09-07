pub(crate) mod animation;
pub mod builder;
pub mod layout;
pub mod types;

pub use builder::{append_character_commands, build_character_commands};
pub use layout::{resolve_character_anchor, resolve_character_bounds};
pub use types::{CharacterPosition, CharacterProjection, CharacterSpriteLayerProjection};

#[cfg(test)]
mod tests;
