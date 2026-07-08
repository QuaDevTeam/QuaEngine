use std::collections::BTreeMap;
use std::io::Cursor;
use std::time::{Duration, Instant};

use image::codecs::gif::GifDecoder;
use image::AnimationDecoder;
use quajs_wgpu_renderer::resources::ResourceId;
use quajs_wgpu_renderer::video::{
    NativeVideoBackend, NativeVideoBackendResult, VideoBackendAssetLoad, VideoBackendCommandKind,
    VideoBackendCommandPlan, VideoBackendFrameResource, VideoBackendFrameResourceMap,
    VideoBackendFrameTexture, VideoBackendStreamState,
};

const DEFAULT_GIF_FRAME_DURATION_MS: f64 = 100.0;

pub(crate) trait NativeVideoClock: std::fmt::Debug {
    fn now(&self) -> Duration;
}

#[derive(Debug)]
pub(crate) struct SystemNativeVideoClock {
    origin: Instant,
}

impl Default for SystemNativeVideoClock {
    fn default() -> Self {
        Self {
            origin: Instant::now(),
        }
    }
}

impl NativeVideoClock for SystemNativeVideoClock {
    fn now(&self) -> Duration {
        self.origin.elapsed()
    }
}

#[derive(Debug)]
pub(crate) struct GifNativeVideoBackend<C = SystemNativeVideoClock> {
    clock: C,
    loaded_assets: BTreeMap<ResourceId, VideoBackendAssetLoad>,
    active_streams: BTreeMap<String, ActiveGifStream>,
    pending_frames: Vec<VideoBackendFrameTexture>,
    pending_releases: Vec<ResourceId>,
}

impl GifNativeVideoBackend<SystemNativeVideoClock> {
    pub(crate) fn new() -> Self {
        Self::with_clock(SystemNativeVideoClock::default())
    }
}

impl Default for GifNativeVideoBackend<SystemNativeVideoClock> {
    fn default() -> Self {
        Self::new()
    }
}

impl<C> GifNativeVideoBackend<C>
where
    C: NativeVideoClock,
{
    fn with_clock(clock: C) -> Self {
        Self {
            clock,
            loaded_assets: BTreeMap::new(),
            active_streams: BTreeMap::new(),
            pending_frames: Vec::new(),
            pending_releases: Vec::new(),
        }
    }
}

impl<C> NativeVideoBackend for GifNativeVideoBackend<C>
where
    C: NativeVideoClock,
{
    fn wants_video_asset_loads(&self) -> bool {
        true
    }

    fn apply_video_asset_loads(
        &mut self,
        loads: &[VideoBackendAssetLoad],
    ) -> NativeVideoBackendResult {
        for load in loads {
            self.loaded_assets
                .insert(load.resource_id.clone(), load.clone());
        }
        Ok(())
    }

    fn apply_video_commands(&mut self, plan: &VideoBackendCommandPlan) -> NativeVideoBackendResult {
        for command in &plan.commands {
            let Some(stream) = &command.stream else {
                continue;
            };
            match command.kind {
                VideoBackendCommandKind::LoadAsset => {}
                VideoBackendCommandKind::StartStream => self.start_stream(stream),
                VideoBackendCommandKind::UpdateStream => self.update_stream(stream),
                VideoBackendCommandKind::StopStream => {}
                VideoBackendCommandKind::ReleaseDecoder => self.release_stream(stream),
            }
        }
        self.tick_streams(&plan.next_streams);
        Ok(())
    }

    fn video_frame_resources(&self) -> VideoBackendFrameResourceMap {
        self.active_streams
            .iter()
            .map(|(stream_id, active)| {
                (
                    stream_id.clone(),
                    VideoBackendFrameResource {
                        stream_id: stream_id.clone(),
                        resource_id: active.stream.texture_ring_resource_id.clone(),
                    },
                )
            })
            .collect()
    }

    fn drain_video_frame_textures(&mut self) -> Vec<VideoBackendFrameTexture> {
        std::mem::take(&mut self.pending_frames)
    }

    fn drain_video_frame_texture_releases(&mut self) -> Vec<ResourceId> {
        std::mem::take(&mut self.pending_releases)
    }
}

