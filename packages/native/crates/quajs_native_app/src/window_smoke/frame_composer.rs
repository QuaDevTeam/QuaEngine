//! Caches the composed frame JSON handed to the renderer.
//!
//! Composing a frame means taking the projection the worker published, writing
//! the window `container` into it, and (in dev) injecting the performance HUD
//! overlay. Both steps are full `serde_json` parse + serialize round trips over
//! the entire UI tree.
//!
//! On a static screen none of the three inputs change between frames: the
//! worker republishes nothing, the window is not resized, and the HUD only
//! refreshes its text every 100ms. Recomposing regardless burned two full JSON
//! round trips per frame — at 60 FPS on a large menu tree that dominated the
//! frame budget. This module keys the composed string on those three inputs and
//! reuses it whenever they are unchanged.

use std::sync::Arc;
use std::time::Duration;

use super::error::NativeWindowSmokeError;
use super::frame::{frame_json_for_window, WindowFrameDimensions};
use super::performance_hud::NativeWindowPerformanceHud;

/// Identity of a composed frame. Two frames with equal keys compose to
/// byte-identical JSON.
#[derive(Clone, Debug, PartialEq)]
struct ComposedFrameKey {
    /// Pointer identity of the projection string. The worker hands out an
    /// `Arc<str>` per published projection and the render thread holds the last
    /// one, so an unchanged pointer means an unchanged projection without
    /// re-comparing the bytes.
    projection: Arc<str>,
    dimensions: WindowFrameDimensions,
    /// HUD revision, or `None` when the HUD is not injected.
    hud_revision: Option<u64>,
}

impl ComposedFrameKey {
    fn matches(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.projection, &other.projection)
            && self.dimensions == other.dimensions
            && self.hud_revision == other.hud_revision
    }
}

/// Result of composing a frame, including whether the cache was hit.
pub(super) struct ComposedFrame {
    pub(super) json: Arc<str>,
    pub(super) cache_hit: bool,
    pub(super) compose_duration: Duration,
}

#[derive(Debug, Default)]
pub(super) struct NativeWindowFrameComposer {
    cached_key: Option<ComposedFrameKey>,
    cached_json: Option<Arc<str>>,
}

