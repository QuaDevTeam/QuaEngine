use crate::projection::{
    background::BackgroundProjection, character::CharacterProjection, choices::ChoiceSetProjection,
    dialogue::DialogueProjection,
};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ViewProjection {
    pub background: Option<BackgroundProjection>,
    pub characters: Vec<CharacterProjection>,
    pub dialogue: Option<DialogueProjection>,
    pub choices: Option<ChoiceSetProjection>,
}
