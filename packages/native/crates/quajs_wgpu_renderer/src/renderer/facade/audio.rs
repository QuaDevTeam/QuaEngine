use crate::audio::{
    plan_audio_backend_commands, plan_audio_backend_package_teardown_commands, NativeAudioBackend,
    NativeAudioBackendError, NativeAudioBackendResult,
};
use crate::projection::view::ViewProjection;
use crate::resources::{NativeAssetRequestPlan, NativeResourceRecord, PackageUnloadPlan};
use crate::stage_layout::ResolvedStageLayout;

use super::super::backend::NativeRenderBackend;
use super::super::resource_update::{
    NativeRendererFrameUpdate, NativeRendererHostCleanupRecord, NativeRendererPackageRelease,
};
use super::{NativeRenderer, NativeRendererFrameError, NativeRendererFrameResult};

impl<B, A> NativeRenderer<B, A>
where
    B: NativeRenderBackend,
    A: NativeAudioBackend,
{
    pub fn apply_audio_update(
        &mut self,
        update: &NativeRendererFrameUpdate,
    ) -> NativeAudioBackendResult {
        if let Some(audio_backend) = &mut self.audio_backend {
            audio_backend.apply_audio_commands(&update.audio_backend_commands)?;
            self.state
                .replace_audio_backend_tracks(update.audio_backend_commands.next_tracks.clone());
        }
        Ok(())
    }

    pub fn prepare_frame_and_apply_audio(
        &mut self,
        layout: ResolvedStageLayout,
        view: &ViewProjection,
    ) -> Result<NativeRendererFrameUpdate, NativeAudioBackendError> {
        let previous_state = self.state.clone();
        let update = self.prepare_frame(layout, view);
        if let Err(error) = self.apply_audio_update(&update) {
            self.state = previous_state;
            return Err(error);
        }
        Ok(update)
    }

    pub fn prepare_render_and_apply_audio(
        &mut self,
        layout: ResolvedStageLayout,
        view: &ViewProjection,
    ) -> Result<NativeRendererFrameResult, NativeRendererFrameError> {
        let previous_state = self.state.clone();
        let update = self.prepare_frame(layout, view);
        let submission = match self.render_frame() {
            Ok(submission) => submission,
            Err(error) => {
                self.state = previous_state;
                return Err(error.into());
            }
        };
        let texture_upload_sync = self.texture_upload_sync_for_update(&update);
        if let Err(error) = self.apply_audio_update(&update) {
            self.state = previous_state;
            return Err(error.into());
        }

        Ok(NativeRendererFrameResult {
            update,
            submission,
            texture_upload_sync,
        })
    }

    pub fn clear_and_apply_audio_teardown(
        &mut self,
    ) -> Result<Vec<NativeResourceRecord>, NativeAudioBackendError> {
        self.apply_audio_teardown()?;
        Ok(self.clear())
    }

    pub fn clear_with_host_cleanup_and_audio_teardown(
        &mut self,
    ) -> Result<
        (
            Vec<NativeResourceRecord>,
            Vec<NativeRendererHostCleanupRecord>,
        ),
        NativeAudioBackendError,
    > {
        self.apply_audio_teardown()?;
        Ok(self.clear_with_host_cleanup())
    }

    pub fn release_package_resources_and_apply_audio_teardown(
        &mut self,
        package_id: &str,
    ) -> Result<NativeRendererPackageRelease, NativeAudioBackendError> {
        let plan = self.plan_package_unload(package_id);
        if plan.can_unload() {
            self.apply_package_audio_teardown(&plan)?;
        }
        Ok(self.release_package_resources(package_id))
    }

    fn apply_audio_teardown(&mut self) -> NativeAudioBackendResult {
        if self.state.audio_backend_tracks().is_empty() {
            return Ok(());
        }

        let plan = plan_audio_backend_commands(
            self.state.audio_backend_tracks(),
            None,
            &NativeAssetRequestPlan::default(),
        );

        if let Some(audio_backend) = &mut self.audio_backend {
            audio_backend.apply_audio_commands(&plan)?;
        }

        Ok(())
    }

    fn apply_package_audio_teardown(
        &mut self,
        unload_plan: &PackageUnloadPlan,
    ) -> NativeAudioBackendResult {
        if self.state.audio_backend_tracks().is_empty() {
            return Ok(());
        }

        let released_resource_ids = unload_plan.releasable.iter().cloned().collect();
        let plan = plan_audio_backend_package_teardown_commands(
            self.state.audio_backend_tracks(),
            &released_resource_ids,
        );
        if plan.is_empty() {
            return Ok(());
        }

        let next_tracks = plan.next_tracks.clone();
        if let Some(audio_backend) = &mut self.audio_backend {
            audio_backend.apply_audio_commands(&plan)?;
        }
        self.state.replace_audio_backend_tracks(next_tracks);

        Ok(())
    }
}
