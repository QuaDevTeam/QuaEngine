use std::cell::Cell;

use quajs_native_runtime::{quickjs_runtime_version, NativeHostInfoBuilder};

use crate::target_bundle::tests::native_manifest;

use super::*;

#[test]
fn compile_time_config_uses_safe_defaults() {
    let config = compile_time_native_app_config();

    assert!(!config.name.is_empty());
    assert!(!config.bundle_id.is_empty());
    assert!(!config.version.is_empty());
    assert!(!config.build_number.is_empty());
}

#[test]
fn host_info_uses_signed_app_config_and_rust_renderer_capabilities() {
    let host_info = create_host_info(NativeAppConfig::new(
        "Fixture",
        "dev.quajs.fixture",
        "1.2.3",
        "456",
    ));

    assert_eq!(host_info.app.name, "Fixture");
    assert_eq!(host_info.app.bundle_id, "dev.quajs.fixture");
    assert_eq!(host_info.app.version, "1.2.3");
    assert_eq!(host_info.app.build_number, "456");
    assert_eq!(host_info.renderer.package_name, "@quajs/native-renderer");
    assert!(host_info
        .renderer
        .capability_manifest_hash
        .starts_with("sha256:"));
    assert_eq!(host_info.runtime.quickjs_version, quickjs_runtime_version());
    assert_ne!(host_info.runtime.quickjs_version, "pending");
    assert_eq!(
        host_info.runtime.native_runtime_version,
        env!("CARGO_PKG_VERSION")
    );
    assert_eq!(
        host_info.runtime.asset_adapter_version,
        env!("CARGO_PKG_VERSION")
    );
    assert_eq!(
        host_info.runtime.store_adapter_version,
        env!("CARGO_PKG_VERSION")
    );
    assert!(host_info.has_capability("native-wgpu.ui.surface@1"));
    assert!(host_info.has_capability("native-wgpu.input.pointer@1"));
    assert_eq!(
        host_info.has_capability("native-wgpu.audio@1"),
        cfg!(all(
            feature = "native-window",
            feature = "native-audio-rodio"
        ))
    );
}

#[test]
fn startup_capabilities_declare_audio_only_when_rodio_backend_is_enabled() {
    let capabilities = native_startup_renderer_capabilities();
    let audio = capabilities
        .iter()
        .find(|capability| capability.id == "native-wgpu.audio@1");

    assert_eq!(
        audio.is_some(),
        cfg!(all(
            feature = "native-window",
            feature = "native-audio-rodio"
        ))
    );
    if let Some(audio) = audio {
        assert_eq!(audio.fallback, "reject-package");
        assert_eq!(audio.projection_keys, vec!["view.plugins.audio"]);
        assert_eq!(audio.asset_kinds, vec!["audio"]);
        assert!(audio.intent_events.is_empty());
    }
}

#[test]
fn accepts_native_target_bundle_manifest_before_building_host_info() {
    let manifest = native_manifest();
    let created = Cell::new(false);
    let host_info =
        create_native_startup_host_info_with(fixture_app_config(), Some(&manifest), |config| {
            created.set(true);
            create_host_info(config)
        })
        .expect("native manifest validates");

    assert!(created.get());
    assert_eq!(host_info.app.bundle_id, "dev.quajs.fixture");
}

#[test]
fn rejects_renderer_manifest_drift_after_building_host_info() {
    let mut manifest = native_manifest();
    let native_renderer = manifest
        .native_renderer
        .as_mut()
        .expect("native renderer metadata exists");
    native_renderer.version = Some("0.0.0".to_string());
    native_renderer.capability_manifest_hash = Some("sha256:stale-capabilities".to_string());
    native_renderer
        .capability_ids
        .push("native-wgpu.spatial-audio@1".to_string());
    let created = Cell::new(false);
    let error =
        create_native_startup_host_info_with(fixture_app_config(), Some(&manifest), |config| {
            created.set(true);
            create_host_info(config)
        })
        .expect_err("renderer metadata drift is rejected");

    assert!(created.get());
    assert!(error
        .to_string()
        .contains("nativeRenderer.version \"0.0.0\" does not match host renderer version"));
    assert!(error
        .to_string()
        .contains("nativeRenderer.capabilityManifestHash \"sha256:stale-capabilities\""));
    assert!(error
        .to_string()
        .contains("nativeRenderer.capabilityIds includes \"native-wgpu.spatial-audio@1\""));
}

