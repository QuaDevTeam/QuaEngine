use super::*;
use crate::resources::{
    NativeResourceKind, NativeResourceRecord, ResourceBudget, ResourceBudgetViolationCode,
};

#[test]
fn check_resource_budget_reports_ledger_violations() {
    let mut state = NativeRendererState::new();
    state.resources_mut().insert(
        NativeResourceRecord::new("texture", NativeResourceKind::Texture)
            .owned_by("base")
            .memory(10, 90),
    );
    state.resources_mut().insert(
        NativeResourceRecord::new("voice", NativeResourceKind::AudioBuffer)
            .owned_by("runtime.voice")
            .memory(50, 0),
    );

    let violations = state.check_resource_budget(&ResourceBudget {
        max_cpu_bytes: Some(40),
        max_gpu_bytes: Some(80),
        max_total_bytes: Some(120),
        max_resource_count: Some(1),
        max_resource_count_by_kind: Default::default(),
        max_memory_by_kind: Default::default(),
    });
    let codes: Vec<_> = violations.iter().map(|violation| violation.code).collect();

    assert_eq!(
        codes,
        vec![
            ResourceBudgetViolationCode::CpuBytesExceeded,
            ResourceBudgetViolationCode::GpuBytesExceeded,
            ResourceBudgetViolationCode::TotalBytesExceeded,
            ResourceBudgetViolationCode::ResourceCountExceeded,
        ]
    );
}
