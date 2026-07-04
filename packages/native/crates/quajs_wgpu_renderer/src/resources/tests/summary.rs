use super::super::*;

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
