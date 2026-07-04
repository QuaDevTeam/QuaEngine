use super::super::*;
use super::support::{
    apply_draw_range_setup, draw_range_operation, draw_range_operation_with_bounds,
};

#[test]
fn rejects_draw_with_empty_index_range() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_draw_range_setup(&mut device, &mut report, 128, 24);

    let error = device
        .apply_runtime_operation(&draw_range_operation("ui:empty", 0, 0, 0, 4), &mut report)
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("empty index/vertex range"));
}

#[test]
fn rejects_draw_with_empty_vertex_range() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_draw_range_setup(&mut device, &mut report, 128, 24);

    let error = device
        .apply_runtime_operation(
            &draw_range_operation("ui:empty-vertex", 0, 6, 0, 0),
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("empty index/vertex range"));
}

#[test]
fn rejects_draw_with_empty_physical_bounds() {
    let mut device = InMemoryWgpuNativeRenderRuntimeDevice::default();
    let mut report = WgpuNativeRenderRuntimeExecutionReport::default();
    apply_draw_range_setup(&mut device, &mut report, 128, 24);

    let error = device
        .apply_runtime_operation(
            &draw_range_operation_with_bounds(
                "ui:empty-bounds",
                0,
                6,
                0,
                4,
                WgpuPhysicalRect {
                    x: 0,
                    y: 0,
                    width: 0,
                    height: 64,
                },
            ),
            &mut report,
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("empty index/vertex range"));
}
