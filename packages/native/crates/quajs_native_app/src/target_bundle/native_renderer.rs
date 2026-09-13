use super::NativeTargetBundleManifest;

pub(super) fn check_native_renderer_info(
    manifest: &NativeTargetBundleManifest,
    diagnostics: &mut Vec<String>,
) {
    let Some(native_renderer) = manifest.native_renderer.as_ref() else {
        diagnostics.push(
            "Native target bundle manifest must include nativeRenderer metadata.".to_string(),
        );
        return;
    };

    match native_renderer.package_name.as_deref() {
        Some("@quajs/native-renderer") => {}
        Some(package_name) => diagnostics.push(format!(
            "Native target bundle manifest nativeRenderer.packageName expected \"@quajs/native-renderer\", but found \"{}\".",
            package_name
        )),
        None => diagnostics.push(
            "Native target bundle manifest must include nativeRenderer.packageName \"@quajs/native-renderer\"."
                .to_string(),
        ),
    }

    match native_renderer.backend.as_deref() {
        Some("wgpu") => {}
        Some(backend) => diagnostics.push(format!(
            "Native target bundle manifest nativeRenderer.backend expected \"wgpu\", but found \"{}\".",
            backend
        )),
        None => diagnostics.push(
            "Native target bundle manifest must include nativeRenderer.backend \"wgpu\"."
                .to_string(),
        ),
    }

    check_required_renderer_field("version", native_renderer.version.as_deref(), diagnostics);
    check_required_renderer_field(
        "capabilityManifestHash",
        native_renderer.capability_manifest_hash.as_deref(),
        diagnostics,
    );

    if native_renderer.capability_ids.is_empty() {
        diagnostics.push(
            "Native target bundle manifest must include nativeRenderer.capabilityIds.".to_string(),
        );
    }

    for (index, capability_id) in native_renderer.capability_ids.iter().enumerate() {
        if capability_id.trim().is_empty() {
            diagnostics.push(format!(
                "Native target bundle manifest nativeRenderer.capabilityIds[{index}] must not be empty."
            ));
        }
    }
}

fn check_required_renderer_field(field: &str, actual: Option<&str>, diagnostics: &mut Vec<String>) {
    match actual {
        Some(actual) if !actual.trim().is_empty() => {}
        Some(_) => diagnostics.push(format!(
            "Native target bundle manifest nativeRenderer.{field} must not be empty."
        )),
        None => diagnostics.push(format!(
            "Native target bundle manifest must include nativeRenderer.{field}."
        )),
    }
}
