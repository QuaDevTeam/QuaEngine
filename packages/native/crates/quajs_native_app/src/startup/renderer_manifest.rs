use quajs_native_runtime::NativeHostInfo;

use crate::target_bundle::{
    NativeStartupError, NativeTargetBundleManifest, TargetBundleNativeRendererInfo,
};

pub(super) fn validate_manifest_renderer_against_host(
    manifest: &NativeTargetBundleManifest,
    host_info: &NativeHostInfo,
) -> Result<(), NativeStartupError> {
    let Some(renderer) = manifest.native_renderer.as_ref() else {
        return Ok(());
    };

    let mut diagnostics = Vec::new();
    check_manifest_renderer_metadata(renderer, host_info, &mut diagnostics);
    check_manifest_renderer_capabilities(renderer, host_info, &mut diagnostics);

    if diagnostics.is_empty() {
        Ok(())
    } else {
        Err(NativeStartupError::new(diagnostics))
    }
}

fn check_manifest_renderer_metadata(
    renderer: &TargetBundleNativeRendererInfo,
    host_info: &NativeHostInfo,
    diagnostics: &mut Vec<String>,
) {
    if let Some(package_name) = renderer.package_name.as_deref() {
        if package_name != host_info.renderer.package_name {
            diagnostics.push(format!(
                "Native target bundle manifest nativeRenderer.packageName \"{}\" does not match host renderer package \"{}\".",
                package_name, host_info.renderer.package_name
            ));
        }
    }

    if let Some(version) = renderer.version.as_deref() {
        if version != host_info.renderer.version {
            diagnostics.push(format!(
                "Native target bundle manifest nativeRenderer.version \"{}\" does not match host renderer version \"{}\".",
                version, host_info.renderer.version
            ));
        }
    }

    if let Some(backend) = renderer.backend.as_deref() {
        if backend != host_info.renderer.backend {
            diagnostics.push(format!(
                "Native target bundle manifest nativeRenderer.backend \"{}\" does not match host renderer backend \"{}\".",
                backend, host_info.renderer.backend
            ));
        }
    }

    if let Some(backend_version) = renderer.backend_version.as_deref() {
        if Some(backend_version) != host_info.renderer.backend_version.as_deref() {
            diagnostics.push(format!(
                "Native target bundle manifest nativeRenderer.backendVersion \"{}\" does not match host renderer backendVersion \"{}\".",
                backend_version,
                host_info
                    .renderer
                    .backend_version
                    .as_deref()
                    .unwrap_or("<none>")
            ));
        }
    }

    if let Some(capability_manifest_hash) = renderer.capability_manifest_hash.as_deref() {
        if capability_manifest_hash != host_info.renderer.capability_manifest_hash {
            diagnostics.push(format!(
                "Native target bundle manifest nativeRenderer.capabilityManifestHash \"{}\" does not match host renderer capability hash \"{}\".",
                capability_manifest_hash, host_info.renderer.capability_manifest_hash
            ));
        }
    }
}

fn check_manifest_renderer_capabilities(
    renderer: &TargetBundleNativeRendererInfo,
    host_info: &NativeHostInfo,
    diagnostics: &mut Vec<String>,
) {
    let manifest_capability_ids: std::collections::HashSet<&str> = renderer
        .capability_ids
        .iter()
        .map(|capability_id| capability_id.as_str())
        .collect();
    for capability_id in &renderer.capability_ids {
        if !host_info.has_capability(capability_id) {
            diagnostics.push(format!(
                "Native target bundle manifest nativeRenderer.capabilityIds includes \"{}\", but the host renderer does not provide it.",
                capability_id
            ));
        }
    }
    for capability in &host_info.renderer.capabilities {
        if !manifest_capability_ids.contains(capability.id.as_str()) {
            diagnostics.push(format!(
                "Native target bundle manifest nativeRenderer.capabilityIds omits host renderer capability \"{}\".",
                capability.id
            ));
        }
    }
}
