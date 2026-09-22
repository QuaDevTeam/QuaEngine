use super::*;

#[test]
fn real_noop_backend_rebuilds_texture_bind_group_after_decoded_texture_changes() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(1600, 900);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    device.set_image_cache_budget(256 * 1024 * 1024);
    let executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let backend = WgpuNativeRenderBackend::with_runtime_executor(
        WgpuNativeRenderBackendConfig::default(),
        executor,
    );
    let mut renderer = NativeRenderer::new(backend);
    let layout = resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(1600.0),
            height: Some(900.0),
            ..Default::default()
        },
    );
    let view = textured_background_view("bg/school.png");

    renderer.prepare_and_render(layout, &view).unwrap();
    let first_report = renderer
        .backend()
        .last_runtime_report()
        .expect("expected first runtime report");
    assert_eq!(
        first_report
            .texture_sampler_diagnostics
            .placeholder_bind_group_count,
        1
    );

    renderer
        .backend_mut()
        .upload_decoded_texture_rgba8(
            "images:bg/school.png",
            RealWgpuDecodedTextureRgba8::new(1, 1, vec![128, 64, 32, 255]),
        )
        .unwrap();
    renderer.prepare_and_render(layout, &view).unwrap();
    // Cache maintenance after a normal upload must not recreate an existing
    // bind group a second time on the next stable frame.
    renderer.backend_mut().sync_image_cache_bindings();
    renderer.prepare_and_render(layout, &view).unwrap();
    let decoded_report = renderer
        .backend()
        .last_runtime_report()
        .expect("expected decoded runtime report");
    assert_eq!(decoded_report.bind_group_create_count, 0);
    assert_eq!(
        decoded_report
            .texture_sampler_diagnostics
            .decoded_bind_group_count,
        1
    );
    assert_eq!(
        decoded_report
            .texture_sampler_diagnostics
            .placeholder_bind_group_count,
        0
    );

    assert!(renderer
        .backend_mut()
        .release_decoded_texture("images:bg/school.png"));
    renderer.prepare_and_render(layout, &view).unwrap();
    let placeholder_report = renderer
        .backend()
        .last_runtime_report()
        .expect("expected placeholder runtime report");
    assert_eq!(placeholder_report.bind_group_create_count, 1);
    assert_eq!(
        placeholder_report
            .texture_sampler_diagnostics
            .decoded_bind_group_count,
        0
    );
    assert_eq!(
        placeholder_report
            .texture_sampler_diagnostics
            .placeholder_bind_group_count,
        1
    );
}

#[test]
fn real_noop_runtime_executor_replaces_textured_background_bind_group_when_asset_changes() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(1600, 900);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let backend = WgpuNativeRenderBackend::with_runtime_executor(
        WgpuNativeRenderBackendConfig::default(),
        executor,
    );
    let mut renderer = NativeRenderer::new(backend);
    let layout = resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(1600.0),
            height: Some(900.0),
            ..Default::default()
        },
    );

    renderer
        .prepare_and_render(layout, &textured_background_view("bg/school.png"))
        .unwrap();
    renderer
        .prepare_and_render(layout, &textured_background_view("bg/river.png"))
        .unwrap();

    let runtime_plan = renderer
        .backend()
        .last_runtime_plan()
        .expect("expected second generated runtime plan");
    let runtime_report = renderer
        .backend()
        .last_runtime_report()
        .expect("expected second generated runtime report");

    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::ReleaseBindGroup {
            cache_label,
        } if cache_label.contains("images:bg/school.png")
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::CreateBindGroup {
            layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
            resource_ids,
            ..
        } if resource_ids == &vec!["images:bg/river.png".to_string()]
    )));
    assert!(!runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::ReuseBindGroup {
            cache_label,
            ..
        } if cache_label.contains("images:bg/school.png")
    )));
    assert_eq!(runtime_report.bind_group_create_count, 1);
    assert_eq!(runtime_report.bind_group_recreate_count, 0);
    assert_eq!(runtime_report.bind_group_release_count, 1);
    assert_eq!(runtime_report.resident_bind_group_count, 1);
    assert_eq!(runtime_report.submitted_command_buffer_count, 2);
    assert!(renderer.backend().diagnostics().device_attached);
}

#[cfg(feature = "image-decode")]
#[test]
fn background_preparation_invalidates_both_device_and_backend_sampler_caches() {
    for asynchronous in [false, true] {
        let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 36);
        let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
        if asynchronous {
            device.enable_async_image_uploads().unwrap();
        }
        let backend = WgpuNativeRenderBackend::with_runtime_executor(
            WgpuNativeRenderBackendConfig::default(),
            InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device),
        );
        let mut renderer = NativeRenderer::new(backend);
        let layout = resolve_stage_layout(
            None,
            StageContainerInput {
                width: Some(64.0),
                height: Some(36.0),
                ..Default::default()
            },
        );
        let view = textured_background_view("bg/school.png");
        renderer.prepare_and_render(layout, &view).unwrap();
        let mut encoded = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(2, 2)
            .write_to(&mut encoded, image::ImageFormat::Png)
            .unwrap();
        let ready = renderer
            .backend_mut()
            .request_image_texture_upload(
                "images:bg/school.png",
                encoded.get_ref(),
                Default::default(),
            )
            .unwrap();
        if asynchronous {
            assert!(!ready);
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
            loop {
                if renderer
                    .backend_mut()
                    .poll_image_texture_upload("images:bg/school.png")
                    .unwrap()
                    .unwrap()
                {
                    break;
                }
                assert!(std::time::Instant::now() < deadline);
                std::thread::sleep(std::time::Duration::from_millis(1));
            }
        } else {
            assert!(ready);
        }
        renderer.render_frame().unwrap();
        let report = renderer.backend().last_runtime_report().unwrap();
        assert_eq!(
            report
                .texture_sampler_diagnostics
                .placeholder_bind_group_count,
            0
        );
        assert_eq!(
            report.texture_sampler_diagnostics.decoded_bind_group_count,
            1
        );
    }
}
