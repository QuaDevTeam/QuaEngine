use super::super::*;
use super::support::{apply_draw_range_setup, draw_range_operation};

#[test]
fn rejects_draw_index_range_exceeding_index_buffer() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_draw_range_setup(&mut device, &mut report, 128, 8);

    let error = device
        .apply_runtime_operation(
            &draw_range_operation("ui:index-overflow", 0, 6, 0, 4),
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("index range requires 24 bytes"));
    assert!(error.message.contains("index buffer has 8"));
}

#[test]
fn rejects_draw_index_range_overflow() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_draw_range_setup(&mut device, &mut report, 128, 24);

    let error = device
        .apply_runtime_operation(
            &draw_range_operation("ui:index-range-overflow", u32::MAX, 1, 0, 4),
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("index range overflows"));
}

#[test]
fn rejects_draw_vertex_range_exceeding_vertex_buffer() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_draw_range_setup(&mut device, &mut report, 64, 24);

    let error = device
        .apply_runtime_operation(
            &draw_range_operation("ui:vertex-overflow", 0, 6, 0, 4),
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("vertex range requires 128 bytes"));
    assert!(error.message.contains("vertex buffer has 64"));
}

#[test]
fn rejects_draw_vertex_range_overflow() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_draw_range_setup(&mut device, &mut report, 128, 24);

    let error = device
        .apply_runtime_operation(
            &draw_range_operation("ui:vertex-range-overflow", 0, 6, u32::MAX, 1),
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("vertex range overflows"));
}

#[test]
fn rejects_first_vertex_outside_wgpu_base_vertex_range() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_draw_range_setup(&mut device, &mut report, 128, 24);

    let error = device
        .apply_runtime_operation(
            &draw_range_operation("ui:base-vertex-overflow", 0, 6, i32::MAX as u32 + 1, 1),
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("base vertex range"));
}
