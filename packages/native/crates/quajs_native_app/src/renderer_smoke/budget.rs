use std::collections::BTreeMap;
use std::fmt::{Display, Formatter};
use std::path::Path;

use serde::Deserialize;

use super::summary::{
    NativeRendererSmokePackageMemorySummary, NativeRendererSmokeResourceKindMemorySummary,
    NativeRendererSmokeSummary,
};

pub const RENDERER_SMOKE_BUDGET_ENV: &str = "QUA_NATIVE_RENDERER_SMOKE_BUDGET";

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct NativeRendererSmokeBudget {
    #[serde(default)]
    pub max_missing_resources: Option<usize>,
    #[serde(default)]
    pub max_fallbacks: Option<usize>,
    #[serde(default)]
    pub max_video_fallbacks: Option<usize>,
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
pub struct NativeRendererSmokeBudgetReport {
    pub budget: NativeRendererSmokeBudget,
    pub violations: Vec<NativeRendererSmokeBudgetViolation>,
}

impl NativeRendererSmokeBudgetReport {
    pub fn check(budget: NativeRendererSmokeBudget, summary: &NativeRendererSmokeSummary) -> Self {
        let mut violations = Vec::new();
        check_usize(
            &mut violations,
            "missingResourceCount",
            summary.missing_resource_count,
            budget.max_missing_resources,
        );
        check_usize(
            &mut violations,
            "fallbackCount",
            summary.fallback_count,
            budget.max_fallbacks,
        );
        check_usize(
            &mut violations,
            "videoFallbackCount",
            summary.video_fallback_count,
            budget.max_video_fallbacks,
        );
        check_u64(
            &mut violations,
            "memory.totalBytes",
            summary.memory.total_bytes,
            budget.max_memory_bytes,
        );
        check_u64(
            &mut violations,
            "declarativeMemory.totalBytes",
            summary.declarative_memory.total_bytes,
            budget.max_declarative_memory_bytes,
        );
        check_u64(
            &mut violations,
            "audioMemory.totalBytes",
            summary.audio_memory.total_bytes,
            budget.max_audio_memory_bytes,
        );
        check_usize(
            &mut violations,
            "audioResourceCount",
            summary.audio_resource_count,
            budget.max_audio_resources,
        );
        check_usize(
            &mut violations,
            "activeAudioTrackCount",
            summary.active_audio_track_count,
            budget.max_active_audio_tracks,
        );
        check_resource_kind_memory(
            &mut violations,
            "memoryByKind",
            &summary.memory_by_kind,
            &budget.max_memory_bytes_by_kind,
        );
        check_package_owned_memory(
            &mut violations,
            "memoryByPackage",
            &summary.memory_by_package,
            &budget.max_owned_memory_bytes_by_package,
        );
        check_package_dependent_memory(
            &mut violations,
            "memoryByPackage",
            &summary.memory_by_package,
            &budget.max_dependent_memory_bytes_by_package,
        );
        check_package_owned_memory(
            &mut violations,
            "declarativeMemoryByPackage",
            &summary.declarative_memory_by_package,
            &budget.max_declarative_owned_memory_bytes_by_package,
        );
        check_package_dependent_memory(
            &mut violations,
            "declarativeMemoryByPackage",
            &summary.declarative_memory_by_package,
            &budget.max_declarative_dependent_memory_bytes_by_package,
        );
        check_package_owned_memory(
            &mut violations,
            "audioMemoryByPackage",
            &summary.audio_memory_by_package,
            &budget.max_audio_owned_memory_bytes_by_package,
        );
        check_package_dependent_memory(
            &mut violations,
            "audioMemoryByPackage",
            &summary.audio_memory_by_package,
            &budget.max_audio_dependent_memory_bytes_by_package,
        );

        Self { budget, violations }
    }

    pub fn is_ok(&self) -> bool {
        self.violations.is_empty()
    }
}

impl Display for NativeRendererSmokeBudgetReport {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "Native renderer smoke budget exceeded")?;
        if !self.violations.is_empty() {
            write!(formatter, ": ")?;
            for (index, violation) in self.violations.iter().enumerate() {
                if index > 0 {
                    write!(formatter, "; ")?;
                }
                write!(formatter, "{violation}")?;
            }
        }
        write!(formatter, ".")
    }
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

