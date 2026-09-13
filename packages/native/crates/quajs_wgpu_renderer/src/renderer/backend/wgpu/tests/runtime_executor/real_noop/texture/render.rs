use super::*;

#[test]
fn real_noop_runtime_executor_renders_generated_textured_background_frame_plan() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(1600, 900);
    let device = RealWgpuNativeRenderRuntimeDevice::new(target);
    let executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let backend = WgpuNativeRenderBackend::with_runtime_executor(
        WgpuNativeRenderBackendConfig::default(),
        executor,
    );
    let mut renderer = NativeRenderer::new(backend);

    let result = renderer
        .prepare_and_render(
            resolve_stage_layout(
                Some(ViewLayoutInput {
                    preset: Some(ViewLayoutOrientation::Landscape),
                    ..Default::default()
                }),
                StageContainerInput {
                    width: Some(1600.0),
                    height: Some(900.0),
                    ..Default::default()
                },
            ),
            &textured_background_view("bg/school.png"),
        )
        .unwrap();

    let runtime_plan = renderer
        .backend()
        .last_runtime_plan()
        .expect("expected generated runtime plan");
    let runtime_report = renderer
        .backend()
        .last_runtime_report()
        .expect("expected generated runtime report");

    assert_eq!(result.submission.revision, 1);
    assert_eq!(result.texture_upload_sync.pending_requests.len(), 1);
    assert!(result.texture_upload_sync.resident_resource_ids.is_empty());
    assert!(result
        .texture_upload_sync
        .orphaned_resident_resource_ids
        .is_empty());
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::CreatePipeline { key, .. }
            if key.shader == WgpuNativeRenderShader::TexturedQuad
                && key.bind_group_layout == WgpuNativeRenderBindGroupLayout::TextureSampler
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::CreateBindGroup {
            layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
            ..
        }
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::SetBindGroup { .. }
    )));
    assert_eq!(runtime_report.draw_indexed_count, 1);
    assert_eq!(runtime_report.bind_group_create_count, 1);
    assert_eq!(runtime_report.resident_bind_group_count, 1);
    assert_eq!(runtime_report.resident_texture_count, 0);
    assert_eq!(
        runtime_report
            .texture_sampler_diagnostics
            .decoded_bind_group_count,
        0
    );
    assert_eq!(
        runtime_report
            .texture_sampler_diagnostics
            .placeholder_bind_group_count,
        1
    );
    assert!(runtime_report
        .texture_sampler_diagnostics
        .placeholder_resource_ids_by_bind_group
        .values()
        .any(|resource_ids| resource_ids == &vec!["images:bg/school.png".to_string()]));
    assert_eq!(runtime_report.submitted_command_buffer_count, 1);
    assert!(renderer.backend().diagnostics().device_attached);
}
