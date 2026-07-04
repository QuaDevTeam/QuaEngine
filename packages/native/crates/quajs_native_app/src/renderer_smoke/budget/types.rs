use std::collections::BTreeMap;
use std::fmt::{Display, Formatter};

use serde::Deserialize;

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct NativeRendererSmokeBudget {
    #[serde(default)]
    pub max_passes: Option<usize>,
    #[serde(default)]
    pub max_batches: Option<usize>,
    #[serde(default)]
    pub max_commands: Option<usize>,
    #[serde(default)]
    pub max_resources: Option<usize>,
    #[serde(default)]
    pub max_missing_resources: Option<usize>,
    #[serde(default)]
    pub max_fallbacks: Option<usize>,
    #[serde(default)]
    pub max_video_fallbacks: Option<usize>,
    #[serde(default)]
    pub max_fallbacks_by_owner_package: BTreeMap<String, usize>,
    #[serde(default)]
    pub max_fallbacks_by_required_package: BTreeMap<String, usize>,
    #[serde(default)]
    pub max_texture_upload_requests: Option<usize>,
    #[serde(default)]
    pub max_texture_upload_pending_requests: Option<usize>,
    #[serde(default)]
    pub max_texture_upload_resident_resources: Option<usize>,
    #[serde(default)]
    pub max_texture_upload_orphaned_resident_resources: Option<usize>,
    #[serde(default)]
    pub max_texture_upload_skipped_resources: Option<usize>,
    #[serde(default)]
    pub max_texture_upload_non_texture_resources: Option<usize>,
    #[serde(default)]
    pub max_declarative_asset_requests: Option<usize>,
    #[serde(default)]
    pub max_declarative_resources: Option<usize>,
    #[serde(default)]
    pub max_resource_packages: Option<usize>,
    #[serde(default)]
    pub max_resource_kinds: Option<usize>,
    #[serde(default)]
    pub max_memory_bytes: Option<u64>,
    #[serde(default)]
    pub max_declarative_memory_bytes: Option<u64>,
    #[serde(default)]
    pub max_audio_memory_bytes: Option<u64>,
    #[serde(default)]
    pub max_audio_resources: Option<usize>,
    #[serde(default)]
    pub max_active_audio_tracks: Option<usize>,
    #[serde(default)]
    pub max_backend_draws: Option<usize>,
    #[serde(default)]
    pub max_backend_skipped_draws: Option<usize>,
    #[serde(default)]
    pub max_backend_resource_binds: Option<usize>,
    #[serde(default)]
    pub max_backend_bound_resource_references: Option<usize>,
    #[serde(default)]
    pub max_backend_missing_resource_references: Option<usize>,
    #[serde(default)]
    pub max_backend_validation_errors: Option<usize>,
    #[serde(default)]
    pub max_backend_skipped_draws_by_reason: BTreeMap<String, usize>,
    #[serde(default)]
    pub max_backend_skipped_draws_by_owner_package: BTreeMap<String, usize>,
    #[serde(default)]
    pub max_backend_skipped_draws_by_required_package: BTreeMap<String, usize>,
    #[serde(default)]
    pub max_backend_missing_resource_references_by_owner_package: BTreeMap<String, usize>,
    #[serde(default)]
    pub max_backend_missing_resource_references_by_required_package: BTreeMap<String, usize>,
    #[serde(default)]
    pub max_memory_bytes_by_kind: BTreeMap<String, u64>,
    #[serde(default)]
    pub max_owned_memory_bytes_by_package: BTreeMap<String, u64>,
    #[serde(default)]
    pub max_dependent_memory_bytes_by_package: BTreeMap<String, u64>,
    #[serde(default)]
    pub max_declarative_owned_memory_bytes_by_package: BTreeMap<String, u64>,
    #[serde(default)]
    pub max_declarative_dependent_memory_bytes_by_package: BTreeMap<String, u64>,
    #[serde(default)]
    pub max_audio_owned_memory_bytes_by_package: BTreeMap<String, u64>,
    #[serde(default)]
    pub max_audio_dependent_memory_bytes_by_package: BTreeMap<String, u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRendererSmokeBudgetViolation {
    pub metric: String,
    pub actual: u64,
    pub max: u64,
}

impl Display for NativeRendererSmokeBudgetViolation {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "{}={} exceeded max {}",
            self.metric, self.actual, self.max
        )
    }
}
