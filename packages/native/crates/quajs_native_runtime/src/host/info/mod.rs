mod builder;
mod manifest;
mod platform;
mod types;

pub use builder::NativeHostInfoBuilder;
pub use manifest::capability_manifest_hash;
pub use platform::{current_platform, current_profile};
pub use types::{
    NativeAppInfo, NativeHostInfo, NativePlatform, NativeProfile, NativeRendererInfo,
    NativeRuntimeInfo, RendererCapability,
};

#[cfg(test)]
mod tests;
