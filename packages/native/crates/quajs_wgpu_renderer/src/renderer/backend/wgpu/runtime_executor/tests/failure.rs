use super::common::*;
use super::*;

#[test]
fn failed_runtime_device_apply_keeps_previous_committed_snapshot() {
    let first = runtime_plan(
        1,
        QUAD_VERTEX_BYTE_LEN,
        "bind-group::old",
        "images:old.png",
        None,
    );
    let second = second_runtime_plan();
    let mut executor =
        InMemoryWgpuNativeRenderRuntimeExecutor::with_device(FailOnRevisionRuntimeDevice {
            inner: InMemoryWgpuNativeRenderRuntimeDevice::default(),
            failing_revision: 2,
        });
    let first_report = executor.apply_runtime_plan(&first).unwrap();
    let committed_snapshot = executor.snapshot();

    let error = executor.apply_runtime_plan(&second).unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("simulated device failure"));
    assert_eq!(executor.snapshot(), committed_snapshot);
    assert_eq!(executor.applied_reports(), &[first_report]);
}
