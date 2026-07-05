use quajs_native_runtime::NativeHostInfo;

use crate::target_bundle::{
    NativeStartupError, NativeTargetBundleManifest, TargetBundleNativeRuntimeInfo,
};

pub(super) fn validate_manifest_runtime_against_host(
    manifest: &NativeTargetBundleManifest,
    host_info: &NativeHostInfo,
) -> Result<(), NativeStartupError> {
    let Some(runtime) = manifest.native_runtime.as_ref() else {
        return Ok(());
    };

    let mut diagnostics = Vec::new();
    check_manifest_runtime_metadata(runtime, host_info, &mut diagnostics);

    if diagnostics.is_empty() {
        Ok(())
    } else {
        Err(NativeStartupError::new(diagnostics))
    }
}

fn check_manifest_runtime_metadata(
    runtime: &TargetBundleNativeRuntimeInfo,
    host_info: &NativeHostInfo,
    diagnostics: &mut Vec<String>,
) {
    check_runtime_field(
        "quickjsVersion",
        runtime.quickjs_version.as_deref(),
        host_info.runtime.quickjs_version.as_str(),
        diagnostics,
    );
    check_runtime_field(
        "nativeRuntimeVersion",
        runtime.native_runtime_version.as_deref(),
        host_info.runtime.native_runtime_version.as_str(),
        diagnostics,
    );
    check_runtime_field(
        "assetAdapterVersion",
        runtime.asset_adapter_version.as_deref(),
        host_info.runtime.asset_adapter_version.as_str(),
        diagnostics,
    );
    check_runtime_field(
        "storeAdapterVersion",
        runtime.store_adapter_version.as_deref(),
        host_info.runtime.store_adapter_version.as_str(),
        diagnostics,
    );
}

fn check_runtime_field(
    field: &str,
    actual: Option<&str>,
    expected: &str,
    diagnostics: &mut Vec<String>,
) {
    if let Some(actual) = actual {
        if actual != expected {
            diagnostics.push(format!(
                "Native target bundle manifest nativeRuntime.{field} \"{actual}\" does not match host runtime value \"{expected}\"."
            ));
        }
    }
}
