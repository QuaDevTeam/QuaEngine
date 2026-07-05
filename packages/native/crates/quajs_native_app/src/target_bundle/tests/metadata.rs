use super::*;

#[test]
fn validates_manifest_app_identity_against_startup_expectation() {
    let validation =
        validate_native_target_bundle_manifest(&native_manifest(), Some(&native_expectation()))
            .expect("manifest identity matches startup expectation");

    assert_eq!(validation.selected_targets, vec!["native"]);
}

#[test]
fn rejects_manifest_app_identity_mismatch() {
    let mut expectation = native_expectation();
    expectation.version = "2.0.0".to_string();

    let error = validate_native_target_bundle_manifest(&native_manifest(), Some(&expectation))
        .expect_err("manifest identity mismatch is rejected");

    assert!(error.to_string().contains("app.version expected \"2.0.0\""));
}

#[test]
fn rejects_invalid_native_artifact_profile_without_startup_expectation() {
    let mut manifest = native_manifest();
    manifest.profile = "staging".to_string();

    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("invalid native artifact profile is rejected");

    assert!(error
        .to_string()
        .contains("profile must be \"debug\" or \"release\""));
}

#[test]
fn rejects_missing_or_foreign_target_core_resolver() {
    let mut missing_resolver = native_manifest();
    missing_resolver.target_core_resolver = None;
    let error = validate_native_target_bundle_manifest(&missing_resolver, None)
        .expect_err("missing native resolver is rejected");
    assert!(error
        .to_string()
        .contains("must include targetCoreResolver \"native-core-resolver\""));

    let mut foreign_resolver = native_manifest();
    foreign_resolver.target_core_resolver = Some("web-core-resolver".to_string());
    let error = validate_native_target_bundle_manifest(&foreign_resolver, None)
        .expect_err("foreign resolver is rejected");
    assert!(error
        .to_string()
        .contains("expected targetCoreResolver \"native-core-resolver\""));
}

#[test]
fn rejects_missing_empty_or_invalid_native_artifact_platform_without_startup_expectation() {
    let mut missing_platform = native_manifest();
    missing_platform.platform = None;
    let missing_error = validate_native_target_bundle_manifest(&missing_platform, None)
        .expect_err("missing native artifact platform is rejected");
    assert!(missing_error
        .to_string()
        .contains("Native target bundle manifest must include platform"));

    let mut empty_platform = native_manifest();
    empty_platform.platform = Some("  ".to_string());
    let empty_error = validate_native_target_bundle_manifest(&empty_platform, None)
        .expect_err("empty native artifact platform is rejected");
    assert!(empty_error
        .to_string()
        .contains("Native target bundle manifest platform must not be empty"));

    let mut invalid_platform = native_manifest();
    invalid_platform.platform = Some("ios".to_string());
    let invalid_error = validate_native_target_bundle_manifest(&invalid_platform, None)
        .expect_err("invalid native artifact platform is rejected");
    assert!(invalid_error
        .to_string()
        .contains("platform must be \"macos\", \"windows\", or \"linux\""));
}