#[test]
fn rejects_renderer_backend_version_drift_after_building_host_info() {
    let mut manifest = native_manifest();
    manifest
        .native_renderer
        .as_mut()
        .expect("native renderer metadata exists")
        .backend_version = Some("wgpu-manifest".to_string());
    let created = Cell::new(false);
    let error =
        create_native_startup_host_info_with(fixture_app_config(), Some(&manifest), |config| {
            created.set(true);
            NativeHostInfoBuilder::new(config.name, config.bundle_id)
                .app_version(config.version)
                .build_number(config.build_number)
                .renderer_version(env!("CARGO_PKG_VERSION"))
                .backend_version(Some("wgpu-host"))
                .quickjs_version(quickjs_runtime_version())
                .native_runtime_version(env!("CARGO_PKG_VERSION"))
                .asset_adapter_version(env!("CARGO_PKG_VERSION"))
                .store_adapter_version(env!("CARGO_PKG_VERSION"))
                .capabilities(native_startup_renderer_capabilities())
                .build()
        })
        .expect_err("renderer backend version drift is rejected");

    assert!(created.get());
    assert!(error.to_string().contains(
        "nativeRenderer.backendVersion \"wgpu-manifest\" does not match host renderer backendVersion \"wgpu-host\""
    ));
}

#[test]
fn rejects_runtime_manifest_drift_after_building_host_info() {
    let mut manifest = native_manifest();
    let native_runtime = manifest
        .native_runtime
        .as_mut()
        .expect("native runtime metadata exists");
    native_runtime.quickjs_version = Some("quickjs-manifest".to_string());
    native_runtime.asset_adapter_version = Some("assets-manifest".to_string());
    native_runtime.store_adapter_version = Some("store-manifest".to_string());
    let created = Cell::new(false);
    let error =
        create_native_startup_host_info_with(fixture_app_config(), Some(&manifest), |config| {
            created.set(true);
            NativeHostInfoBuilder::new(config.name, config.bundle_id)
                .app_version(config.version)
                .build_number(config.build_number)
                .renderer_version(env!("CARGO_PKG_VERSION"))
                .quickjs_version("quickjs-host")
                .native_runtime_version(env!("CARGO_PKG_VERSION"))
                .asset_adapter_version("assets-host")
                .store_adapter_version("store-host")
                .capabilities(native_startup_renderer_capabilities())
                .build()
        })
        .expect_err("runtime metadata drift is rejected");

    assert!(created.get());
    assert!(error.to_string().contains(
        "nativeRuntime.quickjsVersion \"quickjs-manifest\" does not match host runtime value \"quickjs-host\""
    ));
    assert!(error.to_string().contains(
        "nativeRuntime.assetAdapterVersion \"assets-manifest\" does not match host runtime value \"assets-host\""
    ));
    assert!(error.to_string().contains(
        "nativeRuntime.storeAdapterVersion \"store-manifest\" does not match host runtime value \"store-host\""
    ));
}

#[test]
fn rejects_foreign_target_bundle_manifest_before_building_host_info() {
    let mut manifest = native_manifest();
    manifest.dependencies.extend([
        crate::target_bundle::TargetBundleReference::Specifier(
            "@quajs/renderer-web/plugins/ui".to_string(),
        ),
        crate::target_bundle::TargetBundleReference::Specifier(
            "@quajs/cocos-host/runtime".to_string(),
        ),
    ]);
    let created = Cell::new(false);
    let error =
        create_native_startup_host_info_with(fixture_app_config(), Some(&manifest), |config| {
            created.set(true);
            create_host_info(config)
        })
        .expect_err("foreign target manifest is rejected");

    assert!(!created.get());
    assert!(error
        .to_string()
        .contains("mixes target bootstrap core adapters for web, cocos, native"));
}

#[test]
fn rejects_manifest_app_identity_mismatch_before_building_host_info() {
    let manifest = native_manifest();
    let created = Cell::new(false);
    let error = create_native_startup_host_info_with(
        NativeAppConfig::new("Fixture", "dev.quajs.other", "1.0.0", "100"),
        Some(&manifest),
        |config| {
            created.set(true);
            create_host_info(config)
        },
    )
    .expect_err("app identity mismatch is rejected");

    assert!(!created.get());
    assert!(error
        .to_string()
        .contains("app.bundleId expected \"dev.quajs.other\""));
}

fn fixture_app_config() -> NativeAppConfig {
    NativeAppConfig::new("Fixture", "dev.quajs.fixture", "1.0.0", "100")
}
