use super::*;
use std::collections::BTreeMap;

#[test]
fn summarizes_resources_by_kind_and_package() {
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new("base:bg", NativeResourceKind::Texture)
            .owned_by("base")
            .memory(128, 4096)
            .label("background texture"),
    );
    ledger.insert(
        NativeResourceRecord::new("runtime:style", NativeResourceKind::QssStyle)
            .owned_by("runtime.ui")
            .require_package("base")
            .memory(1024, 0),
    );
    ledger.insert(
        NativeResourceRecord::new("voice:1", NativeResourceKind::AudioBuffer)
            .owned_by("runtime.voice")
            .memory(2048, 0),
    );

    let summary = ledger.summary();
    assert_eq!(summary.total_count, 3);
    assert_eq!(
        summary.total_memory,
        ResourceMemory {
            cpu_bytes: 3200,
            gpu_bytes: 4096
        }
    );
    assert_eq!(
        summary.by_kind[&NativeResourceKind::Texture],
        ResourceKindSummary {
            count: 1,
            memory: ResourceMemory {
                cpu_bytes: 128,
                gpu_bytes: 4096
            }
        }
    );
    assert_eq!(summary.by_package["base"].owned_count, 1);
    assert_eq!(summary.by_package["base"].dependent_count, 1);
    assert_eq!(summary.by_package["runtime.ui"].owned_count, 1);
    assert_eq!(summary.by_package["runtime.voice"].owned_count, 1);
}

#[test]
fn summarizes_memory_pressure_for_benchmarks_and_hosts() {
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new("base:bg", NativeResourceKind::Texture)
            .owned_by("base")
            .memory(128, 4096),
    );
    ledger.insert(
        NativeResourceRecord::new("runtime:surface", NativeResourceKind::UiAst)
            .owned_by("runtime.ui")
            .require_package("base")
            .memory(4096, 0),
    );
    ledger.insert(
        NativeResourceRecord::new("runtime:voice", NativeResourceKind::AudioBuffer)
            .owned_by("runtime.voice")
            .memory(8192, 0),
    );

    let pressure = ledger.summary().memory_pressure();

    assert_eq!(pressure.total_count, 3);
    assert_eq!(
        pressure.total_memory,
        ResourceMemory {
            cpu_bytes: 12416,
            gpu_bytes: 4096
        }
    );
    assert_eq!(pressure.largest_kind, Some(NativeResourceKind::AudioBuffer));
    assert_eq!(
        pressure.largest_kind_memory,
        ResourceMemory {
            cpu_bytes: 8192,
            gpu_bytes: 0
        }
    );
    assert_eq!(
        pressure.largest_owner_package_id,
        Some("runtime.voice".to_string())
    );
    assert_eq!(
        pressure.largest_owner_package_memory,
        ResourceMemory {
            cpu_bytes: 8192,
            gpu_bytes: 0
        }
    );
    assert_eq!(
        pressure.largest_dependent_package_id,
        Some("base".to_string())
    );
    assert_eq!(
        pressure.largest_dependent_package_memory,
        ResourceMemory {
            cpu_bytes: 4096,
            gpu_bytes: 0
        }
    );
}

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

#[test]
fn plans_clean_package_unload_for_owned_resources() {
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new("runtime:image", NativeResourceKind::Texture)
            .owned_by("runtime.extra")
            .memory(128, 2048),
    );
    ledger.insert(
        NativeResourceRecord::new("runtime:ui", NativeResourceKind::UiAst)
            .owned_by("runtime.extra")
            .require_package("runtime.extra")
            .memory(512, 0),
    );

    let plan = ledger.plan_package_unload("runtime.extra");
    assert!(plan.can_unload());
    assert_eq!(plan.releasable.len(), 2);
    assert_eq!(
        plan.releasable_memory,
        ResourceMemory {
            cpu_bytes: 640,
            gpu_bytes: 2048
        }
    );

    let released = ledger.release_package_owned("runtime.extra");
    assert_eq!(released.len(), 2);
    assert!(ledger.is_empty());
}

#[test]
fn blocks_unload_when_foreign_resource_requires_package() {
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new("runtime:diff", NativeResourceKind::DecodedImage)
            .owned_by("runtime.diff")
            .require_package("base")
            .memory(256, 0),
    );

    let plan = ledger.plan_package_unload("base");
    assert!(!plan.can_unload());
    assert!(plan.releasable.is_empty());
    assert_eq!(plan.blocked.len(), 1);
    assert_eq!(
        plan.blocked[0].reason,
        PackageUnloadBlockerReason::PackageRequiredByForeignResource
    );
    assert_eq!(ledger.release_package_owned("base"), Vec::new());
    assert_eq!(ledger.len(), 1);
}

#[test]
fn blocks_owned_resource_that_still_depends_on_foreign_package() {
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new("sprite:merged", NativeResourceKind::Texture)
            .owned_by("runtime.diff")
            .require_packages(["base", "runtime.diff"])
            .memory(100, 300),
    );

    let plan = ledger.plan_package_unload("runtime.diff");
    assert!(!plan.can_unload());
    assert_eq!(plan.releasable.len(), 0);
    assert_eq!(plan.blocked.len(), 1);
    assert_eq!(
        plan.blocked[0].reason,
        PackageUnloadBlockerReason::OwnerStillRequiredByForeignPackage
    );
    assert!(ledger.release_package_owned("runtime.diff").is_empty());
}

#[test]
fn replaces_existing_records_by_id() {
    let mut ledger = NativeResourceLedger::new();
    assert!(ledger
        .insert(NativeResourceRecord::new(
            "same",
            NativeResourceKind::Texture
        ))
        .is_none());
    let previous = ledger
        .insert(NativeResourceRecord::new(
            "same",
            NativeResourceKind::AudioBuffer,
        ))
        .unwrap();

    assert_eq!(previous.kind, NativeResourceKind::Texture);
    assert_eq!(
        ledger.get("same").unwrap().kind,
        NativeResourceKind::AudioBuffer
    );
}

#[test]
fn clears_all_records_for_renderer_shutdown() {
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(NativeResourceRecord::new("a", NativeResourceKind::Texture));
    ledger.insert(NativeResourceRecord::new(
        "b",
        NativeResourceKind::AudioHandle,
    ));

    let released = ledger.clear();
    assert_eq!(released.len(), 2);
    assert!(ledger.is_empty());
}