impl<C> GifNativeVideoBackend<C>
where
    C: NativeVideoClock,
{
    fn start_stream(&mut self, stream: &VideoBackendStreamState) {
        let Some(active) = self.decode_stream(stream) else {
            return;
        };
        let previous = self.active_streams.insert(stream.id.clone(), active);
        if let Some(previous) = previous {
            self.release_texture_resource_if_unused(previous.stream.texture_ring_resource_id);
        }
        self.publish_frame(&stream.id, 0);
    }

    fn update_stream(&mut self, stream: &VideoBackendStreamState) {
        if let Some(active) = self.active_streams.get_mut(&stream.id) {
            active.stream = stream.clone();
            return;
        }
        self.start_stream(stream);
    }

    fn release_stream(&mut self, stream: &VideoBackendStreamState) {
        self.loaded_assets.remove(&stream.decoder_resource_id);
        let Some(active) = self.active_streams.remove(&stream.id) else {
            return;
        };
        self.release_texture_resource_if_unused(active.stream.texture_ring_resource_id);
    }

    fn tick_streams(&mut self, streams: &quajs_wgpu_renderer::video::VideoBackendStreamStateMap) {
        if streams.is_empty() || self.active_streams.is_empty() {
            return;
        }
        let now = self.clock.now();
        for stream in streams.values() {
            let Some(active) = self.active_streams.get(&stream.id) else {
                continue;
            };
            let Some(frame_index) = active.frame_index_at(now) else {
                continue;
            };
            if active.last_published_index == Some(frame_index) {
                continue;
            }
            self.publish_frame(&stream.id, frame_index);
        }
    }

    fn decode_stream(&self, stream: &VideoBackendStreamState) -> Option<ActiveGifStream> {
        let Some(load) = self.loaded_assets.get(&stream.decoder_resource_id) else {
            return None;
        };
        let Some(frames) = decode_gif_frames(load) else {
            return None;
        };
        let package_metadata = package_metadata_for_stream(stream, load);
        Some(ActiveGifStream::new(
            stream.clone(),
            frames,
            self.clock.now(),
            package_metadata,
        ))
    }

    fn publish_frame(&mut self, stream_id: &str, frame_index: usize) {
        let Some(active) = self.active_streams.get_mut(stream_id) else {
            return;
        };
        let Some(decoded) = active.frames.get(frame_index) else {
            return;
        };

        let mut frame = VideoBackendFrameTexture::new(
            active.stream.id.clone(),
            active.stream.texture_ring_resource_id.clone(),
            decoded.width,
            decoded.height,
            decoded.rgba.clone(),
        );
        frame.owner_package_id = active.package_metadata.owner_package_id.clone();
        frame.required_package_ids = active.package_metadata.required_package_ids.clone();
        active.last_published_index = Some(frame_index);

        self.pending_frames.push(frame);
    }

    fn release_texture_resource_if_unused(&mut self, resource_id: ResourceId) {
        if !self
            .active_streams
            .values()
            .any(|active| active.stream.texture_ring_resource_id == resource_id)
        {
            self.pending_releases.push(resource_id);
        }
    }
}

#[derive(Clone, Debug)]
struct ActiveGifStream {
    stream: VideoBackendStreamState,
    frames: Vec<DecodedGifFrame>,
    total_duration_ms: f64,
    started_at: Duration,
    last_published_index: Option<usize>,
    package_metadata: VideoFramePackageMetadata,
}

impl ActiveGifStream {
    fn new(
        stream: VideoBackendStreamState,
        frames: Vec<DecodedGifFrame>,
        started_at: Duration,
        package_metadata: VideoFramePackageMetadata,
    ) -> Self {
        let total_duration_ms = frames.iter().map(|frame| frame.duration_ms).sum::<f64>();
        Self {
            stream,
            frames,
            total_duration_ms,
            started_at,
            last_published_index: None,
            package_metadata,
        }
    }

