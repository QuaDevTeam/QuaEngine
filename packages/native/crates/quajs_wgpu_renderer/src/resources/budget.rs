use std::collections::BTreeMap;

use super::record::{NativeResourceKind, ResourceMemory};
use super::summary::ResourceLedgerSummary;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ResourceBudget {
    pub max_cpu_bytes: Option<u64>,
    pub max_gpu_bytes: Option<u64>,
    pub max_total_bytes: Option<u64>,
    pub max_resource_count: Option<usize>,
    pub max_resource_count_by_kind: BTreeMap<NativeResourceKind, usize>,
    pub max_memory_by_kind: BTreeMap<NativeResourceKind, ResourceMemoryBudget>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ResourceMemoryBudget {
    pub max_cpu_bytes: Option<u64>,
    pub max_gpu_bytes: Option<u64>,
    pub max_total_bytes: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResourceBudgetViolation {
    pub code: ResourceBudgetViolationCode,
    pub actual: u64,
    pub limit: u64,
    pub message: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResourceBudgetViolationCode {
    CpuBytesExceeded,
    GpuBytesExceeded,
    TotalBytesExceeded,
    ResourceCountExceeded,
    ResourceKindCountExceeded,
    ResourceKindCpuBytesExceeded,
    ResourceKindGpuBytesExceeded,
    ResourceKindTotalBytesExceeded,
}

pub(crate) fn budget_violations(
    summary: &ResourceLedgerSummary,
    budget: &ResourceBudget,
) -> Vec<ResourceBudgetViolation> {
    let mut violations = Vec::new();

    push_budget_violation(
        &mut violations,
        budget.max_cpu_bytes,
        summary.total_memory.cpu_bytes,
        ResourceBudgetViolationCode::CpuBytesExceeded,
        "Native renderer CPU resource memory exceeds budget.",
    );
    push_budget_violation(
        &mut violations,
        budget.max_gpu_bytes,
        summary.total_memory.gpu_bytes,
        ResourceBudgetViolationCode::GpuBytesExceeded,
        "Native renderer GPU resource memory exceeds budget.",
    );
    push_budget_violation(
        &mut violations,
        budget.max_total_bytes,
        summary.total_memory.total_bytes(),
        ResourceBudgetViolationCode::TotalBytesExceeded,
        "Native renderer total resource memory exceeds budget.",
    );
    if let Some(limit) = budget.max_resource_count {
        if summary.total_count > limit {
            violations.push(ResourceBudgetViolation {
                code: ResourceBudgetViolationCode::ResourceCountExceeded,
                actual: summary.total_count as u64,
                limit: limit as u64,
                message: "Native renderer resource count exceeds budget.".to_string(),
            });
        }
    }

    for (kind, limit) in &budget.max_resource_count_by_kind {
        let actual = summary
            .by_kind
            .get(kind)
            .map(|summary| summary.count)
            .unwrap_or_default();
        if actual > *limit {
            violations.push(ResourceBudgetViolation {
                code: ResourceBudgetViolationCode::ResourceKindCountExceeded,
                actual: actual as u64,
                limit: *limit as u64,
                message: format!("Native renderer {kind:?} resource count exceeds budget."),
            });
        }
    }

    for (kind, limit) in &budget.max_memory_by_kind {
        let actual = summary
            .by_kind
            .get(kind)
            .map(|summary| summary.memory)
            .unwrap_or_default();
        push_kind_memory_budget_violations(&mut violations, *kind, actual, limit);
    }

    violations
}

fn push_kind_memory_budget_violations(
    violations: &mut Vec<ResourceBudgetViolation>,
    kind: NativeResourceKind,
    actual: ResourceMemory,
    limit: &ResourceMemoryBudget,
) {
    push_budget_violation(
        violations,
        limit.max_cpu_bytes,
        actual.cpu_bytes,
        ResourceBudgetViolationCode::ResourceKindCpuBytesExceeded,
        &format!("Native renderer {kind:?} CPU resource memory exceeds budget."),
    );
    push_budget_violation(
        violations,
        limit.max_gpu_bytes,
        actual.gpu_bytes,
        ResourceBudgetViolationCode::ResourceKindGpuBytesExceeded,
        &format!("Native renderer {kind:?} GPU resource memory exceeds budget."),
    );
    push_budget_violation(
        violations,
        limit.max_total_bytes,
        actual.total_bytes(),
        ResourceBudgetViolationCode::ResourceKindTotalBytesExceeded,
        &format!("Native renderer {kind:?} total resource memory exceeds budget."),
    );
}

fn push_budget_violation(
    violations: &mut Vec<ResourceBudgetViolation>,
    limit: Option<u64>,
    actual: u64,
    code: ResourceBudgetViolationCode,
    message: &str,
) {
    if let Some(limit) = limit {
        if actual > limit {
            violations.push(ResourceBudgetViolation {
                code,
                actual,
                limit,
                message: message.to_string(),
            });
        }
    }
}
