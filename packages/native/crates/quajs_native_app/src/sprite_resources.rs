//! QPK metadata is a transient rendering resource. Character identity,
//! expression selection and timeline state always come from the engine frame.
use crate::host_assets::{
    native_asset_read_urls, resolve_native_asset_read_candidates, validate_native_package_id,
    validate_package_relative_asset_name,
};
use quajs_native_runtime::{
    NativeAssetReadRequest, NativeHostApi, NativeHostApiError, NativeMountedBundleInfo,
};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Default)]
pub(crate) struct NativeSpriteResources {
    mounts: Vec<NativeMountedBundleInfo>,
    manifests: BTreeMap<(Vec<String>, String), Option<Value>>,
}

impl NativeSpriteResources {
    pub(crate) fn has_cached_metadata(&self) -> bool {
        !self.manifests.is_empty()
    }

    pub(crate) fn reconcile(
        &mut self,
        host: &impl NativeHostApi,
    ) -> Result<bool, NativeHostApiError> {
        let mounts = host.list_mounted_bundles()?;
        if mounts == self.mounts {
            return Ok(false);
        }
        self.mounts = mounts;
        self.manifests.clear();
        Ok(true)
    }
    pub(crate) fn clear(&mut self) {
        self.manifests.clear();
        self.mounts.clear();
    }

    pub(crate) fn resolve_frame(
        &mut self,
        host: &impl NativeHostApi,
        input: &str,
    ) -> Result<Option<String>, NativeHostApiError> {
        let Ok(mut frame) = serde_json::from_str::<Value>(input) else {
            return Ok(None);
        };
        let Some(characters) = frame
            .pointer_mut("/view/characters")
            .and_then(Value::as_array_mut)
        else {
            return Ok(None);
        };
        if characters.is_empty() {
            return Ok(None);
        }
        self.reconcile(host)?;
        let mut changed = false;
        for character in characters {
            let Some(character) = character.as_object_mut() else {
                continue;
            };
            // Explicit resolved layers take precedence over optional manifests.
            if character.get("spriteBase").is_some()
                || character
                    .get("spriteLayers")
                    .and_then(Value::as_array)
                    .is_some_and(|layers| !layers.is_empty())
            {
                continue;
            }
            let Some(sprite) = character.get("sprite").and_then(Value::as_str) else {
                continue;
            };
            validate_package_relative_asset_name("sprite", sprite)
                .map_err(NativeHostApiError::InvalidRequest)?;
            let sprite = sprite.strip_prefix("characters/").unwrap_or(sprite);
            let family = sprite_family(sprite);
            let manifest_path = if sprite.ends_with(".json") {
                sprite.to_string()
            } else {
                format!("{family}/sprite.manifest.json")
            };
            let packages = package_candidates(character.get("provenance"))?;
            let key = (packages.clone(), manifest_path.clone());
            if !self.manifests.contains_key(&key) {
                // Bound retained metadata, including negative lookups.
                if self.manifests.len() >= 128 {
                    self.manifests.clear();
                }
                let manifest = read_asset(host, &packages, &manifest_path)?
                    .and_then(|bytes| {
                        if bytes.len() > 2 * 1024 * 1024 {
                            return None;
                        }
                        serde_json::from_slice::<Value>(&bytes).ok()
                    })
                    .filter(|m| m.get("version").and_then(Value::as_u64) == Some(1));
                self.manifests.insert(key.clone(), manifest);
            }
            let Some(manifest) = self.manifests.get(&key).and_then(Option::as_ref) else {
                continue;
            };
            let Some(base) = manifest.get("base") else {
                continue;
            };
            let base = resolve_layer(host, &packages, &family, base, manifest.get("atlas"))?;
            character.insert("sprite".into(), base["asset"].clone());
            character.insert("spriteBase".into(), base);
            let layers = character
                .get("expression")
                .and_then(Value::as_str)
                .and_then(|expression| manifest.get("expressions")?.get(expression)?.get("layers"))
                .and_then(Value::as_array);
            let mut resolved = Vec::new();
            for layer in layers.into_iter().flatten().take(256) {
                resolved.push(resolve_layer(
                    host,
                    &packages,
                    &family,
                    layer,
                    manifest.get("atlas"),
                )?);
            }
            character.insert("spriteLayers".into(), Value::Array(resolved));
            changed = true;
        }
        Ok(changed.then(|| frame.to_string()))
    }
}

