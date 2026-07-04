mod fixtures;
mod memory_ledger;

mod audio_metrics;
mod memory;
mod package_release;
mod render_graph;
mod replacement;

pub(super) const RENDER_GRAPH_ITERATIONS: usize = 64;
pub(super) const MEMORY_LEDGER_RESOURCE_COUNT: usize = 1_000;
pub(super) const AUDIO_METRICS_ITERATIONS: usize = 96;
pub(super) const AUDIO_METRICS_TRACK_COUNT: usize = 48;
pub(super) const PACKAGE_RELEASE_ITERATIONS: usize = 64;
pub(super) const PACKAGE_RELEASE_RESOURCE_COUNT: usize = 1_200;
pub(super) const RESOURCE_REPLACEMENT_ITERATIONS: usize = 64;
pub(super) const RESOURCE_REPLACEMENT_RESOURCE_COUNT: usize = 256;
