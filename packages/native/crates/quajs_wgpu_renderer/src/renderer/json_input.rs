use std::fmt::{Display, Formatter};

use serde::{Deserialize, Serialize};

use crate::audio::{NativeAudioBackend, NativeAudioBackendError};
use crate::projection::view::ViewProjection;
use crate::renderer::backend::{NativeRenderBackend, NativeRenderBackendError};
use crate::renderer::facade::{
    NativeRenderer, NativeRendererFrameError, NativeRendererFrameResult,
};
use crate::renderer::json_validation::{
    validate_json_frame_input, validate_json_frame_required_fields,
    validate_json_frame_unsupported_fields,
};
use crate::renderer::resource_update::NativeRendererFrameUpdate;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
};
use crate::video::{NativeVideoBackend, NativeVideoBackendError};

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRendererJsonFrameInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout: Option<ViewLayoutInput>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub container: Option<StageContainerInput>,
    #[serde(default)]
    pub view: ViewProjection,
}

impl NativeRendererJsonFrameInput {
    pub fn resolved_layout(&self) -> ResolvedStageLayout {
        resolve_stage_layout(self.layout, self.container.unwrap_or_default())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NativeRendererJsonFrameError {
    Parse(NativeRendererJsonParseError),
    Validation(NativeRendererJsonValidationError),
    Render(NativeRenderBackendError),
    Audio(NativeAudioBackendError),
    Video(NativeVideoBackendError),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRendererJsonParseError {
    pub message: String,
    pub line: usize,
    pub column: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRendererJsonValidationError {
    pub path: String,
    pub asset_name: String,
    pub reason: String,
}

impl From<serde_json::Error> for NativeRendererJsonFrameError {
    fn from(error: serde_json::Error) -> Self {
        Self::Parse(NativeRendererJsonParseError {
            message: error.to_string(),
            line: error.line(),
            column: error.column(),
        })
    }
}

impl From<NativeRenderBackendError> for NativeRendererJsonFrameError {
    fn from(error: NativeRenderBackendError) -> Self {
        Self::Render(error)
    }
}

impl From<NativeRendererFrameError> for NativeRendererJsonFrameError {
    fn from(error: NativeRendererFrameError) -> Self {
        match error {
            NativeRendererFrameError::Render(error) => Self::Render(error),
            NativeRendererFrameError::Audio(error) => Self::Audio(error),
            NativeRendererFrameError::Video(error) => Self::Video(error),
        }
    }
}

impl Display for NativeRendererJsonFrameError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Parse(error) => write!(formatter, "{error}"),
            Self::Validation(error) => write!(formatter, "{error}"),
            Self::Render(error) => write!(formatter, "Render backend error: {error}"),
            Self::Audio(error) => write!(formatter, "Audio backend error: {error}"),
            Self::Video(error) => write!(formatter, "Video backend error: {error}"),
        }
    }
}

impl std::error::Error for NativeRendererJsonFrameError {}

impl Display for NativeRendererJsonParseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Failed to parse native renderer frame JSON at line {}, column {}: {}",
            self.line, self.column, self.message
        )
    }
}

impl std::error::Error for NativeRendererJsonParseError {}

impl Display for NativeRendererJsonValidationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Invalid native renderer frame JSON at {}: \"{}\" {}.",
            self.path, self.asset_name, self.reason
        )
    }
}

impl std::error::Error for NativeRendererJsonValidationError {}

impl<B, A, V> NativeRenderer<B, A, V>
where
    B: NativeRenderBackend,
{
    pub fn prepare_frame_json_str(
        &mut self,
        input: &str,
    ) -> Result<NativeRendererFrameUpdate, NativeRendererJsonFrameError> {
        let input = parse_native_renderer_json_frame_input(input)?;
        Ok(self.prepare_frame(input.resolved_layout(), &input.view))
    }

    pub fn prepare_and_render_json_str(
        &mut self,
        input: &str,
    ) -> Result<NativeRendererFrameResult, NativeRendererJsonFrameError> {
        let input = parse_native_renderer_json_frame_input(input)?;
        Ok(self.prepare_and_render(input.resolved_layout(), &input.view)?)
    }
}

impl<B, A, V> NativeRenderer<B, A, V>
where
    B: NativeRenderBackend,
    A: NativeAudioBackend,
    V: NativeVideoBackend,
{
    pub fn prepare_render_json_and_apply_audio_str(
        &mut self,
        input: &str,
    ) -> Result<NativeRendererFrameResult, NativeRendererJsonFrameError> {
        let input = parse_native_renderer_json_frame_input(input)?;
        Ok(self.prepare_render_and_apply_audio(input.resolved_layout(), &input.view)?)
    }
}

pub fn parse_native_renderer_json_frame_input(
    input: &str,
) -> Result<NativeRendererJsonFrameInput, NativeRendererJsonFrameError> {
    let raw_input: serde_json::Value = serde_json::from_str(input)?;
    validate_json_frame_required_fields(&raw_input)?;
    validate_json_frame_unsupported_fields(&raw_input)?;
    let input: NativeRendererJsonFrameInput = serde_json::from_str(input)?;
    validate_json_frame_input(input.layout.as_ref(), input.container.as_ref(), &input.view)?;
    Ok(input)
}
