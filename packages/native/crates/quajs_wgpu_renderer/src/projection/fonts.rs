use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use super::common::{FontWeightProjection, PackageProvenance};

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontsProjection {
    #[serde(default)]
    pub revision: u64,
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    pub required_runtime_packages: BTreeSet<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub faces: Vec<FontFaceProjection>,
}

impl FontsProjection {
    pub fn new(faces: Vec<FontFaceProjection>) -> Self {
        Self {
            faces,
            ..Default::default()
        }
    }

    pub(crate) fn safe_required_runtime_packages(&self) -> impl Iterator<Item = &str> {
        self.required_runtime_packages
            .iter()
            .map(String::as_str)
            .filter(|package_id| super::common::is_safe_native_package_id(package_id))
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontFaceProjection {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub family: String,
    pub asset_name: String,
    #[serde(default = "default_font_asset_type")]
    pub asset_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bundle_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weight: Option<FontWeightProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stretch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unicode_range: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feature_settings: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variation_settings: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ascent_override: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub descent_override: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_gap_override: Option<String>,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
}

impl FontFaceProjection {
    pub fn new(family: impl Into<String>, asset_name: impl Into<String>) -> Self {
        Self {
            id: None,
            family: family.into(),
            asset_name: asset_name.into(),
            asset_type: default_font_asset_type(),
            bundle_name: None,
            locale: None,
            style: None,
            weight: None,
            stretch: None,
            display: None,
            unicode_range: None,
            feature_settings: None,
            variation_settings: None,
            ascent_override: None,
            descent_override: None,
            line_gap_override: None,
            provenance: PackageProvenance::default(),
        }
    }

    pub fn with_id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    pub fn with_provenance(mut self, provenance: PackageProvenance) -> Self {
        self.provenance = provenance;
        self
    }

    pub fn identity(&self) -> String {
        self.id.clone().unwrap_or_else(|| {
            [
                normalize_font_identity_segment(&self.family),
                normalize_font_identity_segment(self.style.as_deref().unwrap_or("normal")),
                normalize_font_identity_segment(&font_weight_identity(&self.weight)),
                normalize_font_identity_segment(self.stretch.as_deref().unwrap_or("normal")),
                normalize_font_identity_segment(self.unicode_range.as_deref().unwrap_or("all")),
            ]
            .join(":")
        })
    }
}

fn font_weight_identity(weight: &Option<FontWeightProjection>) -> String {
    match weight {
        Some(FontWeightProjection::Number(weight)) => weight.to_string(),
        Some(FontWeightProjection::Keyword(keyword)) => keyword.clone(),
        None => "normal".to_string(),
    }
}

fn normalize_font_identity_segment(value: &str) -> String {
    let mut normalized = String::new();
    let mut previous_dash = false;
    for character in value.trim().to_ascii_lowercase().chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
            normalized.push(character);
            previous_dash = false;
        } else if !previous_dash {
            normalized.push('-');
            previous_dash = true;
        }
    }
    let normalized = normalized.trim_matches('-');
    if normalized.is_empty() {
        "default".to_string()
    } else {
        normalized.to_string()
    }
}

fn default_font_asset_type() -> String {
    "fonts".to_string()
}
