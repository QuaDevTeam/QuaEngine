use super::pass::validate_pass_viewport;
use super::{
    invalid_order, materialize_pass, validate_materializable_pass, RealRuntimePass,
    RealWgpuNativeRenderRuntimeDevice, WgpuNativeRenderRuntimeError,
    WgpuNativeRenderRuntimeErrorKind,
};
use crate::renderer::backend::wgpu::WgpuPhysicalRect;

#[derive(Debug)]
pub(super) struct RealRuntimeEncoder {
    pub(super) label: String,
    pub(super) encoder: wgpu::CommandEncoder,
    pub(super) active_pass: Option<RealRuntimePass>,
}

impl RealWgpuNativeRenderRuntimeDevice {
    pub(super) fn active_pass_ref(&self) -> Option<&RealRuntimePass> {
        self.active_encoder
            .as_ref()
            .and_then(|encoder| encoder.active_pass.as_ref())
    }

    pub(super) fn create_encoder(
        &mut self,
        label: &str,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        if self.active_encoder.is_some() {
            return invalid_order("cannot create encoder while another encoder is active");
        }
        let encoder = self
            .target
            .device()
            .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some(label) });
        self.active_encoder = Some(RealRuntimeEncoder {
            label: label.to_string(),
            encoder,
            active_pass: None,
        });
        Ok(())
    }

    pub(super) fn begin_pass(
        &mut self,
        encoder_label: &str,
        pass_label: &str,
        viewport: WgpuPhysicalRect,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        validate_pass_viewport(pass_label, viewport, self.target.extent())?;
        let encoder = self.active_encoder_mut(encoder_label)?;
        if encoder.active_pass.is_some() {
            return invalid_order("cannot begin render pass while another pass is active");
        }
        encoder.active_pass = Some(RealRuntimePass {
            label: pass_label.to_string(),
            viewport,
            vertex_buffer_label: None,
            index_buffer_label: None,
            pipeline_cache_label: None,
            bind_group_cache_label: None,
            draws: Vec::new(),
        });
        Ok(())
    }

    pub(super) fn end_pass(
        &mut self,
        pass_label: &str,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        self.validate_active_pass_materializable(pass_label)?;
        let target = self.target.clone();
        let mut encoder = self.active_encoder.take().ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
                "cannot end render pass without an active encoder",
            )
        })?;
        let pass = match encoder.active_pass.take() {
            Some(pass) if pass.label == pass_label => pass,
            Some(pass) => {
                encoder.active_pass = Some(pass);
                self.active_encoder = Some(encoder);
                return invalid_order(format!(
                    "active render pass does not match command pass '{pass_label}'"
                ));
            }
            None => {
                self.active_encoder = Some(encoder);
                return invalid_order("render pass command emitted without an active pass");
            }
        };
        let materialized = materialize_pass(
            &target,
            &mut self.frame_target,
            &self.uniforms,
            &self.buffers,
            &self.pipelines,
            &self.bind_groups,
            &mut encoder.encoder,
            pass,
        );
        self.active_encoder = Some(encoder);
        materialized?;
        Ok(())
    }

    pub(super) fn submit_encoder(
        &mut self,
        encoder_label: &str,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        let encoder = self.active_encoder.take().ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
                "cannot submit command buffer without an active encoder",
            )
        })?;
        if encoder.label != encoder_label {
            self.active_encoder = Some(encoder);
            return invalid_order(format!(
                "active encoder does not match submitted encoder '{encoder_label}'"
            ));
        }
        if encoder.active_pass.is_some() {
            self.active_encoder = Some(encoder);
            return invalid_order("cannot submit command buffer while a render pass is active");
        }
        let command_buffer = encoder.encoder.finish();
        self.target.queue().submit([command_buffer]);
        self.submitted_command_buffer_count += 1;
        Ok(())
    }

    pub(super) fn require_active_pass(
        &self,
        pass_label: &str,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        let active = self
            .active_encoder
            .as_ref()
            .and_then(|encoder| encoder.active_pass.as_ref())
            .map(|pass| pass.label.as_str());
        match active {
            Some(active) if active == pass_label => Ok(()),
            Some(active) => invalid_order(format!(
                "active render pass '{active}' does not match command pass '{pass_label}'"
            )),
            None => invalid_order("render pass command emitted without an active pass"),
        }
    }

    pub(super) fn active_pass_mut(
        &mut self,
        pass_label: &str,
    ) -> Result<&mut RealRuntimePass, WgpuNativeRenderRuntimeError> {
        let encoder = self.active_encoder_any_mut()?;
        let pass = encoder.active_pass.as_mut().ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
                "render pass command emitted without an active pass",
            )
        })?;
        if pass.label != pass_label {
            return invalid_order(format!(
                "active render pass '{}' does not match command pass '{pass_label}'",
                pass.label
            ));
        }
        Ok(pass)
    }

    fn validate_active_pass_materializable(
        &self,
        pass_label: &str,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        let encoder = self.active_encoder.as_ref().ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
                "cannot end render pass without an active encoder",
            )
        })?;
        let pass = encoder.active_pass.as_ref().ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
                "render pass command emitted without an active pass",
            )
        })?;
        if pass.label != pass_label {
            return invalid_order(format!(
                "active render pass '{}' does not match command pass '{pass_label}'",
                pass.label
            ));
        }
        validate_materializable_pass(
            &self.target,
            &self.buffers,
            &self.pipelines,
            &self.bind_groups,
            pass,
        )
    }

    fn active_encoder_mut(
        &mut self,
        encoder_label: &str,
    ) -> Result<&mut RealRuntimeEncoder, WgpuNativeRenderRuntimeError> {
        let encoder = self.active_encoder_any_mut()?;
        if encoder.label != encoder_label {
            return invalid_order(format!(
                "active encoder '{}' does not match pass encoder '{encoder_label}'",
                encoder.label
            ));
        }
        Ok(encoder)
    }

    pub(in super::super) fn active_encoder_any_mut(
        &mut self,
    ) -> Result<&mut RealRuntimeEncoder, WgpuNativeRenderRuntimeError> {
        self.active_encoder.as_mut().ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
                "cannot access command encoder without an active encoder",
            )
        })
    }
}
