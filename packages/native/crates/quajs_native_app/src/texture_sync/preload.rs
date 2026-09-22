//! Bounded speculative resources from engine-authored script hints. No steps
//! are executed here, and all bytes still come from mounted QPK host assets.
use super::host::read_texture_asset_bytes;
use super::metadata::upload_metadata_from_request;
use super::validation::validate_texture_upload_request;
use super::NativeTextureUploadSink;
use crate::sprite_resources::NativeSpriteResources;
use quajs_native_runtime::NativeHostApi;
use quajs_wgpu_renderer::resources::{NativeTextureUploadRequest, ResourceId};
use serde_json::{json, Value};
use std::collections::BTreeSet;

#[derive(Debug, Default)]
pub(crate) struct NativeTexturePreloader {
    hint: Value,
    requests: Vec<NativeTextureUploadRequest>,
    finished: BTreeSet<String>,
    budget_generation: u64,
    needs_tick: bool,
    sprites: NativeSpriteResources,
    required_id: Option<String>,
    error: Option<String>,
    last_progress: Option<Value>,
    progress: Option<Value>,
}

impl NativeTexturePreloader {
    pub(crate) fn needs_tick(&self) -> bool {
        self.needs_tick
    }
    pub(crate) fn update(&mut self, host: &impl NativeHostApi, frame: &str) {
        let Ok(frame) = serde_json::from_str::<Value>(frame) else {
            return;
        };
        let preparation = frame.pointer("/view/plugins/asset-loading")
            .filter(|state| state.get("visible").and_then(Value::as_bool) == Some(true)
                && state.get("state").and_then(Value::as_str) == Some("loading"))
            .and_then(|state| state.get("preparation"));
        let hint = preparation.cloned().unwrap_or_else(|| frame.get("preload").cloned().unwrap_or(Value::Null));
        if hint == self.hint {
            return;
        }
        self.hint = hint;
        self.required_id = preparation.and_then(|p| p.get("id")).and_then(Value::as_str).map(str::to_string);
        self.error = None;
        self.last_progress = None;
        self.progress = None;
        let previous = std::mem::take(&mut self.requests);
        // Build the complete validated plan before any texture byte reads.
        if let Err(error) = self.resolve(host) {
            log::warn!("Image preloading skipped: {error}");
            self.error = Some(error);
            self.requests.clear();
        }
        let ids: BTreeSet<_> = self
            .requests
            .iter()
            .filter(|r| previous.contains(r))
            .map(|r| r.resource_id.as_str().to_string())
            .collect();
        self.finished.retain(|id| ids.contains(id));
    }

