use super::super::RealWgpuNativeRenderRuntimeTarget;
use super::*;
use wgpu::CompositeAlphaMode::{Opaque, PostMultiplied, PreMultiplied};
use wgpu::TextureFormat::{Rgba16Float, Rgba8UnormSrgb};

#[cfg(feature = "real-wgpu-noop")]
#[test]
fn changed_drawable_extent_requests_reconfiguration_before_copy_or_blit() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(2, 2);
    let mut runtime = RealWgpuNativeRenderRuntimeDevice::new(target);
    for usage in [
        wgpu::TextureUsages::COPY_DST,
        wgpu::TextureUsages::RENDER_ATTACHMENT,
    ] {
        let dst = runtime
            .target
            .device()
            .create_texture(&wgpu::TextureDescriptor {
                label: None,
                size: wgpu::Extent3d {
                    width: 1,
                    height: 2,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: runtime.target.color_format(),
                usage,
                view_formats: &[],
            });
        let error = runtime.write_surface_frame(&dst).unwrap_err();
        assert!(error.message.contains("surface configuration is outdated"));
        assert_eq!(runtime.submitted_command_buffer_count, 0);
    }
}

#[test]
#[ignore = "requires a native GPU adapter"]
fn presents_srgb_midtone_in_linear_fp16_at_display_reference_white() {
    let instance = wgpu::Instance::default();
    let adapter = pollster::block_on(instance.request_adapter(&Default::default())).unwrap();
    let descriptor = wgpu::DeviceDescriptor {
        required_limits: super::super::native_renderer_required_limits(adapter.limits()),
        ..Default::default()
    };
    let (device, queue) = pollster::block_on(adapter.request_device(&descriptor)).unwrap();
    // IEEE binary16: 2 * sRGB_EOTF(128/255), 2 * white,
    // 2 * sRGB_EOTF(4/255) (linear segment), opaque alpha.
    let pixels = render_pixel(&device, &queue, Rgba16Float, Opaque, [128, 255, 4, 255]);
    assert_fp16(&pixels, [0x36e8, 0x4000, 0x18f9, 0x3c00]);

    // 50% alpha. Decode straight sRGB first, then premultiply in linear
    // space only for compositors that expect a premultiplied swapchain.
    let input = [64, 32, 2, 128];
    let straight = render_pixel(&device, &queue, Rgba16Float, PostMultiplied, input);
    assert_fp16(&straight, [0x36d9, 0x2e83, 0x18f4, 0x3804]);
    let premult = render_pixel(&device, &queue, Rgba16Float, PreMultiplied, input);
    assert_fp16(&premult, [0x32e0, 0x2a8a, 0x14f9, 0x3804]);

    // Attachment-only SDR surface. Hardware sRGB encoding restores
    // authored bytes exactly once after the presentation shader runs.
    let straight = render_pixel(&device, &queue, Rgba8UnormSrgb, PostMultiplied, input);
    // The straight red component is exactly 127.5 before UNORM rounding.
    assert!((127..=128).contains(&straight[0]));
    assert_eq!(&straight[1..4], &[64, 4, 128]);
    let premult = render_pixel(&device, &queue, Rgba8UnormSrgb, PreMultiplied, input);
    assert_eq!(&premult[..4], &input);
}

