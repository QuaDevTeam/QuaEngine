//! Optional interactive image residency. Active projections are pinned; only
//! inactive images compete for the budget. Fonts/video keep their own lifecycle.
use super::RealWgpuNativeRenderRuntimeDevice;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Default)]
pub(super) struct ImageCache {
    pub budget: usize,
    pub preparation_budget: usize,
    pub budget_generation: u64,
    pub deferred: BTreeMap<String, usize>,
    pub active: BTreeSet<String>,
    /// Explicit loading-scene dependencies, protected until the destination
    /// adopts them. Unlike speculative hints these are required for entry.
    pub required: BTreeSet<String>,
    pub preloads: BTreeSet<String>,
    pub used: BTreeMap<String, u64>,
    pub scopes: BTreeMap<String, BTreeSet<String>>,
    pub changed: BTreeSet<String>,
    clock: u64,
}

#[cfg(all(test, feature = "real-wgpu-noop", feature = "image-decode"))]
mod tests {
    use super::super::{
        RealWgpuDecodedTextureMetadata, RealWgpuDecodedTextureRgba8,
        RealWgpuNativeRenderRuntimeTarget,
    };
    use super::*;

    fn device() -> RealWgpuNativeRenderRuntimeDevice {
        RealWgpuNativeRenderRuntimeDevice::new(RealWgpuNativeRenderRuntimeTarget::noop(16, 16))
    }
    #[test]
    fn required_loading_images_survive_zero_advisory_budget_until_destination_adopts_them() {
        let mut device = device();
        device.set_required_image_preparations(BTreeSet::from(["images:title".into(), "images:paper".into()]));
        upload(&mut device, "images:title");
        upload(&mut device, "images:paper");
        device.set_image_memory_budget(0, 0);
        device.touch_image_textures(&BTreeSet::new());
        assert!(device.image_texture_is_resident("images:title"));
        assert!(device.image_texture_is_resident("images:paper"));
        device.touch_image_textures(&BTreeSet::from(["images:title".into()]));
        device.set_required_image_preparations(BTreeSet::new());
        device.set_image_cache_budget(0);
        assert!(device.image_texture_is_resident("images:title"));
        assert!(!device.image_texture_is_resident("images:paper"));
    }
    fn upload(device: &mut RealWgpuNativeRenderRuntimeDevice, id: &str) {
        device
            .upload_decoded_texture_rgba8(id, RealWgpuDecodedTextureRgba8::new(1, 1, vec![255; 4]))
            .unwrap();
    }

    #[test]
    fn replacing_preload_window_cancels_stale_jobs_even_on_a_cached_frame() {
        let mut device = device();
        device.enable_async_image_uploads().unwrap();
        device.set_image_preloads(BTreeSet::from(["images:stale".into()]));
        device
            .request_image_preload("images:stale", &png(16, 16), Default::default())
            .unwrap();
        assert!(device.has_pending_image_uploads());
        device.set_image_preloads(BTreeSet::new());
        // Cancelled work remains charged until the worker actually drops it.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while device.has_pending_image_uploads() {
            assert!(std::time::Instant::now() < deadline);
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
        assert!(!device.image_texture_is_resident("images:stale"));
    }

    fn png(w: u32, h: u32) -> Vec<u8> {
        let mut encoded = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(w, h)
            .write_to(&mut encoded, image::ImageFormat::Png)
            .unwrap();
        encoded.into_inner()
    }

    #[test]
    fn memory_pressure_evicts_idle_images_but_keeps_the_displayed_image() {
        let mut device = device();
        device.set_image_cache_budget(1024);
        upload(&mut device, "images:visible");
        upload(&mut device, "images:idle");
        device.touch_image_textures(&BTreeSet::from(["images:visible".into()]));
        device.set_image_memory_budget(0, 0);
        assert!(device.image_texture_is_resident("images:visible"));
        assert!(!device.image_texture_is_resident("images:idle"));
        assert!(!device.retire_image_texture("images:visible"));
        device.touch_image_textures(&BTreeSet::new());
        assert_eq!(device.image_memory_usage(), (0, 0));
    }