    fn resolve(&mut self, host: &impl NativeHostApi) -> Result<(), String> {
        let images = self
            .hint
            .get("images")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if self.required_id.is_some() && images.len() > 12 {
            return Err("A renderer preparation supports at most 12 images".into());
        }
        for image in images.iter().take(12) {
            let kind = image.get("assetType").and_then(Value::as_str).unwrap_or("");
            let name = image.get("assetName").and_then(Value::as_str).unwrap_or("");
            self.add(kind, name, image.get("provenance"))?;
        }
        let characters: Vec<_> = self
            .hint
            .get("characters")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .take(12)
            .cloned()
            .collect();
        for character in &characters {
            validate_provenance(character.get("provenance"))?;
        }
        let frame = json!({"view": {"characters": characters}}).to_string();
        let resolved = self
            .sprites
            .resolve_frame(host, &frame)
            .map_err(|e| e.message())?;
        let frame: Value = serde_json::from_str(resolved.as_deref().unwrap_or(&frame))
            .map_err(|e| e.to_string())?;
        for character in frame
            .pointer("/view/characters")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let provenance = character.get("provenance");
            if let Some(base) = character.get("spriteBase") {
                self.add_layer(base, provenance)?;
            } else if let Some(sprite) = character
                .get("sprite")
                .and_then(Value::as_str)
                .filter(|name| !name.ends_with(".json"))
            {
                self.add("characters", sprite, provenance)?;
            }
            for layer in character
                .get("spriteLayers")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .take(32)
            {
                self.add_layer(layer, provenance)?;
            }
        }
        Ok(())
    }

    fn add_layer(&mut self, layer: &Value, provenance: Option<&Value>) -> Result<(), String> {
        for field in ["asset", "mask"] {
            if let Some(asset) = layer.get(field).and_then(Value::as_str) {
                self.add("characters", asset, provenance)?;
            }
        }
        Ok(())
    }

    fn add(&mut self, kind: &str, name: &str, provenance: Option<&Value>) -> Result<(), String> {
        validate_provenance(provenance)?;
        if !matches!(kind, "images" | "characters") {
            return Err("Unsupported preload asset type".into());
        }
        let owner = provenance
            .and_then(|p| p.get("contentPackageId"))
            .and_then(Value::as_str);
        let required = provenance
            .and_then(|p| p.get("requiredRuntimePackages"))
            .and_then(Value::as_array);
        let request = NativeTextureUploadRequest {
            resource_id: ResourceId::from(format!("{kind}:{name}")),
            asset_type: kind.into(),
            asset_name: name.into(),
            command_ids: Default::default(),
            owner_package_ids: owner.into_iter().map(str::to_string).collect(),
            required_package_ids: required
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect(),
            package_candidates: Default::default(),
        };
        validate_texture_upload_request(&request)?;
        if self.requests.len() < 32
            && !self
                .requests
                .iter()
                .any(|r| r.resource_id == request.resource_id)
        {
            self.requests.push(request);
        }
        Ok(())
    }

    pub(crate) fn tick(
        &mut self,
        host: &impl NativeHostApi,
        sink: &mut impl NativeTextureUploadSink,
    ) {
        self.needs_tick = false;
        sink.set_required_texture_preparations(if self.required_id.is_some() {
            self.requests.iter().map(|r| r.resource_id.as_str().to_string()).collect()
        } else { BTreeSet::new() });
        let generation = sink.texture_preload_budget_generation();
        if self.budget_generation != generation {
            if self.required_id.is_none() {
                self.finished.clear();
            }
            self.budget_generation = generation;
        }
        sink.set_texture_preloads(
            self.requests
                .iter()
                .map(|r| r.resource_id.as_str().to_string())
                .collect(),
        );
        if self.required_id.is_some() {
            self.tick_required(host, sink);
            return;
        }
        for request in &self.requests {
            let id = request.resource_id.as_str();
            if self.finished.contains(id) {
                continue;
            }
            match sink.poll_texture_preload(request) {
                Some(Ok(true)) => {
                    log::debug!("Image preload ready: {id}");
                    self.finished.insert(id.into());
                }
                Some(Ok(false)) => {}
                Some(Err(error)) => {
                    log::warn!("Image preload {id}: {error}");
                    self.finished.insert(id.into());
                }
                None => {
                    // A rejected large hint must not leave smaller later hints
                    // unvisited when there is no worker job to keep frames alive.
                    self.needs_tick = true;
                    let result = read_texture_asset_bytes(host, request)
                        .map_err(|e| e.message)
                        .and_then(|read| {
                            sink.request_texture_preload(
                                request,
                                &read.bytes,
                                upload_metadata_from_request(request, read.package_id.as_deref()),
                            )
                            .map_err(|e| e.to_string())
                        });
                    match result {
                        Ok(true) => {
                            self.finished.insert(id.into());
                        }
                        Ok(false) => {}
                        Err(error) => {
                            log::warn!("Image preload {id}: {error}");
                            self.finished.insert(id.into());
                        }
                    }
                    // Bound QPK reads/copies to one speculative resource per frame.
                    break;
                }
            }
        }
    }

    pub(crate) fn take_progress(&mut self) -> Option<Value> {
        self.progress.take()
    }

    fn tick_required(&mut self, host: &impl NativeHostApi, sink: &mut impl NativeTextureUploadSink) {
        // Required loading-scene work is never silently dropped by the advisory
        // preload budget. One decode at a time bounds peak memory and QPK reads.
        if self.error.is_none() {
            for request in &self.requests {
                let id = request.resource_id.as_str();
                sink.prepare_texture_request(request);
                if self.finished.contains(id) { continue; }
                let result = if sink.texture_is_resident(&request.resource_id) {
                    Ok(true)
                } else if let Some(result) = sink.poll_texture_upload(&request.resource_id) {
                    result.map_err(|e| e.to_string())
                } else {
                    read_texture_asset_bytes(host, request).map_err(|e| e.message)
                        .and_then(|read| sink.request_texture_upload(request, &read.bytes,
                            upload_metadata_from_request(request, read.package_id.as_deref()))
                            .map_err(|e| e.to_string()))
                };
                match result {
                    Ok(true) => { self.finished.insert(id.into()); }
                    Ok(false) => {}
                    Err(error) => { self.error = Some(format!("{id}: {error}")); }
                }
                break;
            }
        }
        self.needs_tick = self.error.is_none() && self.finished.len() < self.requests.len();
        let update = json!({ "id": self.required_id, "completed": self.finished.len(),
            "total": self.requests.len(), "error": self.error });
        if self.last_progress.as_ref() != Some(&update) {
            self.last_progress = Some(update.clone());
            self.progress = Some(update);
        }
    }
}

