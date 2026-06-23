pub mod builder;
pub mod layout;
pub mod types;

pub use builder::{append_background_commands, build_background_commands};
pub use types::{
    BackgroundFit, BackgroundLayerProjection, BackgroundMode, BackgroundProjection,
    BackgroundVideoProjection, PackageProvenance,
};

#[cfg(test)]
mod tests;
