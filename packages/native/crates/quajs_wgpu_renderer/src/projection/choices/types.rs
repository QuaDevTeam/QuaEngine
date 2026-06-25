use crate::projection::common::PackageProvenance;

use serde::{Deserialize, Serialize};

use crate::projection::defaults::default_true;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChoiceSetProjection {
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
            visible: true,
            choices,
            provenance: PackageProvenance::default(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChoiceProjection {
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
            id: id.into(),
            text: text.into(),
            enabled: true,
            provenance: PackageProvenance::default(),
        }
    }
}
