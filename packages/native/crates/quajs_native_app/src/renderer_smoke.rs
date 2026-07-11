use std::fmt::{Display, Formatter};
use std::path::Path;

mod budget;
mod summary;

use budget::{
    load_renderer_smoke_budget, NativeRendererSmokeBudgetLoadError,
    NativeRendererSmokeBudgetReport, RENDERER_SMOKE_BUDGET_ENV,
};
use quajs_wgpu_renderer::audio::NullNativeAudioBackend;
use quajs_wgpu_renderer::renderer::{
    NativeRenderer, NativeRendererJsonFrameError, NullNativeRenderBackend,
};

pub use summary::{NativeRendererSmokeAudioBackendSummary, NativeRendererSmokeSummary};

pub const RENDERER_SMOKE_FRAME_ENV: &str = "QUA_NATIVE_RENDERER_SMOKE_FRAME";

#[derive(Debug)]
pub enum NativeRendererSmokeError {
    Io {
        path: String,
        source: std::io::Error,
    },
    Frame(NativeRendererJsonFrameError),
    BudgetLoad(NativeRendererSmokeBudgetLoadError),
    BudgetExceeded(NativeRendererSmokeBudgetReport),
}

impl Display for NativeRendererSmokeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io { path, source } => {
                write!(
                    formatter,
                    "Failed to read renderer smoke frame \"{path}\": {source}."
                )
            }
            Self::Frame(error) => write!(formatter, "Native renderer smoke frame failed: {error}."),
            Self::BudgetLoad(error) => write!(formatter, "{error}"),
            Self::BudgetExceeded(report) => write!(formatter, "{report}"),
        }
    }
}

impl std::error::Error for NativeRendererSmokeError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            Self::Frame(source) => Some(source),
            Self::BudgetLoad(source) => Some(source),
            Self::BudgetExceeded(_) => None,
        }
    }
}

impl From<NativeRendererJsonFrameError> for NativeRendererSmokeError {
    fn from(error: NativeRendererJsonFrameError) -> Self {
        Self::Frame(error)
    }
}

impl From<NativeRendererSmokeBudgetLoadError> for NativeRendererSmokeError {
    fn from(error: NativeRendererSmokeBudgetLoadError) -> Self {
        Self::BudgetLoad(error)
    }
}

pub fn run_renderer_smoke_from_env(
) -> Result<Option<NativeRendererSmokeSummary>, NativeRendererSmokeError> {
    let Some(path) = std::env::var_os(RENDERER_SMOKE_FRAME_ENV) else {
        return Ok(None);
    };

    let summary = run_renderer_smoke_frame_json(std::path::PathBuf::from(path))?;
    if let Some(budget_path) = std::env::var_os(RENDERER_SMOKE_BUDGET_ENV) {
        let budget = load_renderer_smoke_budget(std::path::PathBuf::from(budget_path))?;
        let report = NativeRendererSmokeBudgetReport::check(budget, &summary);
        if !report.is_ok() {
            return Err(NativeRendererSmokeError::BudgetExceeded(report));
        }
    }

    Ok(Some(summary))
}

