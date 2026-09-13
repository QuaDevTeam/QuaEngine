use std::collections::BTreeMap;

use super::super::*;

#[test]
fn reports_budget_violations() {
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new("texture", NativeResourceKind::Texture)
            .owned_by("base")
            .memory(10, 90),
    );
    ledger.insert(
        NativeResourceRecord::new("audio", NativeResourceKind::AudioBuffer)
            .owned_by("base")
            .memory(50, 0),
    );
    ledger.insert(
        NativeResourceRecord::new("audio:handle", NativeResourceKind::AudioHandle)
            .owned_by("base")
            .memory(8, 0),
    );

    let violations = ledger.check_budget(&ResourceBudget {
        max_cpu_bytes: Some(40),
        max_gpu_bytes: Some(80),
        max_total_bytes: Some(120),
        max_resource_count: Some(1),
        max_resource_count_by_kind: BTreeMap::from([(NativeResourceKind::AudioHandle, 0)]),
        max_memory_by_kind: BTreeMap::from([(
            NativeResourceKind::Texture,
            ResourceMemoryBudget {
                max_cpu_bytes: None,
                max_gpu_bytes: Some(80),
                max_total_bytes: Some(95),
            },
        )]),
    });
    let codes: Vec<_> = violations.iter().map(|violation| violation.code).collect();

    assert_eq!(
        codes,
        vec![
            ResourceBudgetViolationCode::CpuBytesExceeded,
            ResourceBudgetViolationCode::GpuBytesExceeded,
            ResourceBudgetViolationCode::TotalBytesExceeded,
            ResourceBudgetViolationCode::ResourceCountExceeded,
            ResourceBudgetViolationCode::ResourceKindCountExceeded,
            ResourceBudgetViolationCode::ResourceKindGpuBytesExceeded,
            ResourceBudgetViolationCode::ResourceKindTotalBytesExceeded,
        ]
    );
    assert_eq!(violations[0].actual, 68);
    assert_eq!(violations[2].actual, 158);
    assert_eq!(violations[4].actual, 1);
    assert_eq!(violations[4].limit, 0);
    assert_eq!(violations[5].actual, 90);
    assert_eq!(violations[5].limit, 80);
    assert_eq!(violations[6].actual, 100);
    assert_eq!(violations[6].limit, 95);
}
