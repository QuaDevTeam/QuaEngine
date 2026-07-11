use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet};

use quajs_native_runtime::{
    NativeAssetReadRequest, NativeHostApi, NativeHostApiError, NativeHostApiResult, NativeHostInfo,
    NativeHostInfoBuilder, NativeMountedBundleInfo, NativePlatform, NativeProfile,
    NativeRendererIntent, NativeSignatureVerifyRequest,
};
use quajs_wgpu_renderer::fonts::{
    FontBackendCommand, FontBackendCommandKind, FontBackendCommandPlan, FontBackendFaceState,
};
use quajs_wgpu_renderer::resources::ResourceId;

use super::{sync_font_assets_from_host, NativeFontAssetHostSyncFailureKind};

#[test]
fn loads_unscoped_font_asset_when_face_has_no_package_candidates() {
    let face = face("inter", "Inter", "fonts/inter.woff2", []);
    let host = RecordingFontHost::new().with_asset(None, "fonts/inter.woff2", [1, 2, 3]);
    let plan = plan([command(
        FontBackendCommandKind::LoadFace,
        Some(face.clone()),
    )]);

    let report = sync_font_assets_from_host(&host, &plan);

    assert!(report.is_ok());
    assert_eq!(report.command_count, 1);
    assert_eq!(report.load_face_command_count, 1);
    assert_eq!(report.loaded_count, 1);
    assert_eq!(host.reads.borrow().len(), 1);
    assert_eq!(host.reads.borrow()[0].bundle_name, None);
    assert_eq!(
        host.reads.borrow()[0].asset_id.as_deref(),
        Some(face.face_resource_id.as_str())
    );
    let loaded = &report.loaded_assets[0];
    assert_eq!(loaded.backend_load.face_id, "inter");
    assert_eq!(loaded.backend_load.bytes, vec![1, 2, 3]);
    assert_eq!(loaded.bundle_name, None);
    assert_eq!(loaded.backend_load.package_id, None);
    assert_eq!(loaded.metadata.owner_package_id, None);
    assert!(loaded.metadata.required_package_ids.is_empty());
    assert_eq!(
        report.backend_asset_loads(),
        vec![loaded.backend_load.clone()]
    );
}

#[test]
fn loads_font_from_quack_qpk_asset_path_after_logical_name_misses() {
    let face = face("inter", "Inter", "fonts/inter.woff2", []);
    let host = RecordingFontHost::new().with_asset(None, "assets/fonts/inter.woff2", [1, 2, 3]);
    let plan = plan([command(FontBackendCommandKind::LoadFace, Some(face))]);

    let report = sync_font_assets_from_host(&host, &plan);

    assert!(report.is_ok());
    assert_eq!(report.loaded_count, 1);
    assert_eq!(host.reads.borrow().len(), 2);
    assert_eq!(host.reads.borrow()[0].url, "fonts/inter.woff2");
    assert_eq!(host.reads.borrow()[1].url, "assets/fonts/inter.woff2");
}

#[test]
fn resolves_font_assets_by_runtime_logical_or_bundle_name() {
    let cases = [
        bundle("runtime-bundle", None, Some("runtime.fonts")),
        bundle("logical-bundle", Some("runtime.fonts"), None),
        bundle("runtime.fonts", None, None),
    ];

    for mounted_bundle in cases {
        let face = face("inter", "Inter", "fonts/inter.woff2", ["runtime.fonts"]);
        let host = RecordingFontHost::new()
            .with_bundle(mounted_bundle.clone())
            .with_asset(Some(&mounted_bundle.name), "fonts/inter.woff2", [7, 8]);
        let plan = plan([command(FontBackendCommandKind::LoadFace, Some(face))]);

        let report = sync_font_assets_from_host(&host, &plan);

        assert!(report.is_ok(), "bundle should resolve: {mounted_bundle:?}");
        assert_eq!(report.loaded_count, 1);
        assert_eq!(
            host.reads.borrow()[0].bundle_name.as_deref(),
            Some(mounted_bundle.name.as_str())
        );
        let loaded = &report.loaded_assets[0];
        assert_eq!(
            loaded.bundle_name.as_deref(),
            Some(mounted_bundle.name.as_str())
        );
        assert_eq!(
            loaded.backend_load.package_id.as_deref(),
            Some("runtime.fonts")
        );
        assert_eq!(
            loaded.metadata.owner_package_id.as_deref(),
            Some("runtime.fonts")
        );
    }
}

#[test]
fn rejects_package_scoped_font_without_matching_bundle() {
    let face = face("inter", "Inter", "fonts/inter.woff2", ["runtime.fonts"]);
    let host = RecordingFontHost::new()
        .with_bundle(bundle("base-bundle", None, Some("base")))
        .with_asset(None, "fonts/inter.woff2", [4, 3, 2, 1]);
    let plan = plan([command(FontBackendCommandKind::LoadFace, Some(face))]);

    let report = sync_font_assets_from_host(&host, &plan);

    assert!(!report.is_ok());
    assert_eq!(report.missing_asset_count, 1);
    assert!(host.reads.borrow().is_empty());
    let failure = &report.failures[0];
    assert_eq!(
        failure.kind,
        NativeFontAssetHostSyncFailureKind::MissingAsset
    );
    assert_eq!(failure.package_id.as_deref(), Some("runtime.fonts"));
    assert!(failure
        .message
        .contains("no mounted bundle matched package candidate"));
}

