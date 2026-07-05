use super::NativeTargetBundleManifest;

pub(super) fn check_native_runtime_info(
    manifest: &NativeTargetBundleManifest,
    diagnostics: &mut Vec<String>,
) {
    let Some(native_runtime) = manifest.native_runtime.as_ref() else {
        diagnostics
            .push("Native target bundle manifest must include nativeRuntime metadata.".to_string());
        return;
    };

    check_required_runtime_field(
        "quickjsVersion",
        native_runtime.quickjs_version.as_deref(),
        diagnostics,
    );
    check_required_runtime_field(
        "nativeRuntimeVersion",
        native_runtime.native_runtime_version.as_deref(),
        diagnostics,
    );
    check_required_runtime_field(
        "assetAdapterVersion",
        native_runtime.asset_adapter_version.as_deref(),
        diagnostics,
    );
    check_required_runtime_field(
        "storeAdapterVersion",
        native_runtime.store_adapter_version.as_deref(),
        diagnostics,
    );
}

fn check_required_runtime_field(field: &str, actual: Option<&str>, diagnostics: &mut Vec<String>) {
    match actual {
        Some(actual) if !actual.trim().is_empty() => {}
        Some(_) => diagnostics.push(format!(
            "Native target bundle manifest nativeRuntime.{field} must not be empty."
        )),
        None => diagnostics.push(format!(
            "Native target bundle manifest must include nativeRuntime.{field}."
        )),
    }
}
