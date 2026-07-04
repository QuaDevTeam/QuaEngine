use super::*;

#[test]
fn copies_completed_frame_target_to_external_texture() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let plan = empty_pass_plan(64, 64);

    let report = executor.apply_runtime_plan(&plan).unwrap();
    let destination = create_copy_destination(executor.device().target(), 64, 64);
    let copy = executor
        .device_mut()
        .copy_frame_to_texture(&destination)
        .expect("completed frame copies to external texture");

    assert_eq!(report.submitted_command_buffer_count, 1);
    assert_eq!(copy.extent.width, 64);
    assert_eq!(copy.extent.height, 64);
    assert_eq!(copy.color_format, wgpu::TextureFormat::Rgba8UnormSrgb);
    assert_eq!(copy.submitted_command_buffer_count, 2);
    assert_eq!(
        executor.device().snapshot().submitted_command_buffer_count,
        2
    );
}

#[test]
fn rejects_copy_before_frame_has_rendered() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let destination = create_copy_destination(device.target(), 64, 64);

    let error = device
        .copy_frame_to_texture(&destination)
        .expect_err("copy before render fails");

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("before a render pass has completed"));
}

#[test]
fn rejects_destination_without_copy_dst_usage() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    executor
        .apply_runtime_plan(&empty_pass_plan(64, 64))
        .unwrap();
    let destination =
        executor
            .device()
            .target()
            .device()
            .create_texture(&wgpu::TextureDescriptor {
                label: Some("qua-native-test-present-target-without-copy-dst"),
                size: executor.device().target().extent(),
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: executor.device().target().color_format(),
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            });

    let error = executor
        .device_mut()
        .copy_frame_to_texture(&destination)
        .expect_err("destination without COPY_DST fails");

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("COPY_DST"));
}

#[test]
fn resize_target_rebuilds_frame_target_and_preserves_renderability() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    executor
        .apply_runtime_plan(&empty_pass_plan(64, 64))
        .unwrap();
    assert_eq!(
        executor
            .device()
            .frame_target_snapshot()
            .completed_pass_count,
        1
    );

    let report = executor
        .device_mut()
        .resize_target(
            wgpu::TextureFormat::Rgba8UnormSrgb,
            wgpu::Extent3d {
                width: 128,
                height: 72,
                depth_or_array_layers: 1,
            },
        )
        .expect("resize succeeds between frames");

    assert_eq!(report.previous_extent.width, 64);
    assert_eq!(report.previous_extent.height, 64);
    assert_eq!(report.new_extent.width, 128);
    assert_eq!(report.new_extent.height, 72);
    assert_eq!(report.pipelines_cleared, 0);
    assert_eq!(report.bind_groups_cleared, 0);
    assert_eq!(executor.device().target().extent().width, 128);
    assert_eq!(executor.device().target().extent().height, 72);
    assert_eq!(
        executor
            .device()
            .frame_target_snapshot()
            .completed_pass_count,
        0
    );

    executor
        .apply_runtime_plan(&empty_pass_plan(128, 72))
        .unwrap();
    let destination = create_copy_destination(executor.device().target(), 128, 72);
    let copy = executor
        .device_mut()
        .copy_frame_to_texture(&destination)
        .expect("resized frame copies to matching destination");

    assert_eq!(copy.extent.width, 128);
    assert_eq!(copy.extent.height, 72);
}

fn empty_pass_plan(width: u32, height: u32) -> WgpuNativeRenderRuntimePlan {
    WgpuNativeRenderRuntimePlan {
        revision: 7,
        operation_count: 4,
        encoder_count: 1,
        render_pass_count: 1,
        render_pass_command_count: 2,
        submit_count: 1,
        operations: vec![
            WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
                label: "encoder".to_string(),
                pass_count: 1,
                command_count: 2,
            },
            WgpuNativeRenderRuntimeOperation::BeginRenderPass {
                encoder_label: "encoder".to_string(),
                pass_label: "pass".to_string(),
                pass_index: 0,
                plane: None,
                viewport: WgpuPhysicalRect {
                    x: 0,
                    y: 0,
                    width,
                    height,
                },
                command_count: 2,
            },
            WgpuNativeRenderRuntimeOperation::EndRenderPass {
                pass_label: "pass".to_string(),
            },
            WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer {
                encoder_label: "encoder".to_string(),
                pass_count: 1,
                command_count: 2,
            },
        ],
        ..Default::default()
    }
}

fn create_copy_destination(
    target: &RealWgpuNativeRenderRuntimeTarget,
    width: u32,
    height: u32,
) -> wgpu::Texture {
    target.device().create_texture(&wgpu::TextureDescriptor {
        label: Some("qua-native-test-present-target"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: target.color_format(),
        usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    })
}
