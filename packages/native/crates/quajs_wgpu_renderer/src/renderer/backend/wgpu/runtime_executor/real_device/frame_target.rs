use super::RealWgpuNativeRenderRuntimeTarget;

#[derive(Clone, Debug)]
pub(super) struct RealRuntimeFrameTarget {
    texture: wgpu::Texture,
    view: wgpu::TextureView,
    multisample: Option<(wgpu::Texture, wgpu::TextureView)>,
    sample_count: u32,
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
    pub sample_count: u32,
}

impl RealRuntimeFrameTarget {
    pub(super) fn new(target: &RealWgpuNativeRenderRuntimeTarget) -> Self {
        let texture = create_frame_texture(target);
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        Self {
            texture,
            view,
            multisample: if target.sample_count() > 1 {
                let attachment = target.device().create_texture(&wgpu::TextureDescriptor {
                    label: Some("qua-native-frame-msaa"),
                    size: target.extent(),
                    mip_level_count: 1,
                    sample_count: target.sample_count(),
                    dimension: wgpu::TextureDimension::D2,
                    format: target.frame_color_format(),
                    usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                    view_formats: &[],
                });
                let view = attachment.create_view(&wgpu::TextureViewDescriptor::default());
                Some((attachment, view))
            } else {
                None
            },
            sample_count: target.sample_count(),
            extent: target.extent(),
            color_format: target.frame_color_format(),
            completed_pass_count: 0,
            clear_next_pass: true,
        }
    }

    pub(super) fn begin_frame(&mut self, target: &RealWgpuNativeRenderRuntimeTarget) {
        if self.extent != target.extent()
            || self.color_format != target.frame_color_format()
            || self.sample_count != target.sample_count()
        {
            *self = Self::new(target);
            return;
        }
        self.completed_pass_count = 0;
        self.clear_next_pass = true;
    }

    pub(super) fn view(&self) -> &wgpu::TextureView {
        &self.view
    }

    /// Retain multisample contents across subpasses; resolve after each pass
    /// for backdrop captures, nested groups, presentation and PNG readback.
    pub(super) fn attachment_view(&self) -> &wgpu::TextureView {
        self.multisample
            .as_ref()
            .map_or(&self.view, |(_, view)| view)
    }

    pub(super) fn resolve_view(&self) -> Option<&wgpu::TextureView> {
        self.multisample.as_ref().map(|_| &self.view)
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
            sample_count: self.sample_count,
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
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT
            | wgpu::TextureUsages::COPY_SRC
            | wgpu::TextureUsages::TEXTURE_BINDING,
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
    fn msaa_resolves_to_a_single_sample_image_and_recreates_on_resize() {
        let mut target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64).with_msaa_samples(4);
        let mut frame = RealRuntimeFrameTarget::new(&target);
        assert_eq!(frame.texture().sample_count(), 1);
        assert_eq!(frame.multisample.as_ref().unwrap().0.sample_count(), 4);
        assert!(frame.resolve_view().is_some());
        frame.finish_pass();
        assert!(matches!(frame.load_op(), wgpu::LoadOp::Load));
        target.resize(
            target.color_format(),
            wgpu::Extent3d {
                width: 96,
                height: 32,
                depth_or_array_layers: 1,
            },
        );
        frame.begin_frame(&target);
        assert_eq!(frame.multisample.as_ref().unwrap().0.width(), 96);
        assert_eq!(frame.snapshot().sample_count, 4);
        assert_eq!(frame.completed_pass_count(), 0);
        assert!(matches!(frame.load_op(), wgpu::LoadOp::Clear(_)));
        let unlit = RealRuntimeFrameTarget::new(&RealWgpuNativeRenderRuntimeTarget::noop(64, 64));
        assert!(unlit.multisample.is_none());
        assert!(unlit.resolve_view().is_none());
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
