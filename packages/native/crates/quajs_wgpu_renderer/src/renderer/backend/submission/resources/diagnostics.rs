use std::collections::BTreeMap;

use crate::resources::NativeResourceKind;

use super::super::NativeRenderSubmission;
use super::NativeRenderMissingResource;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRenderBackendResourceDiagnostics {
    pub frames_with_missing_resources: usize,
    pub missing_resource_count: usize,
    pub last_missing_resources: Vec<NativeRenderMissingResource>,
    pub missing_resources_by_kind: BTreeMap<NativeResourceKind, usize>,
    pub missing_resources_by_owner_package: BTreeMap<String, usize>,
    pub missing_resources_by_required_package: BTreeMap<String, usize>,
}

impl NativeRenderBackendResourceDiagnostics {
    pub fn from_submissions(submissions: &[NativeRenderSubmission]) -> Self {
        let frames_with_missing_resources = submissions
            .iter()
            .filter(|submission| submission.missing_resource_count > 0)
            .count();
        let missing_resource_count = submissions
            .iter()
            .map(|submission| submission.missing_resource_count)
            .sum();
        let last_missing_resources = submissions
            .iter()
            .rev()
            .find(|submission| submission.missing_resource_count > 0)
            .map(|submission| submission.missing_resources.clone())
            .unwrap_or_default();
        let mut missing_resources_by_kind = BTreeMap::new();
        let mut missing_resources_by_owner_package = BTreeMap::new();
        let mut missing_resources_by_required_package = BTreeMap::new();

        for missing in submissions
            .iter()
            .flat_map(|submission| submission.missing_resources.iter())
        {
            *missing_resources_by_kind
                .entry(missing.resource_kind())
                .or_default() += 1;

            for package_id in &missing.owner_package_ids {
                *missing_resources_by_owner_package
                    .entry(package_id.clone())
                    .or_default() += 1;
            }
            for package_id in &missing.required_package_ids {
                *missing_resources_by_required_package
                    .entry(package_id.clone())
                    .or_default() += 1;
            }
        }

        Self {
            frames_with_missing_resources,
            missing_resource_count,
            last_missing_resources,
            missing_resources_by_kind,
            missing_resources_by_owner_package,
            missing_resources_by_required_package,
        }
    }
}
