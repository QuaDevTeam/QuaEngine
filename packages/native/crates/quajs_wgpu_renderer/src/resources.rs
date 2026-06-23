use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ResourceId(String);

impl ResourceId {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for ResourceId {
    fn from(value: &str) -> Self {
        Self::new(value)
    }
}

impl From<String> for ResourceId {
    fn from(value: String) -> Self {
        Self::new(value)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum NativeResourceKind {
    Texture,
    Buffer,
    GlyphAtlas,
    FontFace,
    DecodedImage,
    VideoDecoder,
    VideoFrameQueue,
    VideoTextureRing,
    AudioBuffer,
    AudioStream,
    AudioHandle,
    UiAst,
    QssStyle,
    TokenTable,
    RenderGraph,
    Other,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ResourceMemory {
    pub cpu_bytes: u64,
    pub gpu_bytes: u64,
}

impl ResourceMemory {
    pub fn total_bytes(self) -> u64 {
        self.cpu_bytes.saturating_add(self.gpu_bytes)
    }

    fn add_assign(&mut self, other: ResourceMemory) {
        self.cpu_bytes = self.cpu_bytes.saturating_add(other.cpu_bytes);
        self.gpu_bytes = self.gpu_bytes.saturating_add(other.gpu_bytes);
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeResourceRecord {
    pub id: ResourceId,
    pub kind: NativeResourceKind,
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
    pub memory: ResourceMemory,
    pub label: Option<String>,
}

impl NativeResourceRecord {
    pub fn new(id: impl Into<ResourceId>, kind: NativeResourceKind) -> Self {
        Self {
            id: id.into(),
            kind,
            owner_package_id: None,
            required_package_ids: BTreeSet::new(),
            memory: ResourceMemory::default(),
            label: None,
        }
    }

    pub fn owned_by(mut self, package_id: impl Into<String>) -> Self {
        self.owner_package_id = Some(package_id.into());
        self
    }

    pub fn require_package(mut self, package_id: impl Into<String>) -> Self {
        self.required_package_ids.insert(package_id.into());
        self
    }

    pub fn require_packages<I, S>(mut self, package_ids: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        for package_id in package_ids {
            self.required_package_ids.insert(package_id.into());
        }
        self
    }

    pub fn memory(mut self, cpu_bytes: u64, gpu_bytes: u64) -> Self {
        self.memory = ResourceMemory {
            cpu_bytes,
            gpu_bytes,
        };
        self
    }

    pub fn label(mut self, label: impl Into<String>) -> Self {
        self.label = Some(label.into());
        self
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ResourceKindSummary {
    pub count: usize,
    pub memory: ResourceMemory,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PackageResourceSummary {
    pub package_id: String,
    pub owned_count: usize,
    pub dependent_count: usize,
    pub owned_memory: ResourceMemory,
    pub dependent_memory: ResourceMemory,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ResourceLedgerSummary {
    pub total_count: usize,
    pub total_memory: ResourceMemory,
    pub by_kind: BTreeMap<NativeResourceKind, ResourceKindSummary>,
    pub by_package: BTreeMap<String, PackageResourceSummary>,
}

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

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PackageUnloadPlan {
    pub package_id: String,
    pub releasable: Vec<ResourceId>,
    pub blocked: Vec<PackageUnloadBlocker>,
    pub releasable_memory: ResourceMemory,
}

impl PackageUnloadPlan {
    pub fn can_unload(&self) -> bool {
        self.blocked.is_empty()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PackageUnloadBlocker {
    pub resource_id: ResourceId,
    pub kind: NativeResourceKind,
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
    pub reason: PackageUnloadBlockerReason,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PackageUnloadBlockerReason {
    PackageRequiredByForeignResource,
    OwnerStillRequiredByForeignPackage,
}

#[derive(Clone, Debug, Default)]
pub struct NativeResourceLedger {
    resources: BTreeMap<ResourceId, NativeResourceRecord>,
}

impl NativeResourceLedger {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn len(&self) -> usize {
        self.resources.len()
    }

    pub fn is_empty(&self) -> bool {
        self.resources.is_empty()
    }

    pub fn insert(&mut self, record: NativeResourceRecord) -> Option<NativeResourceRecord> {
        self.resources.insert(record.id.clone(), record)
    }

    pub fn remove(&mut self, id: impl Into<ResourceId>) -> Option<NativeResourceRecord> {
        self.resources.remove(&id.into())
    }

    pub fn get(&self, id: impl Into<ResourceId>) -> Option<&NativeResourceRecord> {
        self.resources.get(&id.into())
    }

    pub fn records(&self) -> impl Iterator<Item = &NativeResourceRecord> {
        self.resources.values()
    }

    pub fn summary(&self) -> ResourceLedgerSummary {
        let mut summary = ResourceLedgerSummary::default();
        summary.total_count = self.resources.len();

        for record in self.resources.values() {
            summary.total_memory.add_assign(record.memory);

            let kind_summary = summary.by_kind.entry(record.kind).or_default();
            kind_summary.count += 1;
            kind_summary.memory.add_assign(record.memory);

            if let Some(owner_package_id) = &record.owner_package_id {
                let package = package_summary_entry(&mut summary.by_package, owner_package_id);
                package.owned_count += 1;
                package.owned_memory.add_assign(record.memory);
            }

            for required_package_id in &record.required_package_ids {
                let package = package_summary_entry(&mut summary.by_package, required_package_id);
                package.dependent_count += 1;
                package.dependent_memory.add_assign(record.memory);
            }
        }

        summary
    }

    pub fn package_summary(&self, package_id: &str) -> PackageResourceSummary {
        self.summary()
            .by_package
            .get(package_id)
            .cloned()
            .unwrap_or_else(|| PackageResourceSummary {
                package_id: package_id.to_string(),
                ..Default::default()
            })
    }

    pub fn check_budget(&self, budget: &ResourceBudget) -> Vec<ResourceBudgetViolation> {
        let summary = self.summary();
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

    pub fn plan_package_unload(&self, package_id: &str) -> PackageUnloadPlan {
        let mut plan = PackageUnloadPlan {
            package_id: package_id.to_string(),
            ..Default::default()
        };

        for record in self.resources.values() {
            let owned_by_package = record.owner_package_id.as_deref() == Some(package_id);
            let requires_package = record.required_package_ids.contains(package_id);

            if owned_by_package {
                if record
                    .required_package_ids
                    .iter()
                    .any(|id| id != package_id)
                {
                    plan.blocked.push(PackageUnloadBlocker {
                        resource_id: record.id.clone(),
                        kind: record.kind,
                        owner_package_id: record.owner_package_id.clone(),
                        required_package_ids: record.required_package_ids.clone(),
                        reason: PackageUnloadBlockerReason::OwnerStillRequiredByForeignPackage,
                    });
                } else {
                    plan.releasable.push(record.id.clone());
                    plan.releasable_memory.add_assign(record.memory);
                }
            } else if requires_package {
                plan.blocked.push(PackageUnloadBlocker {
                    resource_id: record.id.clone(),
                    kind: record.kind,
                    owner_package_id: record.owner_package_id.clone(),
                    required_package_ids: record.required_package_ids.clone(),
                    reason: PackageUnloadBlockerReason::PackageRequiredByForeignResource,
                });
            }
        }

        plan
    }

    pub fn release_package_owned(&mut self, package_id: &str) -> Vec<NativeResourceRecord> {
        let ids: Vec<ResourceId> = self
            .resources
            .values()
            .filter(|record| {
                record.owner_package_id.as_deref() == Some(package_id)
                    && record
                        .required_package_ids
                        .iter()
                        .all(|required_package_id| required_package_id == package_id)
            })
            .map(|record| record.id.clone())
            .collect();

        ids.into_iter()
            .filter_map(|id| self.resources.remove(&id))
            .collect()
    }

    pub fn release_resource(&mut self, id: impl Into<ResourceId>) -> Option<NativeResourceRecord> {
        self.remove(id)
    }

    pub fn clear(&mut self) -> Vec<NativeResourceRecord> {
        std::mem::take(&mut self.resources).into_values().collect()
    }
}

fn package_summary_entry<'a>(
    packages: &'a mut BTreeMap<String, PackageResourceSummary>,
    package_id: &str,
) -> &'a mut PackageResourceSummary {
    packages
        .entry(package_id.to_string())
        .or_insert_with(|| PackageResourceSummary {
            package_id: package_id.to_string(),
            ..Default::default()
        })
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

#[cfg(test)]
mod tests {
    use super::*;

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

        let violations = ledger.check_budget(&ResourceBudget {
            max_cpu_bytes: Some(40),
            max_gpu_bytes: Some(80),
            max_total_bytes: Some(120),
            max_resource_count: Some(1),
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
        assert_eq!(violations[0].actual, 60);
        assert_eq!(violations[2].actual, 150);
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
}
