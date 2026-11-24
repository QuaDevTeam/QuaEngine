use std::mem::size_of_val;

use super::{MonitorHandle, NativeDisplayColor};
use ::windows::core::Interface;
use ::windows::Win32::Devices::Display::*;
use ::windows::Win32::Foundation::ERROR_SUCCESS;
use ::windows::Win32::Graphics::Dxgi::Common::{
    DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020, DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709,
};
use ::windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1, IDXGIOutput6};
use winit::platform::windows::MonitorHandleExtWindows;

pub(super) fn probe_monitor(monitor: &MonitorHandle) -> Option<NativeDisplayColor> {
    // A fresh factory reflects HDR toggles as well as hotplug; a previously
    // enumerated IDXGIOutput can keep reporting the old desktop color space.
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1().ok()? };
    for adapter_index in 0.. {
        let adapter = unsafe { factory.EnumAdapters1(adapter_index).ok()? };
        for output_index in 0.. {
            let Ok(output) = (unsafe { adapter.EnumOutputs(output_index) }) else {
                break;
            };
            let Ok(output) = output.cast::<IDXGIOutput6>() else {
                continue;
            };
            let Ok(desc) = (unsafe { output.GetDesc1() }) else {
                continue;
            };
            if desc.Monitor.0 as isize != monitor.hmonitor() {
                continue;
            }
            let (hdr_available, name) = match desc.ColorSpace {
                DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020 => (Some(true), Some("BT.2020 PQ")),
                DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709 => (Some(false), Some("BT.709 gamma 2.2")),
                _ => (None, None),
            };
            return Some(NativeDisplayColor {
                color_space: name.map(str::to_owned),
                hdr_available,
                current_edr_headroom: None,
                sdr_white_scale: if hdr_available == Some(true) {
                    sdr_white_scale(&desc.DeviceName)
                } else {
                    None
                },
            });
        }
    }
    None
}

fn sdr_white_scale(device_name: &[u16; 32]) -> Option<f32> {
    let mut path_count = 0;
    let mut mode_count = 0;
    // SAFETY: Each call receives its documented C structure and buffer size.
    // A concurrent topology change fails this sample; the next probe retries.
    unsafe {
        if GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut path_count, &mut mode_count)
            != ERROR_SUCCESS
        {
            return None;
        }
        let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); path_count as usize];
        let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); mode_count as usize];
        if QueryDisplayConfig(
            QDC_ONLY_ACTIVE_PATHS,
            &mut path_count,
            paths.as_mut_ptr(),
            &mut mode_count,
            modes.as_mut_ptr(),
            None,
        ) != ERROR_SUCCESS
        {
            return None;
        }

        let mut scale = None;
        for path in &paths[..path_count as usize] {
            let mut source = DISPLAYCONFIG_SOURCE_DEVICE_NAME::default();
            source.header = DISPLAYCONFIG_DEVICE_INFO_HEADER {
                r#type: DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
                size: size_of_val(&source) as u32,
                adapterId: path.sourceInfo.adapterId,
                id: path.sourceInfo.id,
            };
            if DisplayConfigGetDeviceInfo(&mut source.header) != 0
                || source.viewGdiDeviceName.split(|&c| c == 0).next()
                    != device_name.split(|&c| c == 0).next()
            {
                continue;
            }
            let mut white = DISPLAYCONFIG_SDR_WHITE_LEVEL::default();
            white.header = DISPLAYCONFIG_DEVICE_INFO_HEADER {
                r#type: DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL,
                size: size_of_val(&white) as u32,
                adapterId: path.targetInfo.adapterId,
                id: path.targetInfo.id,
            };
            if DisplayConfigGetDeviceInfo(&mut white.header) != 0 || white.SDRWhiteLevel == 0 {
                return None;
            }
            // scRGB 1.0 is 80 nits. Windows reports units of 1/1000 of this value.
            let value = white.SDRWhiteLevel as f32 / 1000.0;
            if scale.is_some_and(|prior| prior != value) {
                return None; // Cloned targets have inconsistent SDR white.
            }
            scale = Some(value);
        }
        scale
    }
}
