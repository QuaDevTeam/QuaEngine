use std::fmt::{Display, Formatter};
use std::path::Path;

use serde::Deserialize;

use super::summary::NativeRendererSmokeSummary;

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
    pub metric: &'static str,
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
    metric: &'static str,
    actual: usize,
    max: Option<usize>,
) {
    if let Some(max) = max {
        check_u64(violations, metric, actual as u64, Some(max as u64));
    }
}

fn check_u64(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    metric: &'static str,
    actual: u64,
    max: Option<u64>,
) {
    if let Some(max) = max {
        if actual > max {
            violations.push(NativeRendererSmokeBudgetViolation {
                metric,
                actual,
                max,
            });
        }
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
mod tests {
    use super::*;
    use crate::renderer_smoke::summary::NativeRendererSmokeMemorySummary;

    #[test]
    fn accepts_summary_within_budget() {
        let summary = summary();
        let report = NativeRendererSmokeBudgetReport::check(
            NativeRendererSmokeBudget {
                max_missing_resources: Some(1),
                max_fallbacks: Some(2),
                max_memory_bytes: Some(256),
                max_declarative_memory_bytes: Some(128),
                ..Default::default()
            },
            &summary,
        );

        assert!(report.is_ok());
    }

    #[test]
    fn reports_all_budget_violations() {
        let summary = summary();
        let report = NativeRendererSmokeBudgetReport::check(
            NativeRendererSmokeBudget {
                max_missing_resources: Some(0),
                max_fallbacks: Some(0),
                max_video_fallbacks: Some(0),
                max_memory_bytes: Some(99),
                max_declarative_memory_bytes: Some(39),
                max_audio_memory_bytes: Some(9),
                max_audio_resources: Some(0),
                max_active_audio_tracks: Some(0),
            },
            &summary,
        );

        assert_eq!(
            report
                .violations
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>(),
            vec![
                "missingResourceCount=1 exceeded max 0",
                "fallbackCount=2 exceeded max 0",
                "videoFallbackCount=1 exceeded max 0",
                "memory.totalBytes=100 exceeded max 99",
                "declarativeMemory.totalBytes=40 exceeded max 39",
                "audioMemory.totalBytes=10 exceeded max 9",
                "audioResourceCount=1 exceeded max 0",
                "activeAudioTrackCount=1 exceeded max 0",
            ]
        );
    }

    #[test]
    fn rejects_unknown_budget_fields() {
        let path = unique_budget_path("unknown");
        std::fs::write(&path, r#"{ "maxMemoryByts": 1 }"#)
            .expect("renderer smoke budget fixture writes");

        let error =
            load_renderer_smoke_budget(&path).expect_err("unknown budget fields should fail");

        assert!(error.to_string().contains("unknown field"));
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn displays_budget_report() {
        let summary = summary();
        let report = NativeRendererSmokeBudgetReport::check(
            NativeRendererSmokeBudget {
                max_memory_bytes: Some(0),
                ..Default::default()
            },
            &summary,
        );

        assert_eq!(
            report.to_string(),
            "Native renderer smoke budget exceeded: memory.totalBytes=100 exceeded max 0."
        );
    }

    fn summary() -> NativeRendererSmokeSummary {
        NativeRendererSmokeSummary {
            revision: 1,
            pass_count: 2,
            batch_count: 3,
            command_count: 4,
            resource_count: 5,
            missing_resource_count: 1,
            fallback_count: 2,
            video_fallback_count: 1,
            declarative_asset_request_count: 1,
            declarative_resource_count: 1,
            audio_resource_count: 1,
            active_audio_track_count: 1,
            resource_package_count: 2,
            resource_kind_count: 3,
            memory: memory(60, 40),
            declarative_memory: memory(40, 0),
            audio_memory: memory(10, 0),
        }
    }

    fn memory(cpu_bytes: u64, gpu_bytes: u64) -> NativeRendererSmokeMemorySummary {
        NativeRendererSmokeMemorySummary {
            cpu_bytes,
            gpu_bytes,
            total_bytes: cpu_bytes + gpu_bytes,
        }
    }

    fn unique_budget_path(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "quajs-native-renderer-smoke-budget-{label}-{}-{}.json",
            std::process::id(),
            std::thread::current().name().unwrap_or("test")
        ))
    }
}