fn validate_provenance(value: Option<&Value>) -> Result<(), String> {
    let Some(value) = value else { return Ok(()) };
    let provenance: quajs_wgpu_renderer::projection::common::PackageProvenance =
        serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
    for id in provenance
        .content_package_id
        .iter()
        .chain(&provenance.required_runtime_packages)
    {
        crate::host_assets::validate_native_package_id("preload", id)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::{tests::support::RecordingAssetHost, NativeTextureUploadMetadata};
    use super::*;

    #[derive(Default)]
    struct Sink {
        ids: Vec<String>,
        packages: Vec<Option<String>>,
        blocked: bool,
        generation: u64,
        oversized: BTreeSet<String>,
        deferred: BTreeSet<String>,
    }
    impl NativeTextureUploadSink for Sink {
        type Error = String;
        fn texture_preload_budget_generation(&self) -> u64 {
            self.generation
        }
        fn request_texture_preload(
            &mut self,
            request: &NativeTextureUploadRequest,
            bytes: &[u8],
            metadata: NativeTextureUploadMetadata,
        ) -> Result<bool, String> {
            if self.oversized.contains(request.resource_id.as_str()) {
                self.deferred.insert(request.resource_id.as_str().into());
                Ok(false)
            } else {
                self.request_texture_upload(request, bytes, metadata)
            }
        }
        fn poll_texture_preload(
            &mut self,
            request: &NativeTextureUploadRequest,
        ) -> Option<Result<bool, String>> {
            if self.blocked || self.deferred.contains(request.resource_id.as_str()) {
                Some(Ok(false))
            } else {
                None
            }
        }
        fn upload_texture_bytes(
            &mut self,
            request: &NativeTextureUploadRequest,
            _: &[u8],
            metadata: NativeTextureUploadMetadata,
        ) -> Result<(), String> {
            self.ids.push(request.resource_id.as_str().into());
            self.packages.push(metadata.owner_package_id);
            Ok(())
        }
        fn upload_decoded_texture_rgba8(
            &mut self,
            _: &ResourceId,
            _: u32,
            _: u32,
            _: &[u8],
            _: NativeTextureUploadMetadata,
        ) -> Result<(), String> {
            unreachable!()
        }
    }

    #[test]
    fn deferred_large_hints_do_not_starve_smaller_hints_or_spin_idle_frames() {
        let host = RecordingAssetHost::new()
            .with_asset(None, "large.webp", [1])
            .with_asset(None, "small.webp", [2]);
        let mut sink = Sink {
            oversized: BTreeSet::from(["images:large.webp".into()]),
            ..Default::default()
        };
        let mut preloader = NativeTexturePreloader::default();
        preloader.update(&host, &json!({"preload":{"images":[
            {"assetType":"images", "assetName":"large.webp"}, {"assetType":"images", "assetName":"small.webp"}
        ]}}).to_string());
        preloader.tick(&host, &mut sink);
        assert!(preloader.needs_tick());
        preloader.tick(&host, &mut sink);
        assert_eq!(sink.ids, ["images:small.webp"]);
        preloader.tick(&host, &mut sink);
        assert!(!preloader.needs_tick());
        assert_eq!(host.reads.borrow().len(), 2);
    }
    #[test]
    fn pressure_stops_reads_and_recovery_rewarms_evicted_hints_without_story_changes() {
        let host = RecordingAssetHost::new().with_asset(None, "a.webp", [1]);
        let mut preloader = NativeTexturePreloader::default();
        let mut sink = Sink::default();
        preloader.update(
            &host,
            &json!({"preload":{"images":[{"assetType":"images","assetName":"a.webp"}]}})
                .to_string(),
        );
        preloader.tick(&host, &mut sink);
        assert_eq!(host.reads.borrow().len(), 1);
        sink.blocked = true;
        for _ in 0..10 {
            preloader.tick(&host, &mut sink);
        }
        assert_eq!(host.reads.borrow().len(), 1);
        sink.blocked = false;
        sink.generation += 1;
        preloader.tick(&host, &mut sink);
        assert_eq!(host.reads.borrow().len(), 2);
    }
    #[test]
    fn preloads_read_one_qpk_asset_per_tick_and_deduplicate_without_drawing() {
        let host = RecordingAssetHost::new()
            .with_asset(None, "a.webp", [1])
            .with_asset(None, "b.webp", [2]);
        let mut preloader = NativeTexturePreloader::default();
        let mut sink = Sink::default();
        let frame = json!({"preload": {"images": [
            {"assetType": "images", "assetName": "a.webp"},
            {"assetType": "images", "assetName": "a.webp"},
            {"assetType": "images", "assetName": "b.webp"}
        ]}})
        .to_string();
        preloader.update(&host, &frame);
        preloader.tick(&host, &mut sink);
        assert_eq!(host.reads.borrow().len(), 1);
        preloader.tick(&host, &mut sink);
        preloader.update(&host, &frame);
        preloader.tick(&host, &mut sink);
        assert_eq!(host.reads.borrow().len(), 2);
        assert_eq!(sink.ids, ["images:a.webp", "images:b.webp"]);
    }

    #[test]
    fn loading_scene_preparation_bypasses_speculative_budget_and_reports_real_completion() {
        let host = RecordingAssetHost::new().with_asset(None, "a.webp", [1]).with_asset(None, "b.webp", [2]);
        let mut sink = Sink { blocked: true, ..Default::default() };
        let mut preloader = NativeTexturePreloader::default();
        preloader.update(&host, &json!({"view":{"plugins":{"asset-loading":{
            "visible":true,"state":"loading","preparation":{"id":"startup", "images":[
                {"assetType":"images","assetName":"a.webp"},
                {"assetType":"images","assetName":"b.webp"}
            ]}
        }}}}).to_string());
        preloader.tick(&host, &mut sink);
        assert_eq!(preloader.take_progress().unwrap(), json!({"id":"startup","completed":1,"total":2,"error":null}));
        assert!(preloader.needs_tick());
        preloader.tick(&host, &mut sink);
        assert_eq!(preloader.take_progress().unwrap()["completed"], 2);
        assert!(!preloader.needs_tick());
        preloader.tick(&host, &mut sink);
        assert!(preloader.take_progress().is_none());
        assert_eq!(host.reads.borrow().len(), 2);
    }

    #[test]
    fn loading_scene_preparation_reports_missing_assets_and_retries_with_new_request_id() {
        let host = RecordingAssetHost::new();
        let mut sink = Sink::default();
        let mut preloader = NativeTexturePreloader::default();
        let request = |id| json!({"view":{"plugins":{"asset-loading":{
            "visible":true,"state":"loading","preparation":{"id":id, "images":[
                {"assetType":"images","assetName":"a.webp"}
            ]}
        }}}}).to_string();
        preloader.update(&host, &request("first"));
        preloader.tick(&host, &mut sink);
        let failed = preloader.take_progress().unwrap();
        assert_eq!(failed["completed"], 0);
        assert!(failed["error"].as_str().unwrap().contains("a.webp"));
        assert!(!preloader.needs_tick());
        let host = host.with_asset(None, "a.webp", [1]);
        preloader.update(&host, &request("retry"));
        preloader.tick(&host, &mut sink);
        assert_eq!(preloader.take_progress().unwrap(), json!({"id":"retry","completed":1,"total":1,"error":null}));
    }

    #[test]
    fn preloads_reject_unsafe_refs_and_malformed_package_scope_before_asset_reads() {
        let host = RecordingAssetHost::new();
        let mut sink = Sink::default();
        for image in [
            json!({"assetType":"images", "assetName":"../outside.png"}),
            json!({"assetType":"images", "assetName":"https://example.test/image.png"}),
            json!({"assetType":"images", "assetName":"safe.png", "provenance":{"contentPackageId":123}}),
            json!({"assetType":"images", "assetName":"safe.png", "provenance":{"requiredRuntimePackages":["../escape"]}}),
        ] {
            let mut preloader = NativeTexturePreloader::default();
            preloader.update(&host, &json!({"preload":{"images":[image]}}).to_string());
            preloader.tick(&host, &mut sink);
        }
        assert!(host.reads.borrow().is_empty());
        assert!(sink.ids.is_empty());
    }

    #[test]
    fn preloads_never_fall_back_to_an_unscoped_asset_when_the_package_is_unmounted() {
        let host = RecordingAssetHost::new().with_asset(None, "same.png", [99]);
        let mut sink = Sink::default();
        let mut preloader = NativeTexturePreloader::default();
        preloader.update(&host, &json!({"preload":{"images":[{
            "assetType":"images", "assetName":"same.png", "provenance":{"contentPackageId":"not-mounted"}
        }]}}).to_string());
        preloader.tick(&host, &mut sink);
        preloader.tick(&host, &mut sink);
        assert!(host.reads.borrow().is_empty());
        assert!(sink.ids.is_empty());
    }
}