pub fn load_renderer_smoke_budget(
    path: impl AsRef<Path>,
) -> Result<NativeRendererSmokeBudget, NativeRendererSmokeBudgetLoadError> {
    let path = path.as_ref();
    let json =
        std::fs::read_to_string(path).map_err(|source| NativeRendererSmokeBudgetLoadError::Io {
            path: path.display().to_string(),
            source,
        })?;
    serde_json::from_str(&json).map_err(|source| NativeRendererSmokeBudgetLoadError::Json {
        path: path.display().to_string(),
        source,
    })
}

fn check_usize(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    metric: impl Into<String>,
    actual: usize,
    max: Option<usize>,
) {
    if let Some(max) = max {
        check_u64(violations, metric, actual as u64, Some(max as u64));
    }
}

fn check_u64(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    metric: impl Into<String>,
    actual: u64,
    max: Option<u64>,
) {
    if let Some(max) = max {
        if actual > max {
            violations.push(NativeRendererSmokeBudgetViolation {
                metric: metric.into(),
                actual,
                max,
            });
        }
    }
}

fn check_resource_kind_memory(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    metric_prefix: &str,
    actual: &BTreeMap<String, NativeRendererSmokeResourceKindMemorySummary>,
    max_by_kind: &BTreeMap<String, u64>,
) {
    for (kind, max) in max_by_kind {
        let actual_bytes = actual
            .get(kind)
            .map(|summary| summary.memory.total_bytes)
            .unwrap_or_default();
        check_u64(
            violations,
            format!("{metric_prefix}.{kind}.memory.totalBytes"),
            actual_bytes,
            Some(*max),
        );
    }
}

fn check_package_owned_memory(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    metric_prefix: &str,
    actual: &BTreeMap<String, NativeRendererSmokePackageMemorySummary>,
    max_by_package: &BTreeMap<String, u64>,
) {
    for (package_id, max) in max_by_package {
        let actual_bytes = actual
            .get(package_id)
            .map(|summary| summary.owned_memory.total_bytes)
            .unwrap_or_default();
        check_u64(
            violations,
            format!("{metric_prefix}.{package_id}.ownedMemory.totalBytes"),
            actual_bytes,
            Some(*max),
        );
    }
}

fn check_package_dependent_memory(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    metric_prefix: &str,
    actual: &BTreeMap<String, NativeRendererSmokePackageMemorySummary>,
    max_by_package: &BTreeMap<String, u64>,
) {
    for (package_id, max) in max_by_package {
        let actual_bytes = actual
            .get(package_id)
            .map(|summary| summary.dependent_memory.total_bytes)
            .unwrap_or_default();
        check_u64(
            violations,
            format!("{metric_prefix}.{package_id}.dependentMemory.totalBytes"),
            actual_bytes,
            Some(*max),
        );
    }
}

#[derive(Debug)]
pub enum NativeRendererSmokeBudgetLoadError {
    Io {
        path: String,
        source: std::io::Error,
    },
    Json {
        path: String,
        source: serde_json::Error,
    },
}

impl Display for NativeRendererSmokeBudgetLoadError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io { path, source } => {
                write!(
                    formatter,
                    "Failed to read renderer smoke budget \"{path}\": {source}."
                )
            }
            Self::Json { path, source } => {
                write!(
                    formatter,
                    "Failed to parse renderer smoke budget \"{path}\": {source}."
                )
            }
        }
    }
}

impl std::error::Error for NativeRendererSmokeBudgetLoadError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            Self::Json { source, .. } => Some(source),
        }
    }
}

#[cfg(test)]
mod tests;
