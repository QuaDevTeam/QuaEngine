pub mod builder;
pub mod layout;
pub(crate) mod shadow;
pub mod types;

pub use builder::{
    append_background_commands, append_background_commands_with_video_frame_resources,
    build_background_commands, build_background_commands_with_video_frame_resources,
};
pub use types::{
    BackgroundCompositionProjection, BackgroundFilterProjection, BackgroundFit,
    BackgroundLayerProjection, BackgroundMaskProjection, BackgroundMode, BackgroundProjection,
    BackgroundVideoProjection,
};

#[cfg(test)]
mod tests;
