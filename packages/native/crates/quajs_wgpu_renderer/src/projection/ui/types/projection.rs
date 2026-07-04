use serde::{Deserialize, Serialize};

use crate::projection::common::PackageProvenance;
use crate::projection::defaults::default_true;

use super::UiOverlayProjection;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiProjection {
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub overlays: Vec<UiOverlayProjection>,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
}

impl Default for UiProjection {
    fn default() -> Self {
        Self {
            visible: true,
            overlays: Vec::new(),
            provenance: PackageProvenance::default(),
        }
    }
}

impl UiProjection {
    pub fn new(overlays: Vec<UiOverlayProjection>) -> Self {
        Self {
            overlays,
            ..Default::default()
        }
    }
}
