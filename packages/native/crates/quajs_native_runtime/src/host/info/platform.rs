use super::{NativePlatform, NativeProfile};

pub fn current_profile() -> NativeProfile {
    if cfg!(debug_assertions) {
        NativeProfile::Debug
    } else {
        NativeProfile::Release
    }
}

pub fn current_platform() -> NativePlatform {
    if cfg!(target_os = "macos") {
        NativePlatform::MacOs
    } else if cfg!(target_os = "windows") {
        NativePlatform::Windows
    } else {
        NativePlatform::Linux
    }
}
