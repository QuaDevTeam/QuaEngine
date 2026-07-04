use std::collections::BTreeSet;

use super::super::manifest::{NativeTargetBundleManifest, TargetBundleReference};
use super::constants::{
    is_target_core_adapter_root, target_core_plugin_family, NATIVE_CORE_ADAPTERS,
};
use super::normalize::normalize_package_specifier;

pub(crate) fn check_selected_core_adapters(
    manifest: &NativeTargetBundleManifest,
    diagnostics: &mut Vec<String>,
) {
    let selected: BTreeSet<String> = manifest
        .selected_core_adapters
        .iter()
        .flat_map(TargetBundleReference::specifiers)
        .map(normalize_package_specifier)
        .collect();
    let expected: BTreeSet<String> = NATIVE_CORE_ADAPTERS
        .iter()
        .map(|specifier| (*specifier).to_string())
        .collect();

    for package_name in expected.difference(&selected) {
        diagnostics.push(format!(
            "Native target bundle is missing required core adapter \"{}\".",
            package_name
        ));
    }

    for package_name in selected.difference(&expected) {
        diagnostics.push(format!(
            "Native target bundle selected unexpected core adapter \"{}\".",
            package_name
        ));
    }
}

pub(crate) fn check_exclusive_native_bootstrap(
    selected_targets: &[&'static str],
    diagnostics: &mut Vec<String>,
) {
    if selected_targets.is_empty() {
        diagnostics.push("Native app startup found no target bootstrap core adapter.".to_string());
    } else if selected_targets != ["native"] {
        diagnostics.push(format!(
            "Native app startup package graph mixes target bootstrap core adapters for {}.",
            selected_targets.join(", ")
        ));
    }
}

pub(crate) fn check_foreign_target_roots(package_names: &[String], diagnostics: &mut Vec<String>) {
    for package_name in package_names {
        match target_core_plugin_family(package_name) {
            Some("web-core") | Some("cocos-core") => diagnostics.push(format!(
                "Native target bundle must not include foreign target core adapter \"{}\".",
                package_name
            )),
            _ => {}
        }
    }
}

pub(crate) fn check_renderer_entry_targets(
    manifest: &NativeTargetBundleManifest,
    diagnostics: &mut Vec<String>,
) {
    for reference in &manifest.renderer_entries {
        push_renderer_entry_target_diagnostic(reference, None, diagnostics);
    }

    for runtime_package in &manifest.runtime_packages {
        for reference in &runtime_package.renderer_entries {
            push_renderer_entry_target_diagnostic(
                reference,
                Some(&runtime_package.id),
                diagnostics,
            );
        }
    }
}

pub(crate) fn check_runtime_package_core_adapters(
    manifest: &NativeTargetBundleManifest,
    diagnostics: &mut Vec<String>,
) {
    for runtime_package in &manifest.runtime_packages {
        for package_name in runtime_package
            .executable_dependencies
            .iter()
            .flat_map(TargetBundleReference::specifiers)
            .map(normalize_package_specifier)
        {
            if is_target_core_adapter_root(&package_name) {
                diagnostics.push(format!(
                    "Runtime package \"{}\" must not include target core adapter \"{}\" through executableDependencies.",
                    runtime_package.id, package_name
                ));
            }
        }

        for package_name in runtime_package
            .renderer_entries
            .iter()
            .flat_map(TargetBundleReference::specifiers)
            .map(normalize_package_specifier)
        {
            if is_target_core_adapter_root(&package_name) {
                diagnostics.push(format!(
                    "Runtime package \"{}\" must not include target core adapter \"{}\" through rendererEntries.",
                    runtime_package.id, package_name
                ));
            }
        }
    }
}

pub(crate) fn check_project_graph_core_adapters(
    manifest: &NativeTargetBundleManifest,
    diagnostics: &mut Vec<String>,
) {
    for project_graph in &manifest.project_graphs {
        for package_name in project_graph
            .references
            .iter()
            .flat_map(TargetBundleReference::specifiers)
            .map(normalize_package_specifier)
        {
            let Some(package_core_family) = target_core_plugin_family(&package_name) else {
                continue;
            };

            if project_graph.kind == "post-bundle" && package_core_family == "native-core" {
                continue;
            }

            if project_graph.kind == "post-bundle" {
                diagnostics.push(format!(
                    "Post-bundle project graph \"{}\" for native target must not include inactive target core adapter \"{}\" from \"{}\".",
                    project_graph.id, package_name, package_core_family
                ));
            } else {
                diagnostics.push(format!(
                    "Project graph \"{}\" ({}) for native target must not declare target core adapter \"{}\" from \"{}\". Target core wiring belongs only in the native target-core resolver.",
                    project_graph.id, project_graph.kind, package_name, package_core_family
                ));
            }
        }
    }
}

fn push_renderer_entry_target_diagnostic(
    reference: &TargetBundleReference,
    runtime_package_id: Option<&str>,
    diagnostics: &mut Vec<String>,
) {
    let Some(target) = reference.target() else {
        let package_name = reference
            .specifier()
            .map(normalize_package_specifier)
            .unwrap_or_else(|| "unknown".to_string());
        let message = match runtime_package_id {
            Some(package_id) => format!(
                "Runtime package \"{}\" renderer entry \"{}\" must declare target \"native\".",
                package_id, package_name
            ),
            None => format!(
                "Renderer entry \"{}\" must declare target \"native\".",
                package_name
            ),
        };
        diagnostics.push(message);
        return;
    };
    if target == "native" {
        return;
    }

    let package_name = reference
        .specifier()
        .map(normalize_package_specifier)
        .unwrap_or_else(|| "unknown".to_string());
    let message = match runtime_package_id {
        Some(package_id) => format!(
            "Runtime package \"{}\" declares renderer entry \"{}\" for target \"{}\", but native startup only accepts target \"native\".",
            package_id, package_name, target
        ),
        None => format!(
            "Renderer entry \"{}\" declares target \"{}\", but native startup only accepts target \"native\".",
            package_name, target
        ),
    };
    diagnostics.push(message);
}
