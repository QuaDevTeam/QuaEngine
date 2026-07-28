use super::RealWgpuNativeRenderRuntimeTarget;

#[derive(Clone, Debug)]
pub(super) struct RealRuntimeFrameTarget {
    texture: wgpu::Texture,
    view: wgpu::TextureView,
    extent: wgpu::Extent3d,
    color_format: wgpu::TextureFormat,
    completed_pass_count: usize,
    clear_next_pass: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RealRuntimeFrameTargetSnapshot {
    pub extent: wgpu::Extent3d,
    pub color_format: wgpu::TextureFormat,
    pub completed_pass_count: usize,
}

impl RealRuntimeFrameTarget {
    pub(super) fn new(target: &RealWgpuNativeRenderRuntimeTarget) -> Self {
        let texture = create_frame_texture(target);
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        Self {
            texture,
            view,
            extent: target.extent(),
            color_format: target.frame_color_format(),
            completed_pass_count: 0,
            clear_next_pass: true,
        }
    }

    pub(super) fn begin_frame(&mut self, target: &RealWgpuNativeRenderRuntimeTarget) {
        if self.extent != target.extent() || self.color_format != target.frame_color_format() {
            *self = Self::new(target);
            return;
        }
        self.completed_pass_count = 0;
        self.clear_next_pass = true;
    }

    pub(super) fn view(&self) -> &wgpu::TextureView {
        &self.view
    }

    pub(super) fn texture(&self) -> &wgpu::Texture {
        &self.texture
    }

    pub(super) fn extent(&self) -> wgpu::Extent3d {
        self.extent
    }

    pub(super) fn color_format(&self) -> wgpu::TextureFormat {
        self.color_format
    }

    pub(super) fn completed_pass_count(&self) -> usize {
        self.completed_pass_count
    }

    pub(super) fn load_op(&self) -> wgpu::LoadOp<wgpu::Color> {
        if self.clear_next_pass {
            wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT)
        } else {
            wgpu::LoadOp::Load
        }
    }

    pub(super) fn finish_pass(&mut self) {
        self.completed_pass_count += 1;
        self.clear_next_pass = false;
    }

    pub(super) fn snapshot(&self) -> RealRuntimeFrameTargetSnapshot {
        RealRuntimeFrameTargetSnapshot {
            extent: self.extent,
            color_format: self.color_format,
            completed_pass_count: self.completed_pass_count,
        }
    }
}

fn create_frame_texture(target: &RealWgpuNativeRenderRuntimeTarget) -> wgpu::Texture {
    target.device().create_texture(&wgpu::TextureDescriptor {
        label: Some("qua-native-frame-target"),
        size: target.extent(),
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: target.frame_color_format(),
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    })
}

#[cfg(all(test, feature = "real-wgpu-noop"))]
mod tests {
    use super::*;

    #[test]
    fn load_op_clears_first_pass_and_loads_following_passes() {
        let target = RealWgpuNativeRenderRuntimeTarget::noop(320, 180);
        let mut frame_target = RealRuntimeFrameTarget::new(&target);

        assert!(matches!(
            frame_target.load_op(),
            wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT)
        ));
        frame_target.finish_pass();
        assert!(matches!(frame_target.load_op(), wgpu::LoadOp::Load));
        assert_eq!(frame_target.snapshot().completed_pass_count, 1);

        frame_target.begin_frame(&target);
        assert!(matches!(
            frame_target.load_op(),
            wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT)
        ));
        assert_eq!(frame_target.snapshot().completed_pass_count, 0);
    }

    #[test]
    fn composites_in_the_non_srgb_variant_of_the_presentation_format() {
        // Blending has to happen on sRGB-encoded values to match CSS. An sRGB
        // attachment would make the fixed-function blender decode to linear
        // light first, which composites translucent layers noticeably brighter
        // than the Web target. Presenting stays a raw copy, so the swapchain
        // still receives the same bytes.
        let target = RealWgpuNativeRenderRuntimeTarget::noop(320, 180);
        assert!(target.color_format().is_srgb());

        let frame_target = RealRuntimeFrameTarget::new(&target);

        assert!(!frame_target.color_format().is_srgb());
        assert_eq!(
            frame_target.color_format(),
            target.color_format().remove_srgb_suffix()
        );
        assert_eq!(frame_target.texture().format(), frame_target.color_format());
    }
}
