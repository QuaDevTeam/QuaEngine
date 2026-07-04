use std::collections::BTreeMap;

use crate::renderer_smoke::summary::{
    NativeRendererSmokePackageMemorySummary, NativeRendererSmokeResourceKindMemorySummary,
};

use super::types::NativeRendererSmokeBudgetViolation;

pub(super) fn check_usize(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    metric: impl Into<String>,
    actual: usize,
    max: Option<usize>,
) {
    if let Some(max) = max {
        check_u64(violations, metric, actual as u64, Some(max as u64));
    }
}

pub(super) fn check_u64(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    metric: impl Into<String>,
    actual: u64,
    max: Option<u64>,
) {
    if let Some(max) = max {
        if actual > max {
            violations.push(NativeRendererSmokeBudgetViolation {
                metric: metric.into(),
                actual,
                max,
            });
        }
    }
}

pub(super) fn check_usize_map(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    metric_prefix: &str,
    actual: &BTreeMap<String, usize>,
    max_by_key: &BTreeMap<String, usize>,
) {
    for (key, max) in max_by_key {
        check_usize(
            violations,
            format!("{metric_prefix}.{key}"),
            actual.get(key).copied().unwrap_or_default(),
            Some(*max),
        );
    }
}

pub(super) fn check_resource_kind_memory(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    metric_prefix: &str,
    actual: &BTreeMap<String, NativeRendererSmokeResourceKindMemorySummary>,
    max_by_kind: &BTreeMap<String, u64>,
) {
    for (kind, max) in max_by_kind {
        let actual_bytes = actual
            .get(kind)
            .map(|summary| summary.memory.total_bytes)
            .unwrap_or_default();
        check_u64(
            violations,
            format!("{metric_prefix}.{kind}.memory.totalBytes"),
            actual_bytes,
            Some(*max),
        );
    }
}

pub(super) fn check_package_owned_memory(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    metric_prefix: &str,
    actual: &BTreeMap<String, NativeRendererSmokePackageMemorySummary>,
    max_by_package: &BTreeMap<String, u64>,
) {
    for (package_id, max) in max_by_package {
        let actual_bytes = actual
            .get(package_id)
            .map(|summary| summary.owned_memory.total_bytes)
            .unwrap_or_default();
        check_u64(
            violations,
            format!("{metric_prefix}.{package_id}.ownedMemory.totalBytes"),
            actual_bytes,
            Some(*max),
        );
    }
}

pub(super) fn check_package_dependent_memory(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    metric_prefix: &str,
    actual: &BTreeMap<String, NativeRendererSmokePackageMemorySummary>,
    max_by_package: &BTreeMap<String, u64>,
) {
    for (package_id, max) in max_by_package {
        let actual_bytes = actual
            .get(package_id)
            .map(|summary| summary.dependent_memory.total_bytes)
            .unwrap_or_default();
        check_u64(
            violations,
            format!("{metric_prefix}.{package_id}.dependentMemory.totalBytes"),
            actual_bytes,
            Some(*max),
        );
    }
}