fn sprite_family(sprite: &str) -> String {
    let parts: Vec<_> = sprite.split('/').collect();
    if let Some(index) = parts
        .iter()
        .position(|p| matches!(*p, "expressions" | "atlas" | "frames" | "layers" | "masks"))
        .filter(|i| *i > 0)
    {
        return parts[..index].join("/");
    }
    if parts.len() > 1 {
        parts[..parts.len() - 1].join("/")
    } else {
        sprite
            .rsplit_once('.')
            .map_or(sprite, |(stem, _)| stem)
            .to_string()
    }
}

fn package_candidates(provenance: Option<&Value>) -> Result<Vec<String>, NativeHostApiError> {
    let mut packages = Vec::new();
    if let Some(provenance) = provenance {
        if let Some(package) = provenance.get("contentPackageId").and_then(Value::as_str) {
            packages.push(package.to_string());
        }
        if let Some(required) = provenance
            .get("requiredRuntimePackages")
            .and_then(Value::as_array)
        {
            for package in required.iter().rev().filter_map(Value::as_str) {
                if !packages.iter().any(|p| p == package) {
                    packages.push(package.to_string());
                }
            }
        }
    }
    for package in &packages {
        validate_native_package_id("sprite", package)
            .map_err(NativeHostApiError::InvalidRequest)?;
    }
    Ok(packages)
}

fn asset_path(family: &str, asset: &str) -> Result<String, NativeHostApiError> {
    validate_package_relative_asset_name("sprite", asset)
        .map_err(NativeHostApiError::InvalidRequest)?;
    let asset = asset.strip_prefix("characters/").unwrap_or(asset);
    Ok(if asset.starts_with(&format!("{family}/")) {
        asset.to_string()
    } else {
        format!("{family}/{asset}")
    })
}

fn resolve_layer(
    host: &impl NativeHostApi,
    packages: &[String],
    family: &str,
    layer: &Value,
    atlas: Option<&Value>,
) -> Result<Value, NativeHostApiError> {
    let mut result = layer.as_object().cloned().ok_or_else(|| {
        NativeHostApiError::InvalidRequest("Sprite layer must be an object".into())
    })?;
    if let Some(frame) = layer
        .get("frame")
        .and_then(Value::as_str)
        .and_then(|name| atlas?.get("frames")?.get(name))
    {
        if let Some(asset) = atlas.and_then(|a| a.get("asset")) {
            result.insert("asset".into(), asset.clone());
        }
        if let Some(fields) = frame.as_object() {
            for name in [
                "offsetX",
                "offsetY",
                "zIndex",
                "opacity",
                "mask",
                "blendMode",
                "anchor",
                "scale",
                "rotation",
                "visible",
            ] {
                if let Some(value) = fields.get(name) {
                    result.insert(name.into(), value.clone());
                }
            }
        }
        result.insert("frame".into(), frame.clone());
    } else {
        result.remove("frame");
    }
    for field in ["asset", "mask", "fallback"] {
        if let Some(asset) = result.get(field).and_then(Value::as_str) {
            result.insert(field.into(), Value::String(asset_path(family, asset)?));
        }
    }
    if let Some(fallback) = result.get("fallback").and_then(Value::as_str) {
        if let Some(asset) = result.get("asset").and_then(Value::as_str) {
            if read_asset(host, packages, asset)?.is_none() {
                result.insert("asset".into(), Value::String(fallback.to_string()));
                result.remove("frame");
            }
        }
    }
    if !result.contains_key("asset") {
        return Err(NativeHostApiError::InvalidRequest(
            "Sprite layer requires an asset".into(),
        ));
    }
    Ok(Value::Object(result))
}

