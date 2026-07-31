use std::collections::BTreeMap;

use super::bind_group::RealRuntimeBindGroup;
use super::buffer::RealRuntimeBuffer;
use super::encoder::RealRuntimeEncoder;
use super::frame_target::{RealRuntimeFrameTarget, RealRuntimeFrameTargetSnapshot};
use super::pipeline::{
    create_real_text_atlas_bind_group_layout, create_real_texture_sampler_bind_group_layout,
    RealRuntimePipeline,
};
use super::target::RealWgpuNativeRenderRuntimeTarget;
use super::texture::RealRuntimeDecodedTexture;
use super::uniforms::RealRuntimeFrameUniforms;

#[derive(Debug)]
pub struct RealWgpuNativeRenderRuntimeDevice {
    pub(super) target: RealWgpuNativeRenderRuntimeTarget,
    pub(super) uniforms: RealRuntimeFrameUniforms,
    pub(super) texture_sampler_bind_group_layout: wgpu::BindGroupLayout,
    pub(super) text_atlas_bind_group_layout: wgpu::BindGroupLayout,
    pub(super) buffers: BTreeMap<String, RealRuntimeBuffer>,
    pub(super) pipelines: BTreeMap<String, RealRuntimePipeline>,
    pub(super) bind_groups: BTreeMap<String, RealRuntimeBindGroup>,
    pub(super) decoded_textures: BTreeMap<String, RealRuntimeDecodedTexture>,
    pub(super) frame_target: RealRuntimeFrameTarget,
    /// Persistent texture used as the source for `BackdropBlur` draws.  Created
    /// on first `CopyFramebufferToBackdrop` and recreated whenever the frame
    /// dimensions change.
    pub(super) backdrop_texture: Option<wgpu::Texture>,
    pub(super) active_encoder: Option<RealRuntimeEncoder>,
    pub(super) submitted_command_buffer_count: usize,
}

impl Clone for RealWgpuNativeRenderRuntimeDevice {
    fn clone(&self) -> Self {
        debug_assert!(
            self.active_encoder.is_none(),
            "committed real-wgpu runtime device should not retain an active encoder"
        );
        Self {
            target: self.target.clone(),
            uniforms: self.uniforms.clone(),
            texture_sampler_bind_group_layout: self.texture_sampler_bind_group_layout.clone(),
            text_atlas_bind_group_layout: self.text_atlas_bind_group_layout.clone(),
            buffers: self.buffers.clone(),
            pipelines: self.pipelines.clone(),
            bind_groups: self.bind_groups.clone(),
            decoded_textures: self.decoded_textures.clone(),
            frame_target: self.frame_target.clone(),
            backdrop_texture: self.backdrop_texture.clone(),
            active_encoder: None,
            submitted_command_buffer_count: self.submitted_command_buffer_count,
        }
    }
}

impl RealWgpuNativeRenderRuntimeDevice {
    pub fn new(target: RealWgpuNativeRenderRuntimeTarget) -> Self {
        let uniforms = RealRuntimeFrameUniforms::new(&target);
        let texture_sampler_bind_group_layout =
            create_real_texture_sampler_bind_group_layout(&target);
        let text_atlas_bind_group_layout = create_real_text_atlas_bind_group_layout(&target);
        let frame_target = RealRuntimeFrameTarget::new(&target);
        Self {
            target,
            uniforms,
            texture_sampler_bind_group_layout,
            text_atlas_bind_group_layout,
            buffers: BTreeMap::new(),
            pipelines: BTreeMap::new(),
            bind_groups: BTreeMap::new(),
            decoded_textures: BTreeMap::new(),
            frame_target,
            backdrop_texture: None,
            active_encoder: None,
            submitted_command_buffer_count: 0,
        }
    }

    pub fn target(&self) -> &RealWgpuNativeRenderRuntimeTarget {
        &self.target
    }

    pub fn frame_target_snapshot(&self) -> RealRuntimeFrameTargetSnapshot {
        self.frame_target.snapshot()
    }
}
