use crate::fonts::{
    plan_font_backend_commands, plan_font_backend_package_teardown_commands, NativeFontBackend,
    NativeFontBackendError, NativeFontBackendResult,
};
use crate::projection::view::ViewProjection;
use crate::resources::{NativeAssetRequestPlan, PackageUnloadPlan};
use crate::stage_layout::ResolvedStageLayout;

use super::super::backend::NativeRenderBackend;
use super::super::resource_update::NativeRendererFrameUpdate;
use super::NativeRenderer;

impl<B, A, V, F> NativeRenderer<B, A, V, F>
where
    B: NativeRenderBackend,
    F: NativeFontBackend,
{
    pub fn apply_font_update(
        &mut self,
        update: &NativeRendererFrameUpdate,
    ) -> NativeFontBackendResult {
        if let Some(font_backend) = &mut self.font_backend {
            font_backend.apply_font_commands(&update.font_backend_commands)?;
            self.state
                .replace_font_backend_faces(update.font_backend_commands.next_faces.clone());
        }
        Ok(())
    }

    pub fn prepare_frame_and_apply_font(
        &mut self,
        layout: ResolvedStageLayout,
        view: &ViewProjection,
    ) -> Result<NativeRendererFrameUpdate, NativeFontBackendError> {
        let previous_state = self.state.clone();
        let update = self.prepare_frame(layout, view);
        if let Err(error) = self.apply_font_update(&update) {
            self.state = previous_state;
            return Err(error);
        }
        Ok(update)
    }

    pub fn apply_font_teardown(&mut self) -> NativeFontBackendResult {
        if self.state.font_backend_faces().is_empty() {
            return Ok(());
        }

        let plan = plan_font_backend_commands(
            self.state.font_backend_faces(),
            None,
            &NativeAssetRequestPlan::default(),
        );

        if let Some(font_backend) = &mut self.font_backend {
            font_backend.apply_font_commands(&plan)?;
        }
        self.state.replace_font_backend_faces(plan.next_faces);

        Ok(())
    }

    pub fn apply_package_font_teardown(
        &mut self,
        unload_plan: &PackageUnloadPlan,
    ) -> NativeFontBackendResult {
        if self.state.font_backend_faces().is_empty() {
            return Ok(());
        }

        let released_resource_ids = unload_plan.releasable.iter().cloned().collect();
        let plan = plan_font_backend_package_teardown_commands(
            self.state.font_backend_faces(),
            &released_resource_ids,
        );
        if plan.is_empty() {
            return Ok(());
        }

        let next_faces = plan.next_faces.clone();
        if let Some(font_backend) = &mut self.font_backend {
            font_backend.apply_font_commands(&plan)?;
        }
        self.state.replace_font_backend_faces(next_faces);

        Ok(())
    }
}
