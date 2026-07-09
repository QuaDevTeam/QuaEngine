use super::*;

pub(crate) fn unique_manifest_path(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "quajs-native-target-bundle-{label}-{}-{}.json",
        std::process::id(),
        std::thread::current().name().unwrap_or("test")
    ))
}

pub(crate) fn native_manifest_json() -> serde_json::Value {
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
            "capabilityIds": native_capability_ids(),
            "capabilityManifestHash": native_capability_manifest_hash()
        },
        "nativeRuntime": {
            "quickjsVersion": quajs_native_runtime::quickjs_runtime_version(),
            "nativeRuntimeVersion": env!("CARGO_PKG_VERSION"),
            "assetAdapterVersion": env!("CARGO_PKG_VERSION"),
            "storeAdapterVersion": env!("CARGO_PKG_VERSION")
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
            backend_version: None,
            capability_ids: native_capability_ids(),
            capability_manifest_hash: Some(native_capability_manifest_hash()),
        }),
        native_runtime: Some(TargetBundleNativeRuntimeInfo {
            quickjs_version: Some(quajs_native_runtime::quickjs_runtime_version().to_string()),
            native_runtime_version: Some(env!("CARGO_PKG_VERSION").to_string()),
            asset_adapter_version: Some(env!("CARGO_PKG_VERSION").to_string()),
            store_adapter_version: Some(env!("CARGO_PKG_VERSION").to_string()),
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

pub(crate) fn native_expectation() -> NativeStartupManifestExpectation {
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

fn native_capability_ids() -> Vec<String> {
    crate::startup::native_startup_renderer_capabilities()
        .into_iter()
        .map(|capability| capability.id)
        .collect()
}

fn native_capability_manifest_hash() -> String {
    quajs_native_runtime::capability_manifest_hash(
        &crate::startup::native_startup_renderer_capabilities(),
    )
}
