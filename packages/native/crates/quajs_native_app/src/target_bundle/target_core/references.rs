use std::collections::BTreeSet;

use super::super::manifest::{NativeTargetBundleManifest, TargetBundleReference};
use super::constants::{COCOS_CORE_ADAPTERS, NATIVE_CORE_ADAPTERS, WEB_CORE_ADAPTERS};
use super::normalize::normalize_package_specifier;

pub(crate) fn collect_target_bundle_package_names(
    manifest: &NativeTargetBundleManifest,
) -> Vec<String> {
    let mut package_names = BTreeSet::new();

    collect_package_names(&manifest.selected_core_adapters, &mut package_names);
    collect_package_names(&manifest.dependencies, &mut package_names);
    collect_package_names(&manifest.renderer_entries, &mut package_names);

    for runtime_package in &manifest.runtime_packages {
        collect_package_names(&runtime_package.executable_dependencies, &mut package_names);
        collect_package_names(&runtime_package.renderer_entries, &mut package_names);
    }

    for project_graph in &manifest.project_graphs {
        collect_package_names(&project_graph.references, &mut package_names);
    }

    package_names.into_iter().collect()
}

pub(crate) fn selected_target_bootstraps(package_names: &[String]) -> Vec<&'static str> {
    let mut selected = Vec::new();

    if has_any_root(package_names, WEB_CORE_ADAPTERS) {
        selected.push("web");
    }
    if has_any_root(package_names, COCOS_CORE_ADAPTERS) {
        selected.push("cocos");
    }
    if has_any_root(package_names, NATIVE_CORE_ADAPTERS) {
        selected.push("native");
    }

    selected
}

fn collect_package_names(
    references: &[TargetBundleReference],
    package_names: &mut BTreeSet<String>,
) {
    for reference in references {
        for package_name in reference
            .specifiers()
            .into_iter()
            .map(normalize_package_specifier)
        {
            package_names.insert(package_name);
        }
    }
}

fn has_any_root(package_names: &[String], roots: &[&str]) -> bool {
    package_names
        .iter()
        .any(|package_name| roots.iter().any(|root| package_name == root))
}
