use crate::product_window::NativeDisplayColor;
use winit::monitor::MonitorHandle;

#[cfg(target_os = "windows")]
mod windows;

/// A windowless embedding host cannot identify its consumer's physical screen.
pub(super) fn probe(monitor: Option<&MonitorHandle>) -> NativeDisplayColor {
    monitor.and_then(probe_monitor).unwrap_or_default()
}

#[cfg(target_os = "macos")]
fn probe_monitor(monitor: &MonitorHandle) -> Option<NativeDisplayColor> {
    use std::ffi::{c_char, CStr};
    use winit::platform::macos::MonitorHandleExtMacOS;
    unsafe extern "C" {
        fn qua_monitor_color(
            display_id: u32,
            potential: *mut f64,
            current: *mut f64,
            profile: *mut c_char,
            profile_capacity: usize,
        );
    }
    let mut profile = [0; 256];
    let mut potential = 0.0;
    let mut current = 0.0;
    // SAFETY: This call is synchronous on the window thread. The C function
    // bounds the string copy and leaves a trailing NUL, including on failure.
    let profile = unsafe {
        qua_monitor_color(
            monitor.native_id(),
            &mut potential,
            &mut current,
            profile.as_mut_ptr(),
            profile.len(),
        );
        CStr::from_ptr(profile.as_ptr()).to_str().ok()
    };
    if profile.is_none_or(str::is_empty) && potential == 0.0 && current == 0.0 {
        return None;
    }
    Some(NativeDisplayColor {
        color_space: profile.filter(|name| !name.is_empty()).map(str::to_owned),
        // EDR may not be active until the first EDR layer is configured.
        hdr_available: (potential.is_finite() && potential >= 1.0).then_some(potential > 1.0),
        current_edr_headroom: (current.is_finite() && current >= 1.0).then_some(current),
        // On Apple, a linear 1.0 always denotes the display's SDR white.
        sdr_white_scale: Some(1.0),
    })
}

#[cfg(target_os = "windows")]
use windows::probe_monitor;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn probe_monitor(_: &MonitorHandle) -> Option<NativeDisplayColor> {
    None
}
