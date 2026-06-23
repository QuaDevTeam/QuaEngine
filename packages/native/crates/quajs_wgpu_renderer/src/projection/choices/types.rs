use crate::projection::common::PackageProvenance;

#[derive(Clone, Debug, PartialEq)]
pub struct ChoiceSetProjection {
    pub visible: bool,
    pub choices: Vec<ChoiceProjection>,
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

#[derive(Clone, Debug, PartialEq)]
pub struct ChoiceProjection {
    pub id: String,
    pub text: String,
    pub enabled: bool,
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