    #[test]
    fn large_preloads_wait_for_memory_without_repeated_reads_then_resume() {
        let mut device = device();
        device.enable_async_image_uploads().unwrap();
        let bytes = png(1024, 1024);
        let peak = super::super::texture::preparation::estimate(&bytes).unwrap();
        let id = "images:large";
        device.set_image_memory_budget(peak - 1, peak - 1);
        device.set_image_preloads(BTreeSet::from([id.into()]));
        assert!(device.poll_image_preload(id).is_none());
        assert!(!device
            .request_image_preload(id, &bytes, Default::default())
            .unwrap());
        assert_eq!(device.image_memory_usage().1, 0);
        for _ in 0..10 {
            assert!(matches!(device.poll_image_preload(id), Some(Ok(false))));
        }
        let generation = device.image_preload_budget_generation();
        device.set_image_memory_budget(peak + 1024, peak + 1024);
        assert_ne!(generation, device.image_preload_budget_generation());
        assert!(device.poll_image_preload(id).is_none());
        device
            .request_image_preload(id, &bytes, Default::default())
            .unwrap();
        assert_eq!(device.image_memory_usage().1, peak);
        device.set_image_memory_budget(0, 0);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while device.has_pending_image_uploads() {
            assert!(std::time::Instant::now() < deadline);
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
        assert_eq!(device.image_memory_usage(), (0, 0));
        assert!(matches!(device.poll_image_preload(id), Some(Ok(false))));
    }

    #[test]
    fn image_cache_retains_revisits_and_evicts_idle_images_under_pressure() {
        let mut device = device();
        device.set_image_cache_budget(8);
        upload(&mut device, "images:a");
        device.touch_image_textures(&BTreeSet::from(["images:a".into()]));
        assert!(!device.retire_image_texture("images:a"));
        device.touch_image_textures(&BTreeSet::new());
        assert!(device.decoded_textures.contains_key("images:a"));
        upload(&mut device, "images:b");
        device.touch_image_textures(&BTreeSet::from(["images:b".into()]));
        upload(&mut device, "images:c");
        device.retire_image_texture("images:c");
        assert!(device.decoded_textures.contains_key("images:b"));
        assert_eq!(device.image_bytes(), 8);
        device.clear_image_cache();
        assert_eq!(device.image_bytes(), 0);
    }

    #[test]
    fn image_cache_pins_active_images_and_does_not_keep_fonts_or_video() {
        let mut device = device();
        device.set_image_cache_budget(1);
        device.touch_image_textures(&BTreeSet::from(["images:a".into()]));
        upload(&mut device, "images:a");
        device.retire_image_texture("images:a");
        assert_eq!(device.image_bytes(), 4);
        upload(&mut device, "fonts:atlas");
        assert!(device.retire_image_texture("fonts:atlas"));
        device.touch_image_textures(&BTreeSet::new());
        assert_eq!(device.image_bytes(), 0);
    }

    #[test]
    fn image_cache_invalidates_same_name_from_a_different_package() {
        let mut device = device();
        device.set_image_cache_budget(8);
        let id = "images:same.webp";
        device.prepare_image_scope(id, BTreeSet::from(["chapter-a".into()]), false);
        upload(&mut device, id);
        device.touch_image_textures(&BTreeSet::from([id.into()]));
        assert!(!device.prepare_image_scope(id, BTreeSet::from(["chapter-b".into()]), true));
        assert!(device.decoded_textures.contains_key(id));
        assert!(device.prepare_image_scope(id, BTreeSet::from(["chapter-b".into()]), false));
        assert!(!device.decoded_textures.contains_key(id));
    }

    #[test]
    fn image_preload_finishes_off_thread_before_first_use_and_package_unload_releases_it() {
        let mut device = device();
        device.enable_async_image_uploads().unwrap();
        let id = "images:opening.png";
        device.set_image_preloads(BTreeSet::from([id.into()]));
        let mut encoded = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(256, 256)
            .write_to(&mut encoded, image::ImageFormat::Png)
            .unwrap();
        assert!(device.poll_image_preload(id).is_none());
        assert!(!device
            .request_image_texture_upload(
                id,
                encoded.get_ref(),
                RealWgpuDecodedTextureMetadata::default().owned_by("opening")
            )
            .unwrap());
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        while !matches!(device.poll_image_preload(id), Some(Ok(true))) {
            assert!(std::time::Instant::now() < deadline);
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
        assert_eq!(device.async_textures.as_ref().unwrap().job_count(), 0);
        assert_eq!(device.decoded_texture_resource_count(), 1);
        device.touch_image_textures(&BTreeSet::from([id.into()]));
        assert!(device.decoded_textures.contains_key(id));
        device.retire_image_texture(id);
        assert!(device.decoded_textures.contains_key(id));
        assert_eq!(device.release_decoded_textures_for_package("opening"), 1);
        assert_eq!(device.decoded_texture_resource_count(), 0);
        assert!(device.poll_image_texture_upload(id).is_none());
    }
}

fn is_image(id: &str) -> bool {
    id.starts_with("images:") || id.starts_with("characters:")
}

impl RealWgpuNativeRenderRuntimeDevice {
    #[cfg(feature = "image-decode")]
    pub fn has_pending_image_uploads(&self) -> bool {
        self.async_textures
            .as_ref()
            .is_some_and(|worker| worker.job_count() > 0)
    }
    pub fn image_texture_is_resident(&self, id: &str) -> bool {
        self.decoded_textures.contains_key(id)
    }
    pub fn set_required_image_preparations(&mut self, ids: BTreeSet<String>) {
        self.image_cache.required = ids;
    }
    pub fn take_image_cache_changes(&mut self) -> BTreeSet<String> {
        std::mem::take(&mut self.image_cache.changed)
    }
    /// Identical asset names in different QPK candidates are different images.
    pub fn prepare_image_scope(
        &mut self,
        id: &str,
        packages: BTreeSet<String>,
        speculative: bool,
    ) -> bool {
        if self
            .image_cache
            .scopes
            .get(id)
            .is_some_and(|old| old != &packages)
        {
            if speculative && self.image_cache.active.contains(id) {
                return false;
            }
            self.release_decoded_texture(id);
            self.image_cache.changed.insert(id.into());
        }
        self.image_cache.scopes.insert(id.into(), packages);
        true
    }
    pub fn set_image_cache_budget(&mut self, bytes: usize) {
        self.image_cache.budget = bytes;
        self.trim_image_cache(0);
    }

    /// Host policy includes whole-process and system memory, not only textures.
    /// Shrinks take effect immediately; the host applies recovery hysteresis.
    pub fn set_image_memory_budget(&mut self, cache_bytes: usize, preparation_bytes: usize) {
        if cache_bytes == self.image_cache.budget
            && preparation_bytes == self.image_cache.preparation_budget
        {
            return;
        }
        if cache_bytes > self.image_cache.budget
            || preparation_bytes > self.image_cache.preparation_budget
        {
            self.image_cache.budget_generation = self.image_cache.budget_generation.wrapping_add(1);
        }
        let shrinking = cache_bytes < self.image_cache.budget
            || preparation_bytes < self.image_cache.preparation_budget;
        self.image_cache.budget = cache_bytes;
        self.image_cache.preparation_budget = preparation_bytes;
        #[cfg(feature = "image-decode")]
        if shrinking {
            if let Some(worker) = &self.async_textures {
                worker.retain(&self.image_cache.active.union(&self.image_cache.required).cloned().collect());
            }
        }
        let _ = shrinking;
        self.trim_image_cache(0);
    }

    pub fn image_preload_budget_generation(&self) -> u64 {
        self.image_cache.budget_generation
    }

    pub fn image_memory_usage(&self) -> (usize, usize) {
        let pending = 0;
        #[cfg(feature = "image-decode")]
        let pending = self
            .async_textures
            .as_ref()
            .map_or(pending, |worker| worker.reserved_bytes());
        (self.image_bytes(), pending)
    }

    #[cfg(feature = "image-decode")]
    pub(super) fn can_prepare_image_preload(&self, peak: usize) -> bool {
        let (resident, pending) = self.image_memory_usage();
        pending.saturating_add(peak) <= self.image_cache.preparation_budget
            && resident.saturating_add(pending).saturating_add(peak)
                <= self
                    .image_cache
                    .budget
                    .saturating_add(self.image_cache.preparation_budget)
    }

    pub fn touch_image_textures(&mut self, ids: &BTreeSet<String>) {
        self.image_cache.clock = self.image_cache.clock.wrapping_add(1);
        self.image_cache.active = ids.clone();
        self.image_cache.scopes.retain(|id, _| {
            ids.contains(id)
                || self.image_cache.preloads.contains(id)
                || self.decoded_textures.contains_key(id)
        });
        self.image_cache.used.retain(|id, _| {
            ids.contains(id)
                || self.image_cache.preloads.contains(id)
                || self.decoded_textures.contains_key(id)
        });
        for id in ids.iter().filter(|id| is_image(id)) {
            self.image_cache
                .used
                .insert(id.clone(), self.image_cache.clock);
        }
        self.trim_image_cache(0);
    }

    /// Frame retirement is different from explicit package release/shutdown.
    pub fn retire_image_texture(&mut self, id: &str) -> bool {
        if is_image(id) && (self.image_cache.budget > 0 || self.image_cache.active.contains(id) || self.image_cache.required.contains(id)) {
            self.image_cache
                .used
                .entry(id.into())
                .or_insert(self.image_cache.clock);
            self.trim_image_cache(0);
            false
        } else {
            let released = self.release_decoded_texture(id);
            self.image_cache.changed.insert(id.into());
            released
        }
    }

    fn image_bytes(&self) -> usize {
        self.decoded_textures
            .iter()
            .filter(|(id, _)| is_image(id))
            .map(|(_, image)| image.byte_len)
            .sum()
    }

    pub(super) fn trim_image_cache(&mut self, reserve: usize) {
        let reserve = reserve.saturating_add(self.image_memory_usage().1);
        let resident_budget = self.image_cache.budget.min(
            self.image_cache
                .budget
                .saturating_add(self.image_cache.preparation_budget)
                .saturating_sub(reserve),
        );
        let mut bytes = self.image_bytes();
        while bytes > resident_budget {
            let victim = self
                .decoded_textures
                .keys()
                .filter(|id| is_image(id) && !self.image_cache.active.contains(*id) && !self.image_cache.required.contains(*id))
                .min_by_key(|id| {
                    (
                        self.image_cache.preloads.contains(*id),
                        self.image_cache.used.get(*id).copied().unwrap_or(0),
                    )
                })
                .cloned();
            let Some(id) = victim else { break };
            bytes = bytes.saturating_sub(self.decoded_textures[&id].byte_len);
            self.release_decoded_texture(&id);
            self.image_cache.changed.insert(id);
        }
    }

    pub fn clear_image_cache(&mut self) {
        let ids: Vec<_> = self
            .decoded_textures
            .keys()
            .filter(|id| is_image(id))
            .cloned()
            .collect();
        for id in ids {
            self.release_decoded_texture(&id);
            self.image_cache.changed.insert(id);
        }
        #[cfg(feature = "image-decode")]
        if let Some(worker) = &self.async_textures {
            worker.retain(&Default::default());
        }
        self.image_cache.preloads.clear();
        self.image_cache.required.clear();
        self.image_cache.used.clear();
        self.image_cache.scopes.clear();
        self.image_cache.deferred.clear();
    }

    #[cfg(feature = "image-decode")]
    pub fn set_image_preloads(&mut self, ids: BTreeSet<String>) {
        self.image_cache.deferred.retain(|id, _| ids.contains(id));
        self.image_cache.preloads = ids;
        if let Some(worker) = &self.async_textures {
            let retained = self
                .image_cache
                .active
                .union(&self.image_cache.preloads)
                .cloned()
                .collect();
            worker.retain(&retained);
        }
    }

    /// Some(false) is either running or backpressure. It must not trigger a
    /// repeated QPK read. One speculative job leaves slots for visible images.
    #[cfg(feature = "image-decode")]
    pub fn poll_image_preload(
        &mut self,
        id: &str,
    ) -> Option<Result<bool, super::WgpuNativeRenderRuntimeError>> {
        if self.image_cache.budget == 0 || !self.image_cache.preloads.contains(id) {
            return Some(Ok(false));
        }
        if self.decoded_textures.contains_key(id) {
            return Some(Ok(true));
        }
        if let Some(result) = self.poll_image_texture_upload(id) {
            if matches!(result, Ok(true)) {
                self.image_cache.changed.insert(id.into());
                self.image_cache.clock = self.image_cache.clock.wrapping_add(1);
                self.image_cache
                    .used
                    .insert(id.into(), self.image_cache.clock);
                self.trim_image_cache(0);
            }
            return Some(result);
        }
        let worker = self.async_textures.as_ref()?;
        let peak = self
            .image_cache
            .deferred
            .get(id)
            .copied()
            .unwrap_or(1024 * 1024);
        if worker.job_count() != 0 || !self.can_prepare_image_preload(peak) {
            return Some(Ok(false));
        }
        None
    }
}