    fn frame_index_at(&self, now: Duration) -> Option<usize> {
        if self.frames.is_empty() {
            return None;
        }
        if self.frames.len() == 1 || self.total_duration_ms <= 0.0 {
            return Some(0);
        }

        let playback_rate =
            if self.stream.playback_rate.is_finite() && self.stream.playback_rate > f32::EPSILON {
                self.stream.playback_rate as f64
            } else {
                1.0
            };
        let elapsed_ms = now
            .saturating_sub(self.started_at)
            .as_secs_f64()
            .mul_add(1000.0 * playback_rate, 0.0);
        let position_ms = if self.stream.looped {
            elapsed_ms % self.total_duration_ms
        } else if elapsed_ms >= self.total_duration_ms {
            self.total_duration_ms
        } else {
            elapsed_ms
        };

        let mut cursor_ms = 0.0;
        for (index, frame) in self.frames.iter().enumerate() {
            cursor_ms += frame.duration_ms;
            if position_ms < cursor_ms || index == self.frames.len() - 1 {
                return Some(index);
            }
        }
        Some(self.frames.len() - 1)
    }
}

#[derive(Clone, Debug)]
struct DecodedGifFrame {
    width: u32,
    height: u32,
    rgba: Vec<u8>,
    duration_ms: f64,
}

#[derive(Clone, Debug, Default)]
struct VideoFramePackageMetadata {
    owner_package_id: Option<String>,
    required_package_ids: std::collections::BTreeSet<String>,
}

fn decode_gif_frames(load: &VideoBackendAssetLoad) -> Option<Vec<DecodedGifFrame>> {
    let decoder = GifDecoder::new(Cursor::new(load.bytes.clone())).ok()?;
    let frames = decoder.into_frames().collect_frames().ok()?;
    if frames.is_empty() {
        return None;
    }
    let mut decoded = Vec::with_capacity(frames.len());
    for frame in frames {
        let duration = Duration::from(frame.delay());
        let duration_ms = if duration.is_zero() {
            DEFAULT_GIF_FRAME_DURATION_MS
        } else {
            duration.as_secs_f64() * 1000.0
        };
        let buffer = frame.into_buffer();
        decoded.push(DecodedGifFrame {
            width: buffer.width(),
            height: buffer.height(),
            rgba: buffer.into_raw(),
            duration_ms,
        });
    }
    Some(decoded)
}

fn package_metadata_for_stream(
    stream: &VideoBackendStreamState,
    load: &VideoBackendAssetLoad,
) -> VideoFramePackageMetadata {
    let mut metadata = VideoFramePackageMetadata {
        owner_package_id: load
            .package_id
            .clone()
            .or_else(|| single_package_candidate(stream)),
        required_package_ids: stream.package_candidates.clone(),
    };
    if let Some(owner) = &metadata.owner_package_id {
        metadata.required_package_ids.remove(owner);
    }
    metadata
}

