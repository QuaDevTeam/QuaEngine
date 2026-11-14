//! Host-driven Native SDK. No application, event loop or process-global logger is started.
#![cfg(all(feature = "embedded-sdk", target_os = "macos"))]
#![allow(dead_code)]

mod audio_backend;
mod audio_sync;
mod font_backend;
mod font_sync;
mod host_assets;
mod native_sdk;
mod packaged_app;
mod product_frame_scheduler;
mod product_input;
mod product_loop;
mod product_runtime;
mod product_window;
mod qpk;
mod sprite_resources;
mod startup;
#[allow(unused_imports)]
mod target_bundle;
mod texture_sync;
mod video_backend;
mod video_sync;
