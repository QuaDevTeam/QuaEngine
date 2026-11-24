//! Host-driven SDK on macOS; NativeActivity shared library on Android.
#![allow(dead_code)]

#[cfg(all(feature = "embedded-sdk", target_os = "macos"))]
include!("embedded_sdk_modules.rs");

#[cfg(all(feature = "native-window", target_os = "android"))]
include!("main.rs");