fn single_package_candidate(stream: &VideoBackendStreamState) -> Option<String> {
    if stream.package_candidates.len() == 1 {
        stream.package_candidates.iter().next().cloned()
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;
    use std::collections::BTreeSet;
    use std::rc::Rc;

    use super::*;
    use image::codecs::gif::GifEncoder;
    use image::{Delay, Frame, Rgba, RgbaImage};
    use quajs_wgpu_renderer::video::{VideoBackendCommand, VideoBackendCommandKind};

    const ONE_PIXEL_GIF: &[u8] = &[
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00,
        0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
        0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
    ];

    #[test]
    fn decodes_package_loaded_gif_frame_texture() {
        let mut backend = GifNativeVideoBackend::new();
        let stream = stream_state(["runtime-pack", "base-pack"]);
        backend
            .apply_video_asset_loads(&[VideoBackendAssetLoad {
                stream_id: stream.id.clone(),
                resource_id: stream.decoder_resource_id.clone(),
                asset_type: stream.asset_type.clone(),
                asset_name: stream.asset_name.clone(),
                package_id: Some("runtime-pack".to_string()),
                bytes: ONE_PIXEL_GIF.to_vec(),
            }])
            .unwrap();

        backend
            .apply_video_commands(&plan_for(&stream, VideoBackendCommandKind::StartStream))
            .unwrap();

        let resources = backend.video_frame_resources();
        assert_eq!(
            resources
                .get(&stream.id)
                .map(|resource| &resource.resource_id),
            Some(&stream.texture_ring_resource_id)
        );
        let frames = backend.drain_video_frame_textures();
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].stream_id, stream.id);
        assert_eq!(frames[0].resource_id, stream.texture_ring_resource_id);
        assert_eq!((frames[0].width, frames[0].height), (1, 1));
        assert_eq!(frames[0].rgba.len(), 4);
        assert_eq!(frames[0].owner_package_id.as_deref(), Some("runtime-pack"));
        assert_eq!(
            frames[0].required_package_ids,
            BTreeSet::from(["base-pack".to_string()])
        );
    }

    #[test]
    fn ignores_unsupported_video_bytes_without_failing_frame() {
        let mut backend = GifNativeVideoBackend::new();
        let stream = stream_state(["runtime-pack"]);
        backend
            .apply_video_asset_loads(&[VideoBackendAssetLoad {
                stream_id: stream.id.clone(),
                resource_id: stream.decoder_resource_id.clone(),
                asset_type: stream.asset_type.clone(),
                asset_name: stream.asset_name.clone(),
                package_id: Some("runtime-pack".to_string()),
                bytes: b"not-a-gif".to_vec(),
            }])
            .unwrap();

        backend
            .apply_video_commands(&plan_for(&stream, VideoBackendCommandKind::StartStream))
            .unwrap();

        assert!(backend.video_frame_resources().is_empty());
        assert!(backend.drain_video_frame_textures().is_empty());
    }

    #[test]
    fn release_decoder_drains_texture_ring_release() {
        let mut backend = GifNativeVideoBackend::new();
        let stream = stream_state(["runtime-pack"]);
        backend
            .apply_video_asset_loads(&[VideoBackendAssetLoad {
                stream_id: stream.id.clone(),
                resource_id: stream.decoder_resource_id.clone(),
                asset_type: stream.asset_type.clone(),
                asset_name: stream.asset_name.clone(),
                package_id: Some("runtime-pack".to_string()),
                bytes: ONE_PIXEL_GIF.to_vec(),
            }])
            .unwrap();
        backend
            .apply_video_commands(&plan_for(&stream, VideoBackendCommandKind::StartStream))
            .unwrap();
        backend.drain_video_frame_textures();

        backend
            .apply_video_commands(&plan_for(&stream, VideoBackendCommandKind::ReleaseDecoder))
            .unwrap();

        assert!(backend.video_frame_resources().is_empty());
        assert_eq!(
            backend.drain_video_frame_texture_releases(),
            vec![stream.texture_ring_resource_id]
        );
    }

    #[test]
    fn advances_gif_frames_from_renderer_frame_ticks() {
        let clock = ManualClock::default();
        let mut backend = GifNativeVideoBackend::with_clock(clock.clone());
        let stream = stream_state(["runtime-pack"]);
        backend
            .apply_video_asset_loads(&[VideoBackendAssetLoad {
                stream_id: stream.id.clone(),
                resource_id: stream.decoder_resource_id.clone(),
                asset_type: stream.asset_type.clone(),
                asset_name: stream.asset_name.clone(),
                package_id: Some("runtime-pack".to_string()),
                bytes: two_frame_gif_bytes(),
            }])
            .unwrap();

        backend
            .apply_video_commands(&plan_for(&stream, VideoBackendCommandKind::StartStream))
            .unwrap();
        let first_frames = backend.drain_video_frame_textures();
        assert_eq!(first_frames.len(), 1);
        assert_eq!(first_frames[0].rgba, vec![0xff, 0x00, 0x00, 0xff]);

        backend
            .apply_video_commands(&tick_plan_for(&stream))
            .unwrap();
        assert!(backend.drain_video_frame_textures().is_empty());

        clock.set_ms(25);
        backend
            .apply_video_commands(&tick_plan_for(&stream))
            .unwrap();
        let second_frames = backend.drain_video_frame_textures();
        assert_eq!(second_frames.len(), 1);
        assert_eq!(second_frames[0].rgba, vec![0x00, 0x00, 0xff, 0xff]);

        clock.set_ms(45);
        backend
            .apply_video_commands(&tick_plan_for(&stream))
            .unwrap();
        let looped_frames = backend.drain_video_frame_textures();
        assert_eq!(looped_frames.len(), 1);
        assert_eq!(looped_frames[0].rgba, vec![0xff, 0x00, 0x00, 0xff]);
    }

    #[test]
    fn honors_projected_playback_rate_when_ticking_frames() {
        let clock = ManualClock::default();
        let mut backend = GifNativeVideoBackend::with_clock(clock.clone());
        let mut stream = stream_state(["runtime-pack"]);
        stream.playback_rate = 2.0;
        backend
            .apply_video_asset_loads(&[VideoBackendAssetLoad {
                stream_id: stream.id.clone(),
                resource_id: stream.decoder_resource_id.clone(),
                asset_type: stream.asset_type.clone(),
                asset_name: stream.asset_name.clone(),
                package_id: Some("runtime-pack".to_string()),
                bytes: two_frame_gif_bytes(),
            }])
            .unwrap();

        backend
            .apply_video_commands(&plan_for(&stream, VideoBackendCommandKind::StartStream))
            .unwrap();
        backend.drain_video_frame_textures();

        clock.set_ms(11);
        backend
            .apply_video_commands(&tick_plan_for(&stream))
            .unwrap();
        let frames = backend.drain_video_frame_textures();

        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].rgba, vec![0x00, 0x00, 0xff, 0xff]);
    }

    #[derive(Clone, Debug, Default)]
    struct ManualClock {
        now: Rc<Cell<Duration>>,
    }

    impl ManualClock {
        fn set_ms(&self, millis: u64) {
            self.now.set(Duration::from_millis(millis));
        }
    }

    impl NativeVideoClock for ManualClock {
        fn now(&self) -> Duration {
            self.now.get()
        }
    }

    fn two_frame_gif_bytes() -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = GifEncoder::new(&mut bytes);
            encoder
                .encode_frames([
                    gif_frame([0xff, 0x00, 0x00, 0xff]),
                    gif_frame([0x00, 0x00, 0xff, 0xff]),
                ])
                .unwrap();
        }
        bytes
    }

    fn gif_frame(rgba: [u8; 4]) -> Frame {
        Frame::from_parts(
            RgbaImage::from_pixel(1, 1, Rgba(rgba)),
            0,
            0,
            Delay::from_numer_denom_ms(20, 1),
        )
    }

    fn stream_state<const N: usize>(packages: [&str; N]) -> VideoBackendStreamState {
        VideoBackendStreamState {
            id: "background:video".to_string(),
            asset_type: "video".to_string(),
            asset_name: "movies/opening.gif".to_string(),
            looped: true,
            muted: true,
            volume: 1.0,
            playback_rate: 1.0,
            package_candidates: packages.into_iter().map(ToString::to_string).collect(),
            decoder_resource_id: ResourceId::from("video:decoder:video:movies/opening.gif"),
            frame_queue_resource_id: ResourceId::from("video:frame-queue:video:movies/opening.gif"),
            texture_ring_resource_id: ResourceId::from(
                "video:texture-ring:video:movies/opening.gif",
            ),
        }
    }

    fn plan_for(
        stream: &VideoBackendStreamState,
        kind: VideoBackendCommandKind,
    ) -> VideoBackendCommandPlan {
        VideoBackendCommandPlan {
            commands: vec![VideoBackendCommand {
                stream_id: stream.id.clone(),
                kind,
                stream: Some(stream.clone()),
            }],
            next_streams: Default::default(),
            skipped_asset_resource_ids: Vec::new(),
        }
    }

    fn tick_plan_for(stream: &VideoBackendStreamState) -> VideoBackendCommandPlan {
        VideoBackendCommandPlan {
            commands: Vec::new(),
            next_streams: BTreeMap::from([(stream.id.clone(), stream.clone())]),
            skipped_asset_resource_ids: Vec::new(),
        }
    }
}