pub fn run_renderer_smoke_frame_json(
    path: impl AsRef<Path>,
) -> Result<NativeRendererSmokeSummary, NativeRendererSmokeError> {
    let path = path.as_ref();
    let json = std::fs::read_to_string(path).map_err(|source| NativeRendererSmokeError::Io {
        path: path.display().to_string(),
        source,
    })?;
    let mut renderer = NativeRenderer::with_audio_backend(
        NullNativeRenderBackend::new(),
        NullNativeAudioBackend::new(),
    );
    let result = renderer.prepare_render_json_and_apply_audio_str(&json)?;
    let metrics = renderer.metrics();
    let backend_report = renderer.backend().last_execution_report();
    let audio_backend_summary =
        NativeRendererSmokeAudioBackendSummary::from_null_backend(renderer.audio_backend());

    Ok(NativeRendererSmokeSummary::from_frame_result(
        &result,
        &metrics,
        backend_report,
        audio_backend_summary,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHARED_QUI_QSS_SURFACE_FRAME: &str =
        include_str!("../../../test-fixtures/renderer/qui-qss-surface-frame.json");
    const AUDIO_FRAME: &str = r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "audio": {
          "tracks": [
            {
              "id": "bgm-main",
              "kind": "bgm",
              "assetName": "audio/theme.ogg",
              "assetType": "bgm",
              "loadMode": "buffered",
              "playbackState": "playing",
              "looped": true,
              "volume": 0.8
            }
          ]
        }
      }
    }
    "#;

    #[test]
    fn runs_renderer_smoke_frame_from_json_file() {
        let path = unique_frame_path("valid");
        std::fs::write(&path, SHARED_QUI_QSS_SURFACE_FRAME).expect("renderer smoke fixture writes");

        let summary =
            run_renderer_smoke_frame_json(&path).expect("renderer smoke frame should render");

        assert_eq!(summary.revision, 1);
        assert!(summary.pass_count >= 1);
        assert_eq!(summary.resource_count, 5);
        assert_eq!(summary.missing_resource_count, 0);
        assert_eq!(summary.fallback_count, 0);
        assert_eq!(summary.texture_upload_request_count, 2);
        assert_eq!(summary.texture_upload_pending_request_count, 2);
        assert_eq!(summary.texture_upload_resident_resource_count, 0);
        assert_eq!(summary.texture_upload_orphaned_resident_resource_count, 0);
        assert_eq!(summary.texture_upload_skipped_resource_count, 0);
        assert_eq!(summary.texture_upload_non_texture_resource_count, 3);
        assert_eq!(summary.declarative_resource_count, 1);
        assert_eq!(summary.declarative_asset_request_count, 1);
        assert_eq!(summary.audio_resource_count, 0);
        assert_eq!(summary.active_audio_track_count, 0);
        assert_eq!(summary.audio_backend.applied_plan_count, 1);
        assert_eq!(summary.audio_backend.applied_command_count, 0);
        assert_eq!(summary.audio_backend.active_track_count, 0);
        assert!(summary.memory.total_bytes > 0);
        assert!(summary.declarative_memory.total_bytes > 0);
        assert_eq!(summary.backend.pass_count, summary.pass_count);
        assert!(summary.backend.command_count >= summary.command_count);
        assert!(summary.backend.draw_count >= summary.command_count);
        assert_eq!(summary.backend.skipped_draw_count, 0);
        assert!(summary.backend.resource_bind_count >= 1);
        assert_eq!(summary.backend.validation_error_count, 0);
        assert!(summary.command_graph_signature.starts_with("fnv1a64:"));
        assert!(summary
            .command_ids
            .iter()
            .any(|command_id| command_id == "ui:compiled-menu:open-settings"));
        assert!(
            summary
                .command_kind_counts
                .get("text")
                .copied()
                .unwrap_or(0)
                > 0
        );
        assert!(summary.memory_by_kind["uiAst"].memory.total_bytes > 0);
        assert!(
            summary.memory_by_package["runtime.ui"]
                .owned_memory
                .total_bytes
                > 0
        );
        assert!(
            summary.declarative_memory_by_package["runtime.ui"]
                .owned_memory
                .total_bytes
                > 0
        );
        assert!(summary.command_count >= 3);
        let json = serde_json::to_value(&summary).expect("smoke summary serializes");
        assert_eq!(json["missingResourceCount"], 0);
        assert_eq!(json["textureUploadRequestCount"], 2);
        assert_eq!(json["textureUploadPendingRequestCount"], 2);
        assert_eq!(json["textureUploadResidentResourceCount"], 0);
        assert_eq!(json["textureUploadOrphanedResidentResourceCount"], 0);
        assert_eq!(json["textureUploadSkippedResourceCount"], 0);
        assert_eq!(json["textureUploadNonTextureResourceCount"], 3);
        assert_eq!(json["audioBackend"]["appliedPlanCount"], 1);
        assert_eq!(json["audioBackend"]["appliedCommandCount"], 0);
        assert_eq!(json["audioBackend"]["activeTrackCount"], 0);
        assert!(json["backend"]["drawCount"].as_u64().unwrap() > 0);
        assert!(json["backend"]["resourceBindCount"].as_u64().unwrap() > 0);
        assert_eq!(json["backend"]["validationErrorCount"], 0);
        assert!(json["commandGraphSignature"]
            .as_str()
            .unwrap()
            .starts_with("fnv1a64:"));
        assert!(json["commandIds"]
            .as_array()
            .unwrap()
            .iter()
            .any(|value| value == "ui:compiled-menu:open-settings"));
        assert!(json["commandKindCounts"]["text"].as_u64().unwrap() > 0);
        assert!(json["backend"]["skippedDrawsByReason"]
            .as_object()
            .unwrap()
            .is_empty());
        assert!(json["backend"]["missingResourceIds"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(json["memory"]["totalBytes"].as_u64().unwrap() > 0);
        assert!(
            json["memoryByKind"]["uiAst"]["memory"]["totalBytes"]
                .as_u64()
                .unwrap()
                > 0
        );
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn renderer_smoke_applies_audio_backend_commands() {
        let path = unique_frame_path("audio");
        std::fs::write(&path, AUDIO_FRAME).expect("audio renderer smoke fixture writes");

        let summary =
            run_renderer_smoke_frame_json(&path).expect("audio smoke frame should render");

        assert_eq!(summary.audio_resource_count, 2);
        assert_eq!(summary.active_audio_track_count, 1);
        assert_eq!(summary.audio_backend.applied_plan_count, 1);
        assert_eq!(summary.audio_backend.applied_command_count, 2);
        assert_eq!(summary.audio_backend.active_track_count, 1);
        let json = serde_json::to_value(&summary).expect("audio smoke summary serializes");
        assert_eq!(json["audioBackend"]["appliedPlanCount"], 1);
        assert_eq!(json["audioBackend"]["appliedCommandCount"], 2);
        assert_eq!(json["audioBackend"]["activeTrackCount"], 1);

        std::fs::remove_file(path).ok();
    }

    #[test]
    fn reports_parse_errors_for_invalid_smoke_frame_json() {
        let path = unique_frame_path("invalid");
        std::fs::write(&path, "{not json").expect("invalid renderer smoke fixture writes");

        let error = run_renderer_smoke_frame_json(&path).expect_err("invalid frame JSON fails");

        assert!(error
            .to_string()
            .contains("Failed to parse native renderer frame JSON"));
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn reports_missing_smoke_frame_files() {
        let path = unique_frame_path("missing");

        let error = run_renderer_smoke_frame_json(&path).expect_err("missing frame JSON fails");

        assert!(error
            .to_string()
            .contains("Failed to read renderer smoke frame"));
    }

    fn unique_frame_path(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "quajs-native-renderer-smoke-{label}-{}-{}.json",
            std::process::id(),
            std::thread::current().name().unwrap_or("test")
        ))
    }
}
