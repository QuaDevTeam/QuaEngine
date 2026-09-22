#[cfg(all(target_os = "macos", feature = "real-wgpu-native"))]
use objc2_metal::MTLDevice;
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
    pub(super) image_cache: super::image_cache::ImageCache,
    #[cfg(feature = "image-decode")]
    pub(super) async_textures: Option<std::sync::Arc<super::async_textures::AsyncTextures>>,
    pub(super) composite_groups: BTreeMap<String, Vec<crate::render_graph::DrawCompositeGroup>>,
    pub(super) compositor: Option<super::pass::composite::Compositor>,
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
    /// on the first backdrop draw and recreated whenever the frame
    /// dimensions change.
    pub(super) backdrop_resources: super::resources::backdrop::BackdropResources,
    pub(super) active_encoder: Option<RealRuntimeEncoder>,
    pub(super) last_draw_calls: u64,
    pub(super) submitted_command_buffer_count: usize,
    pub(super) pending_submissions: std::collections::VecDeque<wgpu::SubmissionIndex>,
}

impl Clone for RealWgpuNativeRenderRuntimeDevice {
    fn clone(&self) -> Self {
        debug_assert!(
            self.active_encoder.is_none(),
            "committed real-wgpu runtime device should not retain an active encoder"
        );
        Self {
            #[cfg(feature = "image-decode")]
            async_textures: self.async_textures.clone(),
            image_cache: self.image_cache.clone(),
            composite_groups: self.composite_groups.clone(),
            compositor: self.compositor.clone(),
            target: self.target.clone(),
            uniforms: self.uniforms.clone(),
            texture_sampler_bind_group_layout: self.texture_sampler_bind_group_layout.clone(),
            text_atlas_bind_group_layout: self.text_atlas_bind_group_layout.clone(),
            buffers: self.buffers.clone(),
            pipelines: self.pipelines.clone(),
            bind_groups: self.bind_groups.clone(),
            decoded_textures: self.decoded_textures.clone(),
            frame_target: self.frame_target.clone(),
            backdrop_resources: self.backdrop_resources.clone(),
            active_encoder: None,
            last_draw_calls: self.last_draw_calls,
            submitted_command_buffer_count: self.submitted_command_buffer_count,
            pending_submissions: self.pending_submissions.clone(),
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
            #[cfg(feature = "image-decode")]
            async_textures: None,
            image_cache: Default::default(),
            composite_groups: BTreeMap::new(),
            compositor: None,
            target,
            uniforms,
            texture_sampler_bind_group_layout,
            text_atlas_bind_group_layout,
            buffers: BTreeMap::new(),
            pipelines: BTreeMap::new(),
            bind_groups: BTreeMap::new(),
            decoded_textures: BTreeMap::new(),
            frame_target,
            backdrop_resources: Default::default(),
            active_encoder: None,
            last_draw_calls: 0,
            submitted_command_buffer_count: 0,
            pending_submissions: Default::default(),
        }
    }

    /// Actual encoded draws in the most recently submitted command buffer,
    /// including offscreen composition and shadow/backdrop passes.
    pub fn background_shader_status(&self, source: &str) -> Result<bool, String> {
        self.compositor
            .as_ref()
            .map_or(Ok(false), |compositor| compositor.transition_status(source))
    }

    pub fn last_draw_calls(&self) -> u64 {
        self.last_draw_calls
    }

    /// Driver allocation, not an estimate of texture payloads. On Apple Silicon
    /// this is unified memory allocated through this Metal device, not VRAM.
    pub fn allocated_gpu_bytes(&self) -> Option<u64> {
        #[cfg(all(target_os = "macos", feature = "real-wgpu-native"))]
        unsafe {
            if let Some(device) = self.target.device().as_hal::<wgpu::hal::api::Metal>() {
                return Some(device.raw_device().currentAllocatedSize() as u64);
            }
        }
        self.target
            .device()
            .generate_allocator_report()
            .map(|report| report.total_allocated_bytes)
    }

    pub fn target(&self) -> &RealWgpuNativeRenderRuntimeTarget {
        &self.target
    }

    pub fn frame_target_snapshot(&self) -> RealRuntimeFrameTargetSnapshot {
        self.frame_target.snapshot()
    }
}
