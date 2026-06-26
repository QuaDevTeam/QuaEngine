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

#[test]
fn rejects_target_core_adapters_in_non_post_bundle_project_graphs() {
    let mut manifest = native_manifest();
    manifest
        .project_graphs
        .push(TargetBundleProjectGraphRecord {
            id: "native.startup-shell.declares-core".to_string(),
            kind: "startup-shell".to_string(),
            references: vec![
                TargetBundleReference::Specifier("@quajs/engine".to_string()),
                TargetBundleReference::Specifier("@quajs/engine-native/bootstrap".to_string()),
            ],
        });

    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("startup shell target core declarations are rejected");

    assert!(error.diagnostics().iter().any(|diagnostic| diagnostic.contains(
        "Project graph \"native.startup-shell.declares-core\" (startup-shell) for native target must not declare target core adapter \"@quajs/engine-native\""
    )));
}

#[test]
fn rejects_inactive_target_core_adapters_in_post_bundle_project_graphs() {
    let mut manifest = native_manifest();
    manifest
        .project_graphs
        .push(TargetBundleProjectGraphRecord {
            id: "native.release.macos.post-bundle.bad".to_string(),
            kind: "post-bundle".to_string(),
            references: vec![
                TargetBundleReference::Specifier("@quajs/engine-native".to_string()),
                TargetBundleReference::Object(TargetBundleReferenceObject {
                    specifier: Some("@quajs/character".to_string()),
                    package_name: Some("@quajs/renderer-web/plugins/ui".to_string()),
                    target: None,
                    plugin_id: None,
                }),
                TargetBundleReference::Specifier(
                    "/repo/app/node_modules/@quajs/renderer-cocos/plugins/dialogue.js?import"
                        .to_string(),
                ),
            ],
        });

    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("post-bundle inactive target core adapters are rejected");

    assert!(error.diagnostics().iter().any(|diagnostic| diagnostic.contains(
        "Post-bundle project graph \"native.release.macos.post-bundle.bad\" for native target must not include inactive target core adapter \"@quajs/renderer-web\""
    )));
    assert!(error.diagnostics().iter().any(|diagnostic| diagnostic.contains(
        "Post-bundle project graph \"native.release.macos.post-bundle.bad\" for native target must not include inactive target core adapter \"@quajs/renderer-cocos\""
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
        "nativeRenderer": {
            "packageName": "@quajs/native-renderer",
            "version": "0.1.0",
            "backend": "wgpu",
            "backendVersion": "wgpu-fixture",
            "capabilityIds": [
                "native-wgpu.stage-layout@1",
                "native-wgpu.ui.surface@1",
                "native-wgpu.input.pointer@1"
            ],
            "capabilityManifestHash": native_capability_manifest_hash()
        },
        "targetCoreResolver": "native-core-resolver",
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
        ],
        "projectGraphs": [
            {
                "id": "native.startup-shell",
                "kind": "startup-shell",
                "references": [
                    "@quajs/engine",
                    "@quajs/character"
                ]
            },
            {
                "id": "native.release.macos.post-bundle",
                "kind": "post-bundle",
                "references": [
                    "@quajs/engine",
                    "@quajs/engine-native",
                    "@quajs/assets-native",
                    "@quajs/store-native",
                    "@quajs/native-contracts",
                    "quajs_wgpu_renderer::capabilities"
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
        native_renderer: Some(TargetBundleNativeRendererInfo {
            package_name: Some("@quajs/native-renderer".to_string()),
            version: Some("0.1.0".to_string()),
            backend: Some("wgpu".to_string()),
            backend_version: Some("wgpu-fixture".to_string()),
            capability_ids: vec![
                "native-wgpu.stage-layout@1".to_string(),
                "native-wgpu.ui.surface@1".to_string(),
                "native-wgpu.input.pointer@1".to_string(),
            ],
            capability_manifest_hash: Some(native_capability_manifest_hash()),
        }),
        target_core_resolver: Some("native-core-resolver".to_string()),
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
        project_graphs: vec![
            TargetBundleProjectGraphRecord {
                id: "native.startup-shell".to_string(),
                kind: "startup-shell".to_string(),
                references: vec![
                    TargetBundleReference::Specifier("@quajs/engine".to_string()),
                    TargetBundleReference::Specifier("@quajs/character".to_string()),
                ],
            },
            TargetBundleProjectGraphRecord {
                id: "native.release.macos.post-bundle".to_string(),
                kind: "post-bundle".to_string(),
                references: vec![
                    TargetBundleReference::Specifier("@quajs/engine".to_string()),
                    TargetBundleReference::Specifier("@quajs/engine-native".to_string()),
                    TargetBundleReference::Specifier("@quajs/assets-native".to_string()),
                    TargetBundleReference::Specifier("@quajs/store-native".to_string()),
                    TargetBundleReference::Specifier("@quajs/native-contracts".to_string()),
                    TargetBundleReference::Specifier(
                        "quajs_wgpu_renderer::capabilities".to_string(),
                    ),
                ],
            },
        ],
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

fn native_capability_manifest_hash() -> String {
    quajs_native_runtime::capability_manifest_hash(&quajs_wgpu_renderer::native_wgpu_capabilities())
}