#[test]
fn rejects_invalid_font_asset_before_host_reads() {
    let face = face("bad", "Bad", "../native.dylib", ["runtime.fonts"]);
    let host =
        RecordingFontHost::new().with_bundle(bundle("runtime-bundle", None, Some("runtime.fonts")));
    let plan = plan([command(FontBackendCommandKind::LoadFace, Some(face))]);

    let report = sync_font_assets_from_host(&host, &plan);

    assert!(!report.is_ok());
    assert_eq!(report.invalid_command_count, 1);
    assert!(host.reads.borrow().is_empty());
    assert!(report.failures[0]
        .message
        .contains("must not contain traversal segments"));
}

#[derive(Default)]
struct RecordingFontHost {
    assets: BTreeMap<(Option<String>, String), Vec<u8>>,
    bundles: Vec<NativeMountedBundleInfo>,
    reads: RefCell<Vec<NativeAssetReadRequest>>,
}

impl RecordingFontHost {
    fn new() -> Self {
        Self::default()
    }

    fn with_bundle(mut self, bundle: NativeMountedBundleInfo) -> Self {
        self.bundles.push(bundle);
        self
    }

    fn with_asset<const N: usize>(
        mut self,
        bundle_name: Option<&str>,
        url: &str,
        bytes: [u8; N],
    ) -> Self {
        self.assets.insert(
            (bundle_name.map(ToString::to_string), url.to_string()),
            bytes.into(),
        );
        self
    }
}

impl NativeHostApi for RecordingFontHost {
    fn host_info(&self) -> NativeHostInfo {
        NativeHostInfoBuilder::new("Fixture", "dev.quajs.fixture")
            .app_version("1.0.0")
            .build_number("100")
            .profile(NativeProfile::Debug)
            .platform(NativePlatform::MacOs)
            .arch("arm64")
            .build()
    }

    fn read_asset_bytes(&self, request: &NativeAssetReadRequest) -> NativeHostApiResult<Vec<u8>> {
        self.reads.borrow_mut().push(request.clone());
        self.assets
            .get(&(request.bundle_name.clone(), request.url.clone()))
            .cloned()
            .ok_or_else(|| NativeHostApiError::AssetNotFound(request.url.clone()))
    }

    fn list_mounted_bundles(&self) -> NativeHostApiResult<Vec<NativeMountedBundleInfo>> {
        Ok(self.bundles.clone())
    }

    fn read_storage(&self, _key: &str) -> NativeHostApiResult<Option<Vec<u8>>> {
        Ok(None)
    }

    fn write_storage(&mut self, _key: &str, _value: Vec<u8>) -> NativeHostApiResult<()> {
        Ok(())
    }

    fn delete_storage(&mut self, _key: &str) -> NativeHostApiResult<()> {
        Ok(())
    }

    fn list_storage_keys(&self, _prefix: &str) -> NativeHostApiResult<Vec<String>> {
        Ok(Vec::new())
    }

    fn hash_bytes(&self, _bytes: &[u8], _algorithm: &str) -> NativeHostApiResult<String> {
        Err(NativeHostApiError::UnsupportedOperation(
            "hash not implemented".to_string(),
        ))
    }

    fn verify_signature(
        &self,
        _request: &NativeSignatureVerifyRequest,
    ) -> NativeHostApiResult<bool> {
        Err(NativeHostApiError::UnsupportedOperation(
            "signature verification not implemented".to_string(),
        ))
    }

    fn emit_renderer_intent(&mut self, _event: NativeRendererIntent) -> NativeHostApiResult<()> {
        Ok(())
    }

    fn drain_renderer_intents(&mut self) -> NativeHostApiResult<Vec<NativeRendererIntent>> {
        Ok(Vec::new())
    }
}

fn face<const N: usize>(
    id: &str,
    family: &str,
    asset_name: &str,
    packages: [&str; N],
) -> FontBackendFaceState {
    FontBackendFaceState {
        id: id.to_string(),
        order: 0,
        family: family.to_string(),
        asset_type: "fonts".to_string(),
        asset_name: asset_name.to_string(),
        style: None,
        weight: None,
        stretch: None,
        display: None,
        unicode_range: None,
        package_candidates: set(packages),
        face_resource_id: ResourceId::from(format!("font:face:fonts:{asset_name}")),
    }
}

fn command(kind: FontBackendCommandKind, face: Option<FontBackendFaceState>) -> FontBackendCommand {
    FontBackendCommand {
        face_id: face
            .as_ref()
            .map(|face| face.id.clone())
            .unwrap_or_else(|| "font-face".to_string()),
        kind,
        face,
    }
}

fn plan<const N: usize>(commands: [FontBackendCommand; N]) -> FontBackendCommandPlan {
    FontBackendCommandPlan {
        commands: commands.into(),
        next_faces: Default::default(),
        skipped_asset_resource_ids: Vec::new(),
    }
}

fn bundle(
    name: &str,
    logical_name: Option<&str>,
    runtime_package_id: Option<&str>,
) -> NativeMountedBundleInfo {
    NativeMountedBundleInfo {
        name: name.to_string(),
        logical_name: logical_name.map(ToString::to_string),
        version: Some(1),
        hash: None,
        runtime_package_id: runtime_package_id.map(ToString::to_string),
    }
}

fn set<const N: usize>(items: [&str; N]) -> BTreeSet<String> {
    items.into_iter().map(ToString::to_string).collect()
}