fn read_asset(
    host: &impl NativeHostApi,
    packages: &[String],
    asset: &str,
) -> Result<Option<Vec<u8>>, NativeHostApiError> {
    validate_package_relative_asset_name("sprite", asset)
        .map_err(NativeHostApiError::InvalidRequest)?;
    let candidates = resolve_native_asset_read_candidates(host, packages)?;
    // Package priority takes precedence over legacy vs canonical URL spelling.
    for candidate in candidates {
        for url in native_asset_read_urls("characters", asset) {
            match host.read_asset_bytes(&NativeAssetReadRequest {
                url,
                bundle_name: candidate.bundle_name.clone(),
                asset_id: None,
            }) {
                Ok(bytes) => return Ok(Some(bytes)),
                Err(NativeHostApiError::AssetNotFound(_)) => {}
                Err(error) => return Err(error),
            }
        }
    }
    Ok(None)
}

#[cfg(test)]
#[path = "texture_sync/tests/support/host.rs"]
mod fixture_host;

#[cfg(test)]
mod tests {
    use super::*;
    use fixture_host::RecordingAssetHost;
    fn bundle(name: &str) -> NativeMountedBundleInfo {
        NativeMountedBundleInfo {
            name: name.into(),
            logical_name: None,
            version: Some(1),
            hash: None,
            runtime_package_id: Some(name.into()),
        }
    }
    const INPUT: &str = r#"{"view":{"characters":[{"id":"mira","sprite":"mira/base.png","expression":"smile","provenance":{"contentPackageId":"new","requiredRuntimePackages":["old"]}}]}}"#;
    #[test]
    fn resolves_package_scoped_expression_atlas_and_invalidates_metadata_on_unmount() {
        let host = RecordingAssetHost::new().with_bundle(bundle("new")).with_bundle(bundle("old"))
            .with_asset(Some("new"), "assets/characters/mira/sprite.manifest.json", *br#"{"version":1,"family":"mira","base":{"asset":"base.png"},"atlas":{"asset":"atlas.png","frames":{"smile":{"x":32,"y":0,"width":32,"height":64,"offsetX":5}}},"expressions":{"smile":{"layers":[{"asset":"atlas.png","frame":"smile","offsetX":99}]}}}"#);
        let mut resources = NativeSpriteResources::default();
        assert!(resources.reconcile(&host).unwrap());
        let output = resources.resolve_frame(&host, INPUT).unwrap().unwrap();
        let view: Value = serde_json::from_str(&output).unwrap();
        assert_eq!(
            view.pointer("/view/characters/0/sprite").unwrap(),
            "mira/base.png"
        );
        assert_eq!(
            view.pointer("/view/characters/0/spriteLayers/0/frame/x")
                .unwrap(),
            32
        );
        assert_eq!(
            view.pointer("/view/characters/0/spriteLayers/0/offsetX")
                .unwrap(),
            5
        );
        assert_eq!(
            view.pointer("/view/characters/0/spriteLayers/0/asset")
                .unwrap(),
            "mira/atlas.png"
        );
        let reads = host.reads.borrow().len();
        resources.resolve_frame(&host, INPUT).unwrap();
        assert_eq!(reads, host.reads.borrow().len());
        assert!(host
            .reads
            .borrow()
            .iter()
            .all(|r| r.bundle_name.as_deref() == Some("new")));
        let unmounted = RecordingAssetHost::new();
        assert!(resources.reconcile(&unmounted).unwrap());
        assert!(resources
            .resolve_frame(&unmounted, INPUT)
            .unwrap()
            .is_none());
        assert!(unmounted.reads.borrow().is_empty());
    }
    #[test]
    fn package_patch_invalidates_cached_manifests_without_changing_package_id() {
        let first = RecordingAssetHost::new()
            .with_bundle(bundle("new"))
            .with_asset(
                Some("new"),
                "assets/characters/mira/sprite.manifest.json",
                *br#"{"version":1,"base":{"asset":"first.png"}}"#,
            );
        let mut resources = NativeSpriteResources::default();
        let old = resources.resolve_frame(&first, INPUT).unwrap().unwrap();
        assert!(old.contains("mira/first.png"));
        let second = RecordingAssetHost::new()
            .with_bundle(NativeMountedBundleInfo {
                hash: Some("updated".into()),
                ..bundle("new")
            })
            .with_asset(
                Some("new"),
                "assets/characters/mira/sprite.manifest.json",
                *br#"{"version":1,"base":{"asset":"second.png"}}"#,
            );
        assert!(resources.reconcile(&second).unwrap());
        assert!(!resources.has_cached_metadata());
        let updated = resources.resolve_frame(&second, INPUT).unwrap().unwrap();
        assert!(updated.contains("mira/second.png"));
    }

    #[test]
    fn sampled_timeline_applies_after_manifest_resolution_without_new_asset_reads() {
        use quajs_wgpu_renderer::{
            projection::view::{build_view_render_graph, ViewProjection},
            projection_runtime::NativeRendererProjectionRuntime,
            stage_layout::{resolve_stage_layout, StageContainerInput, ViewLayoutInput},
        };
        let host = RecordingAssetHost::new().with_bundle(bundle("new"))
            .with_asset(Some("new"), "assets/characters/mira/sprite.manifest.json", *br#"{"version":1,"base":{"asset":"base.png"},"expressions":{"smile":{"layers":[{"asset":"face.png","offsetX":99}]}}}"#);
        let frame = serde_json::json!({"view":{"characters":[{"id":"mira","name":"Mira","visible":true,"sprite":"mira/base.png","expression":"smile",
            "position":{"x":960,"y":600,"width":240,"height":240,"scale":2,"rotation":90},"provenance":{"contentPackageId":"new"}}],
            "animations":[{"startedAt":1000,"state":"paused","pausedAt":1500,"duration":1000,"resolvedTracks":[{"target":"spriteLayer:mira:expression:1","property":"offsetX","keyframes":[{"at":0,"value":0},{"at":1000,"value":100}]}]}]}});
        let mut clock =
            NativeRendererProjectionRuntime::from_frame_json(&frame.to_string()).unwrap();
        let sampled = clock.project_at_epoch_ms(1500.0).unwrap();
        let mut resources = NativeSpriteResources::default();
        let resolved = resources
            .resolve_frame(&host, &sampled.json)
            .unwrap()
            .unwrap();
        let resolved: Value = serde_json::from_str(&resolved).unwrap();
        let view: ViewProjection = serde_json::from_value(resolved["view"].clone()).unwrap();
        let graph = build_view_render_graph(
            resolve_stage_layout(
                Some(ViewLayoutInput::default()),
                StageContainerInput::default(),
            ),
            &view,
        );
        let layer = graph
            .commands()
            .iter()
            .find(|c| c.id == "character:mira:sprite-layer:0")
            .unwrap();
        assert!((layer.bounds.x + layer.bounds.width / 2.0 - 960.0).abs() < 1e-9);
        assert!((layer.bounds.y + layer.bounds.height / 2.0 - 700.0).abs() < 1e-9);
        assert_eq!(layer.owner_package_id.as_deref(), Some("new"));
        assert!(layer
            .resource_ids
            .iter()
            .any(|id| id.as_str() == "characters:mira/face.png"));
        let reads = host.reads.borrow().len();
        resources.resolve_frame(&host, &sampled.json).unwrap();
        assert_eq!(host.reads.borrow().len(), reads);
        assert_eq!(view.characters[0].sprite_layers[0].offset_x, 99.0); // resource metadata stays immutable
    }

    #[test]
    fn rejects_unsafe_manifest_asset_before_resource_read() {
        let host = RecordingAssetHost::new()
            .with_bundle(bundle("new"))
            .with_asset(
                Some("new"),
                "assets/characters/mira/sprite.manifest.json",
                *br#"{"version":1,"base":{"asset":"../escape.png"}}"#,
            );
        let mut resources = NativeSpriteResources::default();
        assert!(resources.resolve_frame(&host, INPUT).is_err());
        assert!(host.reads.borrow().iter().all(|r| !r.url.contains("..")));
    }
    #[test]
    fn missing_primary_uses_declared_fallback_without_atlas_crop() {
        let host = RecordingAssetHost::new();
        let value = resolve_layer(&host, &[], "mira", &serde_json::json!({"asset":"missing.png","frame":"one","fallback":"fallback.png"}),
            Some(&serde_json::json!({"asset":"atlas.png","frames":{"one":{"x":10,"y":20,"width":30,"height":40}}}))).unwrap();
        assert_eq!(value["asset"], "mira/fallback.png");
        assert!(value.get("frame").is_none());
    }
}
