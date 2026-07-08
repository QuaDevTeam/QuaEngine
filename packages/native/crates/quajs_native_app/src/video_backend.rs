use std::collections::BTreeMap;
use std::io::Cursor;

use image::codecs::gif::GifDecoder;
use image::AnimationDecoder;
use quajs_wgpu_renderer::resources::ResourceId;
use quajs_wgpu_renderer::video::{
    NativeVideoBackend, NativeVideoBackendResult, VideoBackendAssetLoad, VideoBackendCommandKind,
    VideoBackendCommandPlan, VideoBackendFrameResource, VideoBackendFrameResourceMap,
    VideoBackendFrameTexture, VideoBackendStreamState,
};

#[derive(Debug, Default)]
pub(crate) struct GifNativeVideoBackend {
    loaded_assets: BTreeMap<ResourceId, VideoBackendAssetLoad>,
    active_frame_resources: BTreeMap<String, ResourceId>,
    pending_frames: Vec<VideoBackendFrameTexture>,
    pending_releases: Vec<ResourceId>,
}

impl GifNativeVideoBackend {
    pub(crate) fn new() -> Self {
        Self::default()
    }
}

impl NativeVideoBackend for GifNativeVideoBackend {
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
        Ok(())
    }

    fn video_frame_resources(&self) -> VideoBackendFrameResourceMap {
        self.active_frame_resources
            .iter()
            .map(|(stream_id, resource_id)| {
                (
                    stream_id.clone(),
                    VideoBackendFrameResource {
                        stream_id: stream_id.clone(),
                        resource_id: resource_id.clone(),
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

impl GifNativeVideoBackend {
    fn start_stream(&mut self, stream: &VideoBackendStreamState) {
        self.publish_first_gif_frame(stream);
    }

    fn update_stream(&mut self, stream: &VideoBackendStreamState) {
        if !self.active_frame_resources.contains_key(&stream.id) {
            self.publish_first_gif_frame(stream);
        }
    }

    fn release_stream(&mut self, stream: &VideoBackendStreamState) {
        self.loaded_assets.remove(&stream.decoder_resource_id);
        let Some(resource_id) = self.active_frame_resources.remove(&stream.id) else {
            return;
        };
        if !self
            .active_frame_resources
            .values()
            .any(|active| active == &resource_id)
        {
            self.pending_releases.push(resource_id);
        }
    }

    fn publish_first_gif_frame(&mut self, stream: &VideoBackendStreamState) {
        let Some(load) = self.loaded_assets.get(&stream.decoder_resource_id) else {
            return;
        };
        let Some((width, height, rgba)) = decode_first_gif_frame(load) else {
            return;
        };

        let mut frame = VideoBackendFrameTexture::new(
            stream.id.clone(),
            stream.texture_ring_resource_id.clone(),
            width,
            height,
            rgba,
        );
        if let Some(owner) = load
            .package_id
            .clone()
            .or_else(|| single_package_candidate(stream))
        {
            frame.owner_package_id = Some(owner.clone());
            frame.required_package_ids.remove(&owner);
        }
        frame
            .required_package_ids
            .extend(stream.package_candidates.clone());
        if let Some(owner) = &frame.owner_package_id {
            frame.required_package_ids.remove(owner);
        }

        if let Some(previous) = self
            .active_frame_resources
            .insert(stream.id.clone(), stream.texture_ring_resource_id.clone())
        {
            if previous != stream.texture_ring_resource_id
                && !self
                    .active_frame_resources
                    .values()
                    .any(|active| active == &previous)
            {
                self.pending_releases.push(previous);
            }
        }
        self.pending_frames.push(frame);
    }
}

fn decode_first_gif_frame(load: &VideoBackendAssetLoad) -> Option<(u32, u32, Vec<u8>)> {
    let decoder = GifDecoder::new(Cursor::new(load.bytes.clone())).ok()?;
    let mut frames = decoder.into_frames();
    let frame = frames.next()?.ok()?;
    let buffer = frame.into_buffer();
    Some((buffer.width(), buffer.height(), buffer.into_raw()))
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
    use std::collections::BTreeSet;

    use super::*;
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
}
