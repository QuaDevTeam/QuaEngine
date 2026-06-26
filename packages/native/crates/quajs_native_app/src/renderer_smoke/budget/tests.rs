use std::collections::BTreeMap;

use super::*;
use crate::renderer_smoke::summary::{
    NativeRendererSmokeMemorySummary, NativeRendererSmokePackageMemorySummary,
    NativeRendererSmokeResourceKindMemorySummary,
};

#[test]
fn accepts_summary_within_budget() {
    let summary = summary();
    let report = NativeRendererSmokeBudgetReport::check(
        NativeRendererSmokeBudget {
            max_missing_resources: Some(1),
            max_fallbacks: Some(2),
            max_memory_bytes: Some(256),
            max_declarative_memory_bytes: Some(128),
            ..Default::default()
        },
        &summary,
    );

    assert!(report.is_ok());
}

#[test]
fn reports_all_budget_violations() {
    let summary = summary();
    let report = NativeRendererSmokeBudgetReport::check(
        NativeRendererSmokeBudget {
            max_missing_resources: Some(0),
            max_fallbacks: Some(0),
            max_video_fallbacks: Some(0),
            max_memory_bytes: Some(99),
            max_declarative_memory_bytes: Some(39),
            max_audio_memory_bytes: Some(9),
            max_audio_resources: Some(0),
            max_active_audio_tracks: Some(0),
            ..Default::default()
        },
        &summary,
    );

    assert_eq!(
        report
            .violations
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>(),
        vec![
            "missingResourceCount=1 exceeded max 0",
            "fallbackCount=2 exceeded max 0",
            "videoFallbackCount=1 exceeded max 0",
            "memory.totalBytes=100 exceeded max 99",
            "declarativeMemory.totalBytes=40 exceeded max 39",
            "audioMemory.totalBytes=10 exceeded max 9",
            "audioResourceCount=1 exceeded max 0",
            "activeAudioTrackCount=1 exceeded max 0",
        ]
    );
}

#[test]
fn rejects_unknown_budget_fields() {
    let path = unique_budget_path("unknown");
    std::fs::write(&path, r#"{ "maxMemoryByts": 1 }"#)
        .expect("renderer smoke budget fixture writes");

    let error = load_renderer_smoke_budget(&path).expect_err("unknown budget fields should fail");

    assert!(error.to_string().contains("unknown field"));
    std::fs::remove_file(path).ok();
}

#[test]
fn reports_memory_map_budget_violations() {
    let summary = summary();
    let report = NativeRendererSmokeBudgetReport::check(
        NativeRendererSmokeBudget {
            max_memory_bytes_by_kind: BTreeMap::from([("uiAst".to_string(), 39)]),
            max_owned_memory_bytes_by_package: BTreeMap::from([("runtime.ui".to_string(), 39)]),
            max_dependent_memory_bytes_by_package: BTreeMap::from([("base".to_string(), 29)]),
            max_declarative_owned_memory_bytes_by_package: BTreeMap::from([(
                "runtime.ui".to_string(),
                39,
            )]),
            max_declarative_dependent_memory_bytes_by_package: BTreeMap::from([(
                "base".to_string(),
                39,
            )]),
            max_audio_owned_memory_bytes_by_package: BTreeMap::from([(
                "runtime.audio".to_string(),
                9,
            )]),
            max_audio_dependent_memory_bytes_by_package: BTreeMap::from([("base".to_string(), 9)]),
            ..Default::default()
        },
        &summary,
    );

    assert_eq!(
        report
            .violations
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>(),
        vec![
            "memoryByKind.uiAst.memory.totalBytes=40 exceeded max 39",
            "memoryByPackage.runtime.ui.ownedMemory.totalBytes=40 exceeded max 39",
            "memoryByPackage.base.dependentMemory.totalBytes=30 exceeded max 29",
            "declarativeMemoryByPackage.runtime.ui.ownedMemory.totalBytes=40 exceeded max 39",
            "declarativeMemoryByPackage.base.dependentMemory.totalBytes=40 exceeded max 39",
            "audioMemoryByPackage.runtime.audio.ownedMemory.totalBytes=10 exceeded max 9",
            "audioMemoryByPackage.base.dependentMemory.totalBytes=10 exceeded max 9",
        ]
    );
}

#[test]
fn displays_budget_report() {
    let summary = summary();
    let report = NativeRendererSmokeBudgetReport::check(
        NativeRendererSmokeBudget {
            max_memory_bytes: Some(0),
            ..Default::default()
        },
        &summary,
    );

    assert_eq!(
        report.to_string(),
        "Native renderer smoke budget exceeded: memory.totalBytes=100 exceeded max 0."
    );
}

fn summary() -> NativeRendererSmokeSummary {
    NativeRendererSmokeSummary {
        revision: 1,
        pass_count: 2,
        batch_count: 3,
        command_count: 4,
        resource_count: 5,
        missing_resource_count: 1,
        fallback_count: 2,
        video_fallback_count: 1,
        declarative_asset_request_count: 1,
        declarative_resource_count: 1,
        audio_resource_count: 1,
        active_audio_track_count: 1,
        resource_package_count: 2,
        resource_kind_count: 3,
        memory: memory(60, 40),
        declarative_memory: memory(40, 0),
        audio_memory: memory(10, 0),
        memory_by_kind: BTreeMap::from([("uiAst".to_string(), kind_memory(1, 40, 0))]),
        memory_by_package: BTreeMap::from([
            (
                "runtime.ui".to_string(),
                package_memory(1, 0, memory(40, 0), memory(0, 0)),
            ),
            (
                "base".to_string(),
                package_memory(0, 1, memory(0, 0), memory(30, 0)),
            ),
        ]),
        declarative_memory_by_package: BTreeMap::from([
            (
                "runtime.ui".to_string(),
                package_memory(1, 0, memory(40, 0), memory(0, 0)),
            ),
            (
                "base".to_string(),
                package_memory(0, 1, memory(0, 0), memory(40, 0)),
            ),
        ]),
        audio_memory_by_package: BTreeMap::from([
            (
                "runtime.audio".to_string(),
                package_memory(1, 0, memory(10, 0), memory(0, 0)),
            ),
            (
                "base".to_string(),
                package_memory(0, 1, memory(0, 0), memory(10, 0)),
            ),
        ]),
    }
}

fn memory(cpu_bytes: u64, gpu_bytes: u64) -> NativeRendererSmokeMemorySummary {
    NativeRendererSmokeMemorySummary {
        cpu_bytes,
        gpu_bytes,
        total_bytes: cpu_bytes + gpu_bytes,
    }
}

fn kind_memory(
    count: usize,
    cpu_bytes: u64,
    gpu_bytes: u64,
) -> NativeRendererSmokeResourceKindMemorySummary {
    NativeRendererSmokeResourceKindMemorySummary {
        count,
        memory: memory(cpu_bytes, gpu_bytes),
    }
}

fn package_memory(
    owned_count: usize,
    dependent_count: usize,
    owned_memory: NativeRendererSmokeMemorySummary,
    dependent_memory: NativeRendererSmokeMemorySummary,
) -> NativeRendererSmokePackageMemorySummary {
    NativeRendererSmokePackageMemorySummary {
        owned_count,
        dependent_count,
        owned_memory,
        dependent_memory,
    }
}

fn unique_budget_path(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "quajs-native-renderer-smoke-budget-{label}-{}-{}.json",
        std::process::id(),
        std::thread::current().name().unwrap_or("test")
    ))
}
