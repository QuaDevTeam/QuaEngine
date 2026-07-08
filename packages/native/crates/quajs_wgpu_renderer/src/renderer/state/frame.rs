use std::collections::BTreeSet;

use crate::audio::plan_audio_backend_commands;
use crate::fonts::plan_font_backend_commands;
use crate::frame::prepare_native_frame_with_video_frame_resources;
use crate::projection::audio::AudioProjection;
use crate::projection::fonts::FontsProjection;
use crate::projection::view::ViewProjection;
use crate::renderer::resource_update::{
    apply_audio_resource_sync, apply_font_resource_sync, apply_resource_sync,
    frame_audio_resource_sync_summary, frame_font_resource_sync_summary,
    frame_resource_sync_summary, host_cleanup_records, NativeRendererFrameUpdate,
};
use crate::resources::{
    audio_resource_records, font_resource_records, plan_audio_asset_requests,
    plan_audio_resource_sync, plan_font_asset_requests, plan_font_resource_sync,
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
        let frame = prepare_native_frame_with_video_frame_resources(
            layout,
            view,
            &self.video_backend_frame_resources,
        );
        let resource_sync = plan_frame_resource_sync(&self.resources, &frame.resources);
        let texture_uploads = plan_texture_upload_requests(&frame.assets);
        let audio_resource_sync = plan_audio_resource_sync(&self.resources, view.audio.as_ref());
        let audio_assets = plan_audio_asset_requests(&self.resources, &audio_resource_sync);
        let fonts = view
            .plugins
            .as_ref()
            .and_then(|plugins| plugins.fonts.as_ref());
        let font_resource_sync = plan_font_resource_sync(&self.resources, fonts);
        let font_assets = plan_font_asset_requests(&self.resources, &font_resource_sync);
        let audio_backend_commands = plan_audio_backend_commands(
            &self.audio_backend_tracks,
            view.audio.as_ref(),
            &audio_assets,
        );
        let font_backend_commands =
            plan_font_backend_commands(&self.font_backend_faces, fonts, &font_assets);
        let video_backend_commands = plan_video_backend_commands(
            &self.video_backend_streams,
            view.background.as_ref(),
            &frame.assets,
        );
        let mut released_resources = apply_resource_sync(&mut self.resources, &resource_sync);
        let audio_released_resources =
            apply_audio_resource_sync(&mut self.resources, &audio_resource_sync);
        let font_released_resources =
            apply_font_resource_sync(&mut self.resources, &font_resource_sync);
        let resource_sync_summary =
            frame_resource_sync_summary(&resource_sync, &released_resources);
        let audio_resource_sync_summary =
            frame_audio_resource_sync_summary(&audio_resource_sync, &audio_released_resources);
        let font_resource_sync_summary =
            frame_font_resource_sync_summary(&font_resource_sync, &font_released_resources);

        released_resources.extend(audio_released_resources);
        released_resources.extend(font_released_resources);

        self.revision = self.revision.saturating_add(1);
        self.active_audio_resource_ids = active_audio_resource_ids(view.audio.as_ref());
        self.active_font_resource_ids = active_font_resource_ids(fonts);
        self.audio_backend_tracks = audio_backend_commands.next_tracks.clone();
        self.font_backend_faces = font_backend_commands.next_faces.clone();
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
            font_resource_sync,
            font_resource_sync_summary,
            font_assets,
            font_backend_commands,
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

fn active_font_resource_ids(
    fonts: Option<&FontsProjection>,
) -> BTreeSet<crate::resources::ResourceId> {
    font_resource_records(fonts)
        .into_iter()
        .map(|record| record.id)
        .collect()
}
