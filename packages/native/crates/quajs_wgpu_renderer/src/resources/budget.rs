use super::summary::ResourceLedgerSummary;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ResourceBudget {
    pub max_cpu_bytes: Option<u64>,
    pub max_gpu_bytes: Option<u64>,
    pub max_total_bytes: Option<u64>,
    pub max_resource_count: Option<usize>,
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

    violations
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
