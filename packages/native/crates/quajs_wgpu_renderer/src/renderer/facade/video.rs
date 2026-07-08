use crate::resources::{NativeAssetRequestPlan, PackageUnloadPlan};
use crate::video::{
    plan_video_backend_commands, plan_video_backend_package_teardown_commands, NativeVideoBackend,
    NativeVideoBackendError, NativeVideoBackendResult,
};

use super::super::backend::NativeRenderBackend;
use super::super::resource_update::NativeRendererFrameUpdate;
use super::NativeRenderer;

impl<B, A, V, F> NativeRenderer<B, A, V, F>
where
    B: NativeRenderBackend,
    V: NativeVideoBackend,
{
    pub fn apply_video_update(
        &mut self,
        update: &NativeRendererFrameUpdate,
    ) -> NativeVideoBackendResult {
        if let Some(video_backend) = &mut self.video_backend {
            video_backend.apply_video_commands(&update.video_backend_commands)?;
            self.state
                .replace_video_backend_streams(update.video_backend_commands.next_streams.clone());
        }
        Ok(())
    }

    pub fn apply_video_teardown(&mut self) -> Result<(), NativeVideoBackendError> {
        if self.state.video_backend_streams().is_empty() {
            return Ok(());
        }

        let plan = plan_video_backend_commands(
            self.state.video_backend_streams(),
            None,
            &NativeAssetRequestPlan::default(),
        );

        if let Some(video_backend) = &mut self.video_backend {
            video_backend.apply_video_commands(&plan)?;
        }
        self.state.replace_video_backend_streams(plan.next_streams);

        Ok(())
    }

    pub fn apply_package_video_teardown(
        &mut self,
        unload_plan: &PackageUnloadPlan,
    ) -> NativeVideoBackendResult {
        if self.state.video_backend_streams().is_empty() {
            return Ok(());
        }

        let released_resource_ids = unload_plan.releasable.iter().cloned().collect();
        let plan = plan_video_backend_package_teardown_commands(
            self.state.video_backend_streams(),
            &released_resource_ids,
        );
        if plan.is_empty() {
            return Ok(());
        }

        let next_streams = plan.next_streams.clone();
        if let Some(video_backend) = &mut self.video_backend {
            video_backend.apply_video_commands(&plan)?;
        }
        self.state.replace_video_backend_streams(next_streams);

        Ok(())
    }
}
