use std::fmt::{Display, Formatter};
use std::path::Path;

use super::types::NativeRendererSmokeBudget;

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
