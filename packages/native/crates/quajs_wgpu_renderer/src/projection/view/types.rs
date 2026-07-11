use crate::projection::{
    audio::AudioProjection, background::BackgroundProjection, character::CharacterProjection,
    choices::ChoiceSetProjection, dialogue::DialogueProjection, effects::EffectProjection,
    plugins::PluginProjection, scene_transition::SceneTransitionProjection, ui::UiProjection,
};

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewProjection {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scene_transition: Option<SceneTransitionProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<BackgroundProjection>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub characters: Vec<CharacterProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dialogue: Option<DialogueProjection>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub effects: Vec<EffectProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub choices: Option<ChoiceSetProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui: Option<UiProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio: Option<AudioProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugins: Option<PluginProjection>,
}