impl NativeWindowFrameComposer {
    /// Returns the frame JSON to submit, reusing the previous composition when
    /// the projection, window dimensions, and HUD revision are all unchanged.
    pub(super) fn compose(
        &mut self,
        projection: &Arc<str>,
        dimensions: WindowFrameDimensions,
        hud: Option<&NativeWindowPerformanceHud>,
    ) -> Result<ComposedFrame, NativeWindowSmokeError> {
        let started_at = std::time::Instant::now();
        let key = ComposedFrameKey {
            projection: projection.clone(),
            dimensions,
            hud_revision: hud.map(NativeWindowPerformanceHud::revision),
        };

        if let (Some(cached_key), Some(cached_json)) =
            (self.cached_key.as_ref(), self.cached_json.as_ref())
        {
            if cached_key.matches(&key) {
                return Ok(ComposedFrame {
                    json: cached_json.clone(),
                    cache_hit: true,
                    compose_duration: started_at.elapsed(),
                });
            }
        }

        let mut json = frame_json_for_window(
            projection,
            dimensions.logical_width,
            dimensions.logical_height,
            dimensions.device_pixel_ratio,
        )?;
        if let Some(hud) = hud {
            json = hud.inject(&json, dimensions)?;
        }
        let json: Arc<str> = Arc::from(json);
        self.cached_key = Some(key);
        self.cached_json = Some(json.clone());

        Ok(ComposedFrame {
            json,
            cache_hit: false,
            compose_duration: started_at.elapsed(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROJECTION: &str = r#"{"view":{"ui":{"overlays":[]}}}"#;

    fn dimensions() -> WindowFrameDimensions {
        WindowFrameDimensions {
            logical_width: 960.0,
            logical_height: 540.0,
            physical_size: winit::dpi::PhysicalSize::new(1920, 1080),
            device_pixel_ratio: 2.0,
        }
    }

    #[test]
    fn reuses_the_composition_when_nothing_changed() {
        let mut composer = NativeWindowFrameComposer::default();
        let projection: Arc<str> = Arc::from(PROJECTION);

        let first = composer
            .compose(&projection, dimensions(), None)
            .expect("first composition should succeed");
        let second = composer
            .compose(&projection, dimensions(), None)
            .expect("second composition should succeed");

        assert!(!first.cache_hit);
        assert!(second.cache_hit);
        assert_eq!(first.json, second.json);
        assert!(Arc::ptr_eq(&first.json, &second.json));
    }

    #[test]
    fn recomposes_when_the_projection_pointer_changes() {
        let mut composer = NativeWindowFrameComposer::default();
        let first_projection: Arc<str> = Arc::from(PROJECTION);
        // Same bytes, different allocation: a freshly published projection.
        let second_projection: Arc<str> = Arc::from(PROJECTION);

        composer
            .compose(&first_projection, dimensions(), None)
            .expect("first composition should succeed");
        let second = composer
            .compose(&second_projection, dimensions(), None)
            .expect("second composition should succeed");

        assert!(!second.cache_hit);
    }

    #[test]
    fn recomposes_when_the_window_is_resized() {
        let mut composer = NativeWindowFrameComposer::default();
        let projection: Arc<str> = Arc::from(PROJECTION);
        composer
            .compose(&projection, dimensions(), None)
            .expect("first composition should succeed");

        let mut resized = dimensions();
        resized.logical_width = 1280.0;
        resized.physical_size = winit::dpi::PhysicalSize::new(2560, 1080);
        let second = composer
            .compose(&projection, resized, None)
            .expect("resized composition should succeed");

        assert!(!second.cache_hit);
        assert!(second.json.contains("1280"));
    }

    #[test]
    fn recomposes_when_the_hud_revision_changes() {
        let mut composer = NativeWindowFrameComposer::default();
        let projection: Arc<str> = Arc::from(PROJECTION);
        let mut hud = NativeWindowPerformanceHud::default();

        let first = composer
            .compose(&projection, dimensions(), Some(&hud))
            .expect("first composition should succeed");
        assert!(!first.cache_hit);

        // Same revision: the HUD text has not refreshed yet.
        let second = composer
            .compose(&projection, dimensions(), Some(&hud))
            .expect("second composition should succeed");
        assert!(second.cache_hit);

        hud.force_refresh_for_test();
        let third = composer
            .compose(&projection, dimensions(), Some(&hud))
            .expect("third composition should succeed");
        assert!(!third.cache_hit);
    }

    #[test]
    fn recomposes_when_the_hud_is_toggled() {
        let mut composer = NativeWindowFrameComposer::default();
        let projection: Arc<str> = Arc::from(PROJECTION);
        let hud = NativeWindowPerformanceHud::default();

        composer
            .compose(&projection, dimensions(), None)
            .expect("composition without the HUD should succeed");
        let with_hud = composer
            .compose(&projection, dimensions(), Some(&hud))
            .expect("composition with the HUD should succeed");

        assert!(!with_hud.cache_hit);
        assert!(with_hud.json.contains("native-performance-hud"));
    }

    #[test]
    fn composes_the_window_container_into_the_frame() {
        let mut composer = NativeWindowFrameComposer::default();
        let projection: Arc<str> = Arc::from(PROJECTION);

        let composed = composer
            .compose(&projection, dimensions(), None)
            .expect("composition should succeed");
        let value: serde_json::Value =
            serde_json::from_str(&composed.json).expect("composed frame should be valid JSON");

        assert_eq!(value["container"]["width"], 960.0);
        assert_eq!(value["container"]["height"], 540.0);
        assert_eq!(value["container"]["devicePixelRatio"], 2.0);
    }
}
