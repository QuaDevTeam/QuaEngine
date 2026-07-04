use std::time::Instant;

use super::fixtures::memory_ledger;
use super::memory_ledger::MemoryLedgerSmokeSummary;
use super::MEMORY_LEDGER_RESOURCE_COUNT;

#[test]
fn bench_smoke_summarizes_memory_ledger_under_stable_threshold() {
    let ledger = memory_ledger(MEMORY_LEDGER_RESOURCE_COUNT);
    let start = Instant::now();
    let summary = ledger.summary();
    let pressure = summary.memory_pressure();
    let elapsed = start.elapsed();
    let smoke_summary = MemoryLedgerSmokeSummary::from_ledger(&ledger, &summary, elapsed);

    println!(
        "{}",
        serde_json::to_string(&smoke_summary).expect("memory ledger smoke summary serializes")
    );

    assert_eq!(summary.total_count, MEMORY_LEDGER_RESOURCE_COUNT);
    assert!(pressure.total_memory.total_bytes() > 0);
    assert_eq!(smoke_summary.memory_by_kind["uiAst"].count, 250);
    assert!(
        smoke_summary.memory_by_package["runtime.ui"]
            .owned_memory
            .total_bytes
            > 0
    );
    assert!(
        smoke_summary.declarative_memory_by_package["runtime.ui"]
            .owned_memory
            .total_bytes
            > 0
    );
    assert!(
        smoke_summary.audio_memory_by_package["runtime.audio"]
            .owned_memory
            .total_bytes
            > 0
    );
    assert!(
        elapsed.as_millis() < 250,
        "native memory ledger smoke benchmark exceeded 250ms: {:?}",
        elapsed
    );
}
