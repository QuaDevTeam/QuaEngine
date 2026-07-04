use super::super::*;

#[test]
fn rejects_runtime_packages_that_depend_on_target_core_adapters() {
    let mut manifest = native_manifest();
    manifest.runtime_packages.push(RuntimePackageRecord {
        id: "runtime.bad.native-core".to_string(),
        executable_dependencies: vec![TargetBundleReference::Specifier(
            "@quajs/engine-native/native-host".to_string(),
        )],
        renderer_entries: vec![TargetBundleReference::Specifier(
            "@quajs/renderer-web/plugins/dialogue".to_string(),
        )],
    });
    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("runtime package core adapters are rejected");

    assert!(error.diagnostics().iter().any(|diagnostic| diagnostic.contains(
        "Runtime package \"runtime.bad.native-core\" must not include target core adapter \"@quajs/engine-native\" through executableDependencies"
    )));
    assert!(error.diagnostics().iter().any(|diagnostic| diagnostic.contains(
        "Runtime package \"runtime.bad.native-core\" must not include target core adapter \"@quajs/renderer-web\" through rendererEntries"
    )));
}

#[test]
fn rejects_renderer_entries_without_explicit_target_metadata() {
    let mut manifest = native_manifest();
    manifest
        .renderer_entries
        .push(TargetBundleReference::Object(TargetBundleReferenceObject {
            specifier: Some("@quajs/plugin-menu/native-renderer".to_string()),
            package_name: None,
            target: None,
            plugin_id: Some("@quajs/plugin-menu".to_string()),
        }));
    manifest.runtime_packages.push(RuntimePackageRecord {
        id: "runtime.bad.missing-renderer-target".to_string(),
        executable_dependencies: vec![TargetBundleReference::Specifier(
            "@quajs/character".to_string(),
        )],
        renderer_entries: vec![TargetBundleReference::Object(TargetBundleReferenceObject {
            specifier: Some("@quajs/plugin-backlog/native-renderer".to_string()),
            package_name: None,
            target: None,
            plugin_id: Some("@quajs/plugin-backlog".to_string()),
        })],
    });

    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("renderer entries without targets are rejected");

    assert!(error.diagnostics().iter().any(|diagnostic| diagnostic
        .contains("Renderer entry \"@quajs/plugin-menu\" must declare target \"native\"")));
    assert!(error.diagnostics().iter().any(|diagnostic| diagnostic.contains(
        "Runtime package \"runtime.bad.missing-renderer-target\" renderer entry \"@quajs/plugin-backlog\" must declare target \"native\""
    )));
}

#[test]
fn checks_both_specifier_and_package_name_for_target_core_leaks() {
    let mut manifest = native_manifest();
    manifest
        .dependencies
        .push(TargetBundleReference::Object(TargetBundleReferenceObject {
            specifier: Some("@quajs/renderer-web/plugins/ui".to_string()),
            package_name: Some("@quajs/character".to_string()),
            target: None,
            plugin_id: None,
        }));
    manifest.runtime_packages.push(RuntimePackageRecord {
        id: "runtime.bad.masked-core".to_string(),
        executable_dependencies: vec![TargetBundleReference::Object(TargetBundleReferenceObject {
            specifier: Some("@quajs/character".to_string()),
            package_name: Some("@quajs/cocos-host/runtime".to_string()),
            target: None,
            plugin_id: None,
        })],
        renderer_entries: vec![TargetBundleReference::Object(TargetBundleReferenceObject {
            specifier: Some("@quajs/plugin-gallery/native-renderer".to_string()),
            package_name: Some("@quajs/engine-native/native-host".to_string()),
            target: Some("native".to_string()),
            plugin_id: Some("@quajs/plugin-gallery".to_string()),
        })],
    });

    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("masked target core references are rejected");

    assert!(error.diagnostics().iter().any(|diagnostic| {
        diagnostic.contains(
        "Native target bundle must not include foreign target core adapter \"@quajs/renderer-web\""
    )
    }));
    assert!(error.diagnostics().iter().any(|diagnostic| diagnostic.contains(
        "Runtime package \"runtime.bad.masked-core\" must not include target core adapter \"@quajs/cocos-host\" through executableDependencies"
    )));
    assert!(error.diagnostics().iter().any(|diagnostic| diagnostic.contains(
        "Runtime package \"runtime.bad.masked-core\" must not include target core adapter \"@quajs/engine-native\" through rendererEntries"
    )));
}

#[test]
fn normalizes_post_bundle_dependency_paths_for_target_core_leaks() {
    let mut manifest = native_manifest();
    manifest.dependencies.extend([
        TargetBundleReference::Specifier(
            "/repo/app/node_modules/@quajs/renderer-web/plugins/ui.js?import#hash".to_string(),
        ),
        TargetBundleReference::Specifier(
            "C:\\repo\\app\\node_modules\\@quajs\\cocos-host\\runtime.js".to_string(),
        ),
    ]);
    manifest.runtime_packages.push(RuntimePackageRecord {
        id: "runtime.bad.post-bundle-paths".to_string(),
        executable_dependencies: vec![TargetBundleReference::Specifier(
            "/repo/app/node_modules/.pnpm/@quajs+renderer-cocos@0.1.0/node_modules/@quajs/renderer-cocos/plugins/ui.js".to_string(),
        )],
        renderer_entries: vec![TargetBundleReference::Object(TargetBundleReferenceObject {
            specifier: Some(
                "/repo/app/node_modules/.pnpm/@quajs+engine-native@0.1.0".to_string(),
            ),
            package_name: None,
            target: Some("native".to_string()),
            plugin_id: Some("@quajs/plugin-gallery".to_string()),
        })],
    });

    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("post-bundle dependency paths are normalized and rejected");

    assert!(error.diagnostics().iter().any(|diagnostic| {
        diagnostic.contains(
        "Native target bundle must not include foreign target core adapter \"@quajs/renderer-web\""
    )
    }));
    assert!(error.diagnostics().iter().any(|diagnostic| {
        diagnostic.contains(
        "Native target bundle must not include foreign target core adapter \"@quajs/cocos-host\""
    )
    }));
    assert!(error.diagnostics().iter().any(|diagnostic| diagnostic.contains(
        "Runtime package \"runtime.bad.post-bundle-paths\" must not include target core adapter \"@quajs/renderer-cocos\" through executableDependencies"
    )));
    assert!(error.diagnostics().iter().any(|diagnostic| diagnostic.contains(
        "Runtime package \"runtime.bad.post-bundle-paths\" must not include target core adapter \"@quajs/engine-native\" through rendererEntries"
    )));
}