#[test]
fn rejects_missing_or_empty_app_metadata_without_startup_expectation() {
    let mut missing_app = native_manifest();
    missing_app.app = None;
    let missing_app_error = validate_native_target_bundle_manifest(&missing_app, None)
        .expect_err("missing app metadata is rejected");
    assert!(missing_app_error
        .to_string()
        .contains("Native target bundle manifest must include app metadata"));

    let mut missing_bundle_id = native_manifest();
    missing_bundle_id.app.as_mut().unwrap().bundle_id = None;
    let missing_bundle_id_error = validate_native_target_bundle_manifest(&missing_bundle_id, None)
        .expect_err("missing bundle id metadata is rejected");
    assert!(missing_bundle_id_error
        .to_string()
        .contains("Native target bundle manifest must include app.bundleId"));

    let mut empty_version = native_manifest();
    empty_version.app.as_mut().unwrap().version = Some("  ".to_string());
    let empty_version_error = validate_native_target_bundle_manifest(&empty_version, None)
        .expect_err("empty version metadata is rejected");
    assert!(empty_version_error
        .to_string()
        .contains("Native target bundle manifest app.version must not be empty"));

    let mut missing_build_number = native_manifest();
    missing_build_number.app.as_mut().unwrap().build_number = None;
    let missing_build_number_error =
        validate_native_target_bundle_manifest(&missing_build_number, None)
            .expect_err("missing build number metadata is rejected");
    assert!(missing_build_number_error
        .to_string()
        .contains("Native target bundle manifest must include app.buildNumber"));

    let mut missing_icon = native_manifest();
    missing_icon.app.as_mut().unwrap().icon = None;
    let error = validate_native_target_bundle_manifest(&missing_icon, None)
        .expect_err("missing app icon is rejected");
    assert!(error
        .to_string()
        .contains("Native target bundle manifest must include app.icon"));

    let mut empty_icon = native_manifest();
    empty_icon.app.as_mut().unwrap().icon = Some("  ".to_string());
    let error = validate_native_target_bundle_manifest(&empty_icon, None)
        .expect_err("empty app icon is rejected");
    assert!(error
        .to_string()
        .contains("Native target bundle manifest app.icon must not be empty"));
}

#[test]
fn rejects_native_manifest_without_renderer_metadata() {
    let mut manifest = native_manifest();
    manifest.native_renderer = None;

    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("missing native renderer metadata is rejected");

    assert!(error
        .to_string()
        .contains("must include nativeRenderer metadata"));
}

#[test]
fn rejects_native_manifest_without_runtime_metadata() {
    let mut manifest = native_manifest();
    manifest.native_runtime = None;

    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("missing native runtime metadata is rejected");

    assert!(error
        .to_string()
        .contains("must include nativeRuntime metadata"));
}

#[test]
fn rejects_incomplete_native_renderer_metadata() {
    let mut manifest = native_manifest();
    manifest.native_renderer = Some(TargetBundleNativeRendererInfo {
        package_name: Some("@quajs/renderer-web".to_string()),
        version: None,
        backend: Some("canvas".to_string()),
        backend_version: None,
        capability_ids: vec![],
        capability_manifest_hash: None,
    });

    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("invalid native renderer metadata is rejected");

    assert!(error
        .diagnostics()
        .iter()
        .any(|diagnostic| diagnostic.contains("nativeRenderer.packageName expected")));
    assert!(error
        .diagnostics()
        .iter()
        .any(|diagnostic| diagnostic.contains("nativeRenderer.backend expected")));
    assert!(error
        .diagnostics()
        .iter()
        .any(|diagnostic| diagnostic.contains("nativeRenderer.version")));
    assert!(error
        .diagnostics()
        .iter()
        .any(|diagnostic| diagnostic.contains("nativeRenderer.capabilityManifestHash")));
    assert!(error
        .diagnostics()
        .iter()
        .any(|diagnostic| diagnostic.contains("nativeRenderer.capabilityIds")));
}

#[test]
fn rejects_incomplete_native_runtime_metadata() {
    let mut manifest = native_manifest();
    manifest.native_runtime = Some(TargetBundleNativeRuntimeInfo {
        quickjs_version: Some("  ".to_string()),
        native_runtime_version: None,
        asset_adapter_version: Some("".to_string()),
        store_adapter_version: None,
    });

    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("invalid native runtime metadata is rejected");

    assert!(error
        .diagnostics()
        .iter()
        .any(|diagnostic| diagnostic.contains("nativeRuntime.quickjsVersion must not be empty")));
    assert!(error
        .diagnostics()
        .iter()
        .any(|diagnostic| diagnostic.contains("must include nativeRuntime.nativeRuntimeVersion")));
    assert!(error.diagnostics().iter().any(
        |diagnostic| diagnostic.contains("nativeRuntime.assetAdapterVersion must not be empty")
    ));
    assert!(error
        .diagnostics()
        .iter()
        .any(|diagnostic| diagnostic.contains("must include nativeRuntime.storeAdapterVersion")));
}
