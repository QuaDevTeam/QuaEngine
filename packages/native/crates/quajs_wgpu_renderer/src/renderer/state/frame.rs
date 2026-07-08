use std::collections::BTreeSet;

use crate::audio::plan_audio_backend_commands;
use crate::frame::prepare_native_frame;
use crate::projection::audio::AudioProjection;
use crate::projection::view::ViewProjection;
use crate::renderer::resource_update::{
    apply_audio_resource_sync, apply_resource_sync, frame_audio_resource_sync_summary,
    frame_resource_sync_summary, host_cleanup_records, NativeRendererFrameUpdate,
};
use crate::resources::{
    audio_resource_records, plan_audio_asset_requests, plan_audio_resource_sync,
    plan_frame_resource_sync, plan_texture_upload_requests,
};
use crate::stage_layout::ResolvedStageLayout;
use crate::video::plan_video_backend_commands;

use super::NativeRendererState;

impl NativeRendererState {
    pub fn prepare_frame(
        &mut self,
        layout: ResolvedStageLayout,
        view: &ViewProjection,
    ) -> NativeRendererFrameUpdate {
        let frame = prepare_native_frame(layout, view);
        let resource_sync = plan_frame_resource_sync(&self.resources, &frame.resources);
        let texture_uploads = plan_texture_upload_requests(&frame.assets);
        let audio_resource_sync = plan_audio_resource_sync(&self.resources, view.audio.as_ref());
        let audio_assets = plan_audio_asset_requests(&self.resources, &audio_resource_sync);
        let audio_backend_commands = plan_audio_backend_commands(
            &self.audio_backend_tracks,
            view.audio.as_ref(),
            &audio_assets,
        );
        let video_backend_commands = plan_video_backend_commands(
            &self.video_backend_streams,
            view.background.as_ref(),
            &frame.assets,
        );
        let mut released_resources = apply_resource_sync(&mut self.resources, &resource_sync);
        let audio_released_resources =
            apply_audio_resource_sync(&mut self.resources, &audio_resource_sync);
        let resource_sync_summary =
            frame_resource_sync_summary(&resource_sync, &released_resources);
        let audio_resource_sync_summary =
            frame_audio_resource_sync_summary(&audio_resource_sync, &audio_released_resources);

        released_resources.extend(audio_released_resources);

        self.revision = self.revision.saturating_add(1);
        self.active_audio_resource_ids = active_audio_resource_ids(view.audio.as_ref());
        self.audio_backend_tracks = audio_backend_commands.next_tracks.clone();
        self.video_backend_streams = video_backend_commands.next_streams.clone();
        self.frame = Some(frame);

        NativeRendererFrameUpdate {
            revision: self.revision,
            resource_sync,
            host_cleanup: host_cleanup_records(&released_resources),
            released_resources,
            resource_sync_summary,
            texture_uploads,
            audio_resource_sync,
            audio_resource_sync_summary,
            audio_assets,
            audio_backend_commands,
            video_backend_commands,
        }
    }
}

fn active_audio_resource_ids(
    audio: Option<&AudioProjection>,
) -> BTreeSet<crate::resources::ResourceId> {
    audio_resource_records(audio)
        .into_iter()
        .map(|record| record.id)
        .collect()
}
