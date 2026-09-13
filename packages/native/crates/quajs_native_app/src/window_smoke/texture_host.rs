use quajs_native_runtime::{InMemoryNativeHostApi, NativeMountedBundleInfo};

use crate::startup::{compile_time_native_app_config, create_native_startup_host_info};

use super::config::WINDOW_DEV_QPK_ENV;
use super::dev_qpk::mount_native_dev_qpk;
use super::error::NativeWindowSmokeError;

const WINDOW_SMOKE_RUNTIME_UI_PACKAGE_ID: &str = "runtime.ui";
const WINDOW_SMOKE_BASE_PACKAGE_ID: &str = "base";

const WINDOW_SMOKE_TEXTURE_ASSETS: [(&str, &[u8]); 2] = [
    ("ui/panel.png", WINDOW_SMOKE_PNG),
    ("ui/poster.png", WINDOW_SMOKE_PNG),
];

// 1x1 transparent RGBA PNG. The window smoke keeps texture bytes in-memory so it
// never turns a debug render path into a filesystem or network asset loader.
const WINDOW_SMOKE_PNG: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
    0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10,
    45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];

pub(super) fn create_window_smoke_texture_host() -> InMemoryNativeHostApi {
    let host_info = create_native_startup_host_info(compile_time_native_app_config(), None)
        .expect("window smoke host info should use compile-time native app metadata");
    let mut host = InMemoryNativeHostApi::new(host_info)
        .with_mounted_bundle(window_smoke_bundle(
            "base-bundle",
            WINDOW_SMOKE_BASE_PACKAGE_ID,
        ))
        .with_mounted_bundle(window_smoke_bundle(
            "runtime-ui-bundle",
            WINDOW_SMOKE_RUNTIME_UI_PACKAGE_ID,
        ));

    for (asset_name, bytes) in WINDOW_SMOKE_TEXTURE_ASSETS {
        host = host.with_asset(asset_name, bytes.to_vec());
    }

    host
}

pub(super) fn create_window_smoke_texture_host_from_env(
) -> Result<InMemoryNativeHostApi, NativeWindowSmokeError> {
    let host = create_window_smoke_texture_host();
    let Some(path) = std::env::var_os(WINDOW_DEV_QPK_ENV) else {
        return Ok(host);
    };
    mount_native_dev_qpk(host, path)
}

fn window_smoke_bundle(name: &str, runtime_package_id: &str) -> NativeMountedBundleInfo {
    NativeMountedBundleInfo {
        name: name.to_string(),
        logical_name: Some(runtime_package_id.to_string()),
        version: Some(1),
        hash: None,
        runtime_package_id: Some(runtime_package_id.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use quajs_native_runtime::{NativeAssetReadRequest, NativeHostApi};

    use super::*;

    #[test]
    fn texture_host_exposes_fixture_assets_from_memory() {
        let host = create_window_smoke_texture_host();
        let bundles = host
            .list_mounted_bundles()
            .expect("fixture bundles should be listed");

        assert_eq!(bundles.len(), 2);
        assert!(bundles
            .iter()
            .any(|bundle| bundle.runtime_package_id.as_deref()
                == Some(WINDOW_SMOKE_RUNTIME_UI_PACKAGE_ID)));
        assert!(bundles.iter().any(
            |bundle| bundle.runtime_package_id.as_deref() == Some(WINDOW_SMOKE_BASE_PACKAGE_ID)
        ));

        let bytes = host
            .read_asset_bytes(&NativeAssetReadRequest {
                url: "ui/panel.png".to_string(),
                bundle_name: Some("runtime-ui-bundle".to_string()),
                asset_id: None,
            })
            .expect("fixture panel texture should be readable");
        assert!(bytes.starts_with(&[137, 80, 78, 71]));
    }
}
