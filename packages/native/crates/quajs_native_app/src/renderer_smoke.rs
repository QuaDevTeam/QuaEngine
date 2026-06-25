use std::fmt::{Display, Formatter};
use std::path::Path;

mod budget;
mod summary;

use budget::{
    load_renderer_smoke_budget, NativeRendererSmokeBudgetLoadError,
    NativeRendererSmokeBudgetReport, RENDERER_SMOKE_BUDGET_ENV,
};
use quajs_wgpu_renderer::renderer::{
    NativeRenderer, NativeRendererJsonFrameError, NullNativeRenderBackend,
};

pub use summary::NativeRendererSmokeSummary;

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
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());
    let result = renderer.prepare_and_render_json_str(&json)?;
    let metrics = renderer.metrics();

    Ok(NativeRendererSmokeSummary::from_frame_result(
        &result, &metrics,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_renderer_smoke_frame_from_json_file() {
        let path = unique_frame_path("valid");
        std::fs::write(&path, smoke_frame_json()).expect("renderer smoke fixture writes");

        let summary =
            run_renderer_smoke_frame_json(&path).expect("renderer smoke frame should render");

        assert_eq!(summary.revision, 1);
        assert_eq!(summary.pass_count, 2);
        assert_eq!(summary.resource_count, 3);
        assert_eq!(summary.missing_resource_count, 0);
        assert_eq!(summary.fallback_count, 0);
        assert_eq!(summary.declarative_resource_count, 1);
        assert_eq!(summary.declarative_asset_request_count, 1);
        assert!(summary.memory.total_bytes > 0);
        assert!(summary.declarative_memory.total_bytes > 0);
        assert!(summary.command_count >= 3);
        let json = serde_json::to_value(&summary).expect("smoke summary serializes");
        assert_eq!(json["missingResourceCount"], 0);
        assert!(json["memory"]["totalBytes"].as_u64().unwrap() > 0);
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

    fn smoke_frame_json() -> &'static str {
        r##"
        {
          "layout": { "preset": "landscape" },
          "container": { "width": 1600, "height": 1000, "devicePixelRatio": 2 },
          "view": {
            "background": {
              "mode": "image",
              "assetName": "bg/native-smoke.png",
              "provenance": { "contentPackageId": "base" }
            },
            "ui": {
              "overlays": [
                {
                  "elementId": "menu",
                  "surface": {
                    "key": "ui/native-smoke.qui",
                    "root": {
                      "id": "root",
                      "kind": "Box",
                      "bounds": { "x": 48, "y": 48, "width": 420, "height": 220 },
                      "style": {
                        "backgroundColor": "#101820",
                        "borderColor": "#5ac8fa",
                        "borderWidth": 2,
                        "borderRadius": 12
                      },
                      "children": [
                        {
                          "id": "title",
                          "kind": "Text",
                          "bounds": { "x": 80, "y": 80, "width": 280, "height": 48 },
                          "text": "Native Smoke",
                          "style": {
                            "color": "#f7f3e8",
                            "fontFamily": ["Qua Sans"],
                            "fontSize": 30,
                            "fontWeight": "bold",
                            "lineHeight": 38,
                            "textAlign": "center"
                          }
                        }
                      ]
                    }
                  },
                  "provenance": { "contentPackageId": "runtime.ui" }
                }
              ]
            }
          }
        }
        "##
    }
}
