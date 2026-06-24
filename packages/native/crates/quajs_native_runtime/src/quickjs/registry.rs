use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use super::{QuickJsEvaluationRequest, QuickJsRuntimeModuleKind, QuickJsRuntimeModuleRecord};

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsModuleNamespaceRecord {
    pub id: String,
    pub package_id: String,
    pub bundle_name: String,
    pub asset_name: String,
    pub kind: QuickJsRuntimeModuleKind,
    pub module_bytes: u64,
    pub code_bytes: u64,
    pub revision: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickJsModuleNamespaceSummary {
    pub namespace_count: usize,
    pub package_count: usize,
    pub module_bytes: u64,
    pub code_bytes: u64,
}

#[derive(Debug, Clone, Default)]
pub struct QuickJsModuleNamespaceRegistry {
    namespaces: BTreeMap<String, QuickJsModuleNamespaceRecord>,
    revision: u64,
}

impl QuickJsModuleNamespaceRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register_evaluated_module(
        &mut self,
        module_namespace_id: impl Into<String>,
        request: &QuickJsEvaluationRequest,
    ) -> QuickJsModuleNamespaceRecord {
        self.revision += 1;
        let record = QuickJsModuleNamespaceRecord {
            id: module_namespace_id.into(),
            package_id: request.module.package_id.clone(),
            bundle_name: request.module.bundle_name.clone(),
            asset_name: request.module.asset_name.clone(),
            kind: request.module.kind,
            module_bytes: request.module.bytes.len() as u64,
            code_bytes: request.module.code.as_bytes().len() as u64,
            revision: self.revision,
        };
        self.namespaces.insert(record.id.clone(), record.clone());
        record
    }

    pub fn get(&self, id: &str) -> Option<&QuickJsModuleNamespaceRecord> {
        self.namespaces.get(id)
    }

    pub fn contains(&self, id: &str) -> bool {
        self.namespaces.contains_key(id)
    }

    pub fn len(&self) -> usize {
        self.namespaces.len()
    }

    pub fn is_empty(&self) -> bool {
        self.namespaces.is_empty()
    }

    pub fn records(&self) -> impl Iterator<Item = &QuickJsModuleNamespaceRecord> {
        self.namespaces.values()
    }

    pub fn release_namespace(&mut self, id: &str) -> Option<QuickJsModuleNamespaceRecord> {
        self.namespaces.remove(id)
    }

    pub fn release_package(&mut self, package_id: &str) -> Vec<QuickJsModuleNamespaceRecord> {
        let ids = self
            .namespaces
            .values()
            .filter(|record| record.package_id == package_id)
            .map(|record| record.id.clone())
            .collect::<Vec<_>>();

        ids.into_iter()
            .filter_map(|id| self.namespaces.remove(&id))
            .collect()
    }

    pub fn clear(&mut self) -> Vec<QuickJsModuleNamespaceRecord> {
        std::mem::take(&mut self.namespaces)
            .into_values()
            .collect()
    }

    pub fn summary(&self) -> QuickJsModuleNamespaceSummary {
        summarize(self.namespaces.values())
    }

    pub fn package_summary(&self, package_id: &str) -> QuickJsModuleNamespaceSummary {
        summarize(
            self.namespaces
                .values()
                .filter(|record| record.package_id == package_id),
        )
    }
}

pub fn quickjs_module_namespace_id(module: &QuickJsRuntimeModuleRecord) -> String {
    format!(
        "{}:{}:{}",
        module.package_id, module.bundle_name, module.asset_name
    )
}

fn summarize<'a>(
    records: impl Iterator<Item = &'a QuickJsModuleNamespaceRecord>,
) -> QuickJsModuleNamespaceSummary {
    let mut packages = BTreeSet::new();
    let mut summary = QuickJsModuleNamespaceSummary::default();

    for record in records {
        summary.namespace_count += 1;
        summary.module_bytes += record.module_bytes;
        summary.code_bytes += record.code_bytes;
        packages.insert(record.package_id.clone());
    }

    summary.package_count = packages.len();
    summary
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quickjs::{
        QuickJsEvaluationRequest, QuickJsRuntimeModuleKind, QuickJsRuntimeModuleRecord,
        QuickJsSandboxLimits,
    };

    #[test]
    fn registers_package_aware_namespace_records() {
        let mut registry = QuickJsModuleNamespaceRegistry::new();
        let request = request_for_asset("runtime.chapter.native-ui", "scripts/opening.js");

        let record = registry.register_evaluated_module("quickjs:module:1", &request);

        assert_eq!(record.id, "quickjs:module:1");
        assert_eq!(record.package_id, "runtime.chapter.native-ui");
        assert_eq!(record.asset_name, "scripts/opening.js");
        assert_eq!(record.module_bytes, 3);
        assert_eq!(record.code_bytes, 36);
        assert_eq!(registry.get(&record.id), Some(&record));
        assert_eq!(registry.summary().namespace_count, 1);
        assert_eq!(registry.summary().package_count, 1);
    }

    #[test]
    fn updates_existing_namespace_and_tracks_revision() {
        let mut registry = QuickJsModuleNamespaceRegistry::new();
        let first = registry.register_evaluated_module("quickjs:module:1", &request_for_asset(
            "runtime.chapter.native-ui",
            "scripts/opening.js",
        ));
        let second = registry.register_evaluated_module("quickjs:module:1", &request_for_asset(
            "runtime.chapter.native-ui",
            "scripts/opening.js",
        ));

        assert_eq!(first.id, second.id);
        assert_eq!(first.revision, 1);
        assert_eq!(second.revision, 2);
        assert_eq!(registry.len(), 1);
        assert_eq!(registry.get(&second.id).unwrap().revision, 2);
    }

    #[test]
    fn releases_namespaces_by_package() {
        let mut registry = QuickJsModuleNamespaceRegistry::new();
        let runtime_a = registry.register_evaluated_module("quickjs:a", &request_for_asset(
            "runtime.chapter.a",
            "scripts/a.js",
        ));
        let runtime_b = registry.register_evaluated_module("quickjs:b", &request_for_asset(
            "runtime.chapter.b",
            "scripts/b.js",
        ));
        registry.register_evaluated_module("quickjs:a-extra", &request_for_asset(
            "runtime.chapter.a",
            "scripts/a-extra.js",
        ));

        let released = registry.release_package("runtime.chapter.a");

        assert_eq!(released.len(), 2);
        assert!(!registry.contains(&runtime_a.id));
        assert!(registry.contains(&runtime_b.id));
        assert_eq!(registry.package_summary("runtime.chapter.a").namespace_count, 0);
        assert_eq!(registry.summary().namespace_count, 1);
    }

    fn request_for_asset(package_id: &str, asset_name: &str) -> QuickJsEvaluationRequest {
        QuickJsEvaluationRequest {
            module: QuickJsRuntimeModuleRecord {
                asset_name: asset_name.to_string(),
                bundle_name: package_id.to_string(),
                package_id: package_id.to_string(),
                kind: QuickJsRuntimeModuleKind::Script,
                code: "export default function opening() {}".to_string(),
                bytes: vec![1, 2, 3],
            },
            limits: QuickJsSandboxLimits::default(),
        }
    }
}
