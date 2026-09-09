use crate::projection::common::PackageProvenance;

use serde::{Deserialize, Serialize};

use crate::projection::defaults::default_true;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChoiceSetProjection {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chrome: Option<ChoiceChromeProjection>,
    #[serde(flatten)]
    pub motion: crate::projection::motion::MotionProjection,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub choices: Vec<ChoiceProjection>,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
}

impl ChoiceSetProjection {
    pub fn new(choices: Vec<ChoiceProjection>) -> Self {
        Self {
            chrome: None,
            motion: Default::default(),
            visible: true,
            choices,
            provenance: PackageProvenance::default(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChoiceProjection {
    #[serde(flatten)]
    pub motion: crate::projection::motion::MotionProjection,
    pub id: String,
    pub text: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
}

impl ChoiceProjection {
    pub fn new(id: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            motion: Default::default(),
            id: id.into(),
            text: text.into(),
            enabled: true,
            provenance: PackageProvenance::default(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChoiceChromeProjection {
    pub width: f64,
    pub font_size: f64,
    pub line_height: f64,
    pub padding_x: f64,
    pub padding_y: f64,
    pub gap: f64,
    pub fill_color: String,
    pub text_color: String,
    pub border_color: String,
}
