mod checks;
mod constants;
mod normalize;
mod references;

pub(super) use checks::{
    check_exclusive_native_bootstrap, check_foreign_target_roots,
    check_project_graph_core_adapters, check_renderer_entry_targets,
    check_runtime_package_core_adapters, check_selected_core_adapters,
};
#[cfg(test)]
pub use constants::NATIVE_CORE_ADAPTERS;
pub(super) use references::{collect_target_bundle_package_names, selected_target_bootstraps};
