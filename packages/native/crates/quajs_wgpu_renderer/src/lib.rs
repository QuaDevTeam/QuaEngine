pub mod audio;
pub mod capabilities;
pub mod fonts;
pub mod frame;
pub mod input;
pub mod projection;
pub mod projection_runtime;
pub mod render_graph;
pub mod renderer;
pub mod resources;
pub mod stage_layout;
pub mod video;

pub use capabilities::{
    native_wgpu_audio_playback_capability, native_wgpu_capabilities,
    native_wgpu_capabilities_with_audio_playback,
};

#[cfg(all(test, feature = "bench-smoke"))]
mod bench_smoke;
