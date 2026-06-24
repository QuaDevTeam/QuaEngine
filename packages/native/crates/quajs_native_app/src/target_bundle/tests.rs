use serde_json::json;

use crate::startup::{platform_manifest_value, profile_manifest_value};

use super::*;

#[test]
fn loads_native_target_bundle_manifest_from_emitted_json_file() {
    let path = unique_manifest_path("valid");
    std::fs::write(&path, native_manifest_json().to_string()).expect("manifest fixture writes");

    let manifest = load_native_target_bundle_manifest(&path).expect("manifest loads from file");
    let validation =
        validate_native_target_bundle_manifest(&manifest, None).expect("native manifest validates");

    assert_eq!(validation.selected_targets, vec!["native"]);
    std::fs::remove_file(path).ok();
}

#[test]
fn reports_parse_errors_for_invalid_manifest_files() {
    let path = unique_manifest_path("invalid");
    std::fs::write(&path, "{not json").expect("invalid manifest fixture writes");

    let error = load_native_target_bundle_manifest(&path).expect_err("invalid manifest fails");

    assert!(error
        .to_string()
        .contains("Failed to parse native target bundle manifest"));
    std::fs::remove_file(path).ok();
}

#[test]
fn accepts_native_target_bundle_manifest() {
    let validation = validate_native_target_bundle_manifest(&native_manifest(), None)
        .expect("native manifest validates");

    assert_eq!(validation.selected_targets, vec!["native"]);
    assert!(validation
        .package_names
        .contains(&"quajs_wgpu_renderer".to_string()));
}

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
fn deserializes_target_bundle_manifest_contract_shape() {
    let manifest: NativeTargetBundleManifest =
        serde_json::from_value(native_manifest_json()).expect("manifest contract shape parses");

    let validation = validate_native_target_bundle_manifest(&manifest, None)
        .expect("native manifest contract shape validates");

    assert_eq!(validation.selected_targets, vec!["native"]);
}

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

fn unique_manifest_path(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "quajs-native-target-bundle-{label}-{}-{}.json",
        std::process::id(),
        std::thread::current().name().unwrap_or("test")
    ))
}

fn native_manifest_json() -> serde_json::Value {
    json!({
        "target": "native",
        "profile": current_profile_value(),
        "platform": current_platform_value(),
        "app": {
            "bundleId": "dev.quajs.fixture",
            "version": "1.0.0",
            "buildNumber": "100",
            "icon": "AppIcon.icns"
        },
        "selectedCorePluginFamily": "native-core",
        "selectedCoreAdapters": [
            "@quajs/engine-native/native-host",
            { "specifier": "@quajs/assets-native", "runtime": true },
            { "packageName": "@quajs/store-native" },
            "@quajs/native-contracts/bootstrap"
        ],
        "dependencies": [
            "@quajs/engine",
            "@quajs/pipeline",
            "quajs_wgpu_renderer::capabilities"
        ],
        "rendererEntries": [
            { "specifier": "@quajs/native-renderer/builtin", "target": "native" }
        ],
        "runtimePackages": [
            {
                "id": "runtime.chapter.native-ui",
                "executableDependencies": ["@quajs/character"],
                "rendererEntries": [
                    { "specifier": "@quajs/native-renderer/ui", "target": "native" }
                ]
            }
        ]
    })
}

pub(crate) fn native_manifest() -> NativeTargetBundleManifest {
    NativeTargetBundleManifest {
        target: "native".to_string(),
        profile: current_profile_value().to_string(),
        platform: Some(current_platform_value().to_string()),
        app: Some(TargetBundleAppInfo {
            bundle_id: Some("dev.quajs.fixture".to_string()),
            version: Some("1.0.0".to_string()),
            build_number: Some("100".to_string()),
            icon: Some("AppIcon.icns".to_string()),
        }),
        selected_core_plugin_family: "native-core".to_string(),
        selected_core_adapters: NATIVE_CORE_ADAPTERS
            .iter()
            .map(|specifier| TargetBundleReference::Specifier((*specifier).to_string()))
            .collect(),
        dependencies: vec![
            TargetBundleReference::Specifier("@quajs/engine".to_string()),
            TargetBundleReference::Specifier("@quajs/pipeline".to_string()),
            TargetBundleReference::Specifier("quajs_wgpu_renderer::capabilities".to_string()),
        ],
        renderer_entries: vec![TargetBundleReference::Object(TargetBundleReferenceObject {
            specifier: Some("@quajs/native-renderer/builtin".to_string()),
            package_name: None,
            target: Some("native".to_string()),
            plugin_id: None,
        })],
        runtime_packages: vec![RuntimePackageRecord {
            id: "runtime.chapter.native-ui".to_string(),
            executable_dependencies: vec![TargetBundleReference::Specifier(
                "@quajs/character".to_string(),
            )],
            renderer_entries: vec![TargetBundleReference::Object(TargetBundleReferenceObject {
                specifier: Some("@quajs/native-renderer/ui".to_string()),
                package_name: None,
                target: Some("native".to_string()),
                plugin_id: None,
            })],
        }],
    }
}

fn native_expectation() -> NativeStartupManifestExpectation {
    NativeStartupManifestExpectation {
        bundle_id: "dev.quajs.fixture".to_string(),
        version: "1.0.0".to_string(),
        build_number: "100".to_string(),
        profile: current_profile_value().to_string(),
        platform: current_platform_value().to_string(),
    }
}

fn current_profile_value() -> &'static str {
    profile_manifest_value(quajs_native_runtime::current_profile())
}

fn current_platform_value() -> &'static str {
    platform_manifest_value(quajs_native_runtime::current_platform())
}
