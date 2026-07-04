use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageProvenance {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_package_id: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    pub required_runtime_packages: BTreeSet<String>,
}

impl PackageProvenance {
    pub fn is_empty(&self) -> bool {
        self.content_package_id.is_none() && self.required_runtime_packages.is_empty()
    }

    pub fn package_ids(&self) -> BTreeSet<String> {
        let mut package_ids = self.required_runtime_packages.clone();
        if let Some(package_id) = &self.content_package_id {
            package_ids.insert(package_id.clone());
        }
        package_ids
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct FontFamilyProjection {
    pub families: Vec<String>,
}

impl FontFamilyProjection {
    pub fn new<I, S>(families: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self {
            families: families.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum FontWeightProjection {
    Number(u16),
    Keyword(String),
}

impl FontWeightProjection {
    pub fn number(weight: u16) -> Self {
        Self::Number(weight)
    }

    pub fn keyword(keyword: impl Into<String>) -> Self {
        Self::Keyword(keyword.into())
    }
}

pub(crate) fn is_non_empty_asset_name(asset_name: &str) -> bool {
    !asset_name.trim().is_empty()
}
