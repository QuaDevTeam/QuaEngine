use super::super::*;

#[test]
fn rejects_foreign_target_core_adapters_and_renderer_entries() {
    let mut manifest = native_manifest();
    manifest.dependencies.extend([
        TargetBundleReference::Specifier("@quajs/renderer-web/plugins/ui".to_string()),
        TargetBundleReference::Specifier("@quajs/cocos-host/runtime".to_string()),
    ]);
    manifest
        .renderer_entries
        .push(TargetBundleReference::Object(TargetBundleReferenceObject {
            specifier: Some("@quajs/renderer-vue/plugins/ui".to_string()),
            package_name: None,
            target: Some("web".to_string()),
            plugin_id: Some("@quajs/plugin-ui".to_string()),
        }));

    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("foreign target manifest is rejected");

    assert!(error
        .to_string()
        .contains("mixes target bootstrap core adapters for web, cocos, native"));
    assert!(error
        .to_string()
        .contains("Renderer entry \"@quajs/renderer-vue\" declares target \"web\""));
}

#[test]
fn checks_both_specifier_and_package_name_for_selected_core_adapters() {
    let mut manifest = native_manifest();
    manifest.selected_core_adapters = vec![
        TargetBundleReference::Specifier("@quajs/engine-native".to_string()),
        TargetBundleReference::Specifier("@quajs/assets-native".to_string()),
        TargetBundleReference::Specifier("@quajs/store-native".to_string()),
        TargetBundleReference::Object(TargetBundleReferenceObject {
            specifier: Some("@quajs/native-contracts/bootstrap".to_string()),
            package_name: Some("@quajs/renderer-web/plugins/ui".to_string()),
            target: None,
            plugin_id: None,
        }),
    ];

    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("masked selected core adapter is rejected");

    assert!(error.diagnostics().iter().any(|diagnostic| {
        diagnostic.contains(
            "Native target bundle selected unexpected core adapter \"@quajs/renderer-web\"",
        )
    }));
    assert!(error.diagnostics().iter().any(|diagnostic| {
        diagnostic.contains(
            "Native target bundle must not include foreign target core adapter \"@quajs/renderer-web\"",
        )
    }));
}
