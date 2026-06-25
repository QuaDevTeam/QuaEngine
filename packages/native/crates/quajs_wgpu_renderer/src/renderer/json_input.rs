use serde::{Deserialize, Serialize};

use crate::audio::{NativeAudioBackend, NativeAudioBackendError};
use crate::projection::view::ViewProjection;
use crate::renderer::backend::{NativeRenderBackend, NativeRenderBackendError};
use crate::renderer::facade::{
    NativeRenderer, NativeRendererFrameError, NativeRendererFrameResult,
};
use crate::renderer::resource_update::NativeRendererFrameUpdate;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
};

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
    Render(NativeRenderBackendError),
    Audio(NativeAudioBackendError),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRendererJsonParseError {
    pub message: String,
    pub line: usize,
    pub column: usize,
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
        }
    }
}

impl<B, A> NativeRenderer<B, A>
where
    B: NativeRenderBackend,
{
    pub fn prepare_frame_json_str(
        &mut self,
        input: &str,
    ) -> Result<NativeRendererFrameUpdate, NativeRendererJsonFrameError> {
        let input = parse_json_frame_input(input)?;
        Ok(self.prepare_frame(input.resolved_layout(), &input.view))
    }

    pub fn prepare_and_render_json_str(
        &mut self,
        input: &str,
    ) -> Result<NativeRendererFrameResult, NativeRendererJsonFrameError> {
        let input = parse_json_frame_input(input)?;
        Ok(self.prepare_and_render(input.resolved_layout(), &input.view)?)
    }
}

impl<B, A> NativeRenderer<B, A>
where
    B: NativeRenderBackend,
    A: NativeAudioBackend,
{
    pub fn prepare_render_json_and_apply_audio_str(
        &mut self,
        input: &str,
    ) -> Result<NativeRendererFrameResult, NativeRendererJsonFrameError> {
        let input = parse_json_frame_input(input)?;
        Ok(self.prepare_render_and_apply_audio(input.resolved_layout(), &input.view)?)
    }
}

fn parse_json_frame_input(
    input: &str,
) -> Result<NativeRendererJsonFrameInput, NativeRendererJsonFrameError> {
    Ok(serde_json::from_str(input)?)
}