#[cfg(target_os = "ios")]
#[test]
#[ignore = "requires an iOS Metal drawable"]
fn presents_again_after_replacing_ios_metal_surface_and_resizing() {
    use crate::renderer::{
        configure_wgpu_surface_for_native_renderer, create_real_wgpu_surface_target,
        InMemoryWgpuNativeRenderRuntimeExecutor, NativeRenderer,
        RealWgpuSurfaceTargetBootstrapRequest, WgpuNativeRenderBackend,
        WgpuNativeRenderBackendConfig, WgpuNativeSurfaceConfigRequest,
    };
    use objc2_quartz_core::CAMetalLayer;

    let layer = CAMetalLayer::new();
    let instance = wgpu::Instance::default();
    let create_surface = || {
        // The retained layer outlives both surfaces and every acquired drawable.
        unsafe {
            instance.create_surface_unsafe(wgpu::SurfaceTargetUnsafe::CoreAnimationLayer(
                (&*layer as *const CAMetalLayer).cast_mut().cast(),
            ))
        }
        .unwrap()
    };
    let mut surface = create_surface();
    let config = WgpuNativeRenderBackendConfig::default();
    let bootstrap = pollster::block_on(create_real_wgpu_surface_target(
        &instance,
        &surface,
        &RealWgpuSurfaceTargetBootstrapRequest::new(256, 144, config.clone()),
    ))
    .unwrap();
    assert_eq!(bootstrap.adapter_info.backend, wgpu::Backend::Metal);
    let device = bootstrap.target.device().clone();
    let executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(
        RealWgpuNativeRenderRuntimeDevice::new(bootstrap.target),
    );
    let mut renderer = NativeRenderer::new(WgpuNativeRenderBackend::with_runtime_executor(
        config, executor,
    ));
    let mut frame: serde_json::Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../test-fixtures/renderer/ui-paint-frame.json"
    )))
    .unwrap();
    for (width, height) in [(256, 144), (320, 180)] {
        if width == 320 {
            drop(surface);
            surface = create_surface();
            let plan = configure_wgpu_surface_for_native_renderer(
                &surface,
                &bootstrap.adapter,
                &device,
                &WgpuNativeSurfaceConfigRequest::new(width, height),
            )
            .unwrap();
            renderer
                .backend_mut()
                .resize_target_from_surface_config(&plan)
                .unwrap();
        }
        frame["container"]["width"] = width.into();
        frame["container"]["height"] = height.into();
        renderer
            .prepare_and_render_json_str(&frame.to_string())
            .unwrap();
        let report = renderer
            .backend_mut()
            .present_frame_to_surface(&surface)
            .unwrap();
        assert_eq!(
            (report.copy.extent.width, report.copy.extent.height),
            (width, height)
        );
        let capture = renderer
            .backend()
            .runtime_executor()
            .device()
            .capture_frame_rgba8()
            .unwrap();
        assert!(capture
            .rgba8
            .chunks_exact(4)
            .any(|p| p[0] != p[1] && p[3] != 0));
    }
}

fn assert_fp16(pixels: &[u8], expected: [u16; 4]) {
    for (component, expected) in pixels.chunks_exact(2).zip(expected) {
        let actual = u16::from_le_bytes(component.try_into().unwrap());
        assert!(
            actual.abs_diff(expected) <= 1,
            "actual {actual:x}, expected {expected:x}"
        );
    }
}

fn render_pixel(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    format: wgpu::TextureFormat,
    alpha_mode: wgpu::CompositeAlphaMode,
    rgba: [u8; 4],
) -> Vec<u8> {
    let size = wgpu::Extent3d {
        width: 1,
        height: 1,
        depth_or_array_layers: 1,
    };
    let mut target =
        RealWgpuNativeRenderRuntimeTarget::new(device.clone(), queue.clone(), format, size);
    target.alpha_mode = alpha_mode;
    target.sdr_white_scale = 2.0;
    let mut runtime = RealWgpuNativeRenderRuntimeDevice::new(target);

    let mut encoder = device.create_command_encoder(&Default::default());
    {
        let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: runtime.frame_target.view(),
                resolve_target: None,
                depth_slice: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color {
                        r: f64::from(rgba[0]) / 255.0,
                        g: f64::from(rgba[1]) / 255.0,
                        b: f64::from(rgba[2]) / 255.0,
                        a: f64::from(rgba[3]) / 255.0,
                    }),
                    store: wgpu::StoreOp::Store,
                },
            })],
            ..Default::default()
        });
    }
    runtime.target.queue().submit([encoder.finish()]);
    runtime.frame_target.finish_pass();
    let dst = device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    runtime.write_surface_frame(&dst).unwrap();
    let readback = device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: 8,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut encoder = device.create_command_encoder(&Default::default());
    encoder.copy_texture_to_buffer(
        dst.as_image_copy(),
        wgpu::TexelCopyBufferInfo {
            buffer: &readback,
            layout: Default::default(),
        },
        size,
    );
    runtime.target.queue().submit([encoder.finish()]);
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    readback
        .slice(..)
        .map_async(wgpu::MapMode::Read, move |r| tx.send(r).unwrap());
    device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
    rx.recv().unwrap().unwrap();
    let pixels = readback.slice(..).get_mapped_range();
    pixels.to_vec()
}
