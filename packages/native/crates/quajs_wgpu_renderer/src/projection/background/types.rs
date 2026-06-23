use std::collections::BTreeSet;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BackgroundMode {
    Image,
    Video,
    Layered,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BackgroundFit {
    Cover,
    Contain,
    Fill,
    None,
    ScaleDown,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PackageProvenance {
    pub content_package_id: Option<String>,
    pub required_runtime_packages: BTreeSet<String>,
}

impl PackageProvenance {
    pub fn package_ids(&self) -> BTreeSet<String> {
        let mut package_ids = self.required_runtime_packages.clone();
        if let Some(package_id) = &self.content_package_id {
            package_ids.insert(package_id.clone());
        }
        package_ids
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct BackgroundProjection {
    pub mode: BackgroundMode,
    pub asset_name: Option<String>,
    pub asset_type: Option<String>,
    pub fit: BackgroundFit,
    pub origin: Option<String>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub x: f64,
    pub y: f64,
    pub scale: f64,
    pub opacity: f32,
    pub layers: Vec<BackgroundLayerProjection>,
    pub video: Option<BackgroundVideoProjection>,
    pub provenance: PackageProvenance,
}

impl Default for BackgroundProjection {
    fn default() -> Self {
        Self {
            mode: BackgroundMode::Image,
            asset_name: None,
            asset_type: None,
            fit: BackgroundFit::Cover,
            origin: None,
            width: None,
            height: None,
            x: 0.0,
            y: 0.0,
            scale: 1.0,
            opacity: 1.0,
            layers: Vec::new(),
            video: None,
            provenance: PackageProvenance::default(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct BackgroundLayerProjection {
    pub id: String,
    pub asset_name: String,
    pub asset_type: Option<String>,
    pub visible: bool,
    pub fit: BackgroundFit,
    pub origin: Option<String>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub x: f64,
    pub y: f64,
    pub scale: f64,
    pub opacity: f32,
    pub z_index: i32,
    pub provenance: PackageProvenance,
}

impl BackgroundLayerProjection {
    pub fn new(id: impl Into<String>, asset_name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            asset_name: asset_name.into(),
            asset_type: None,
            visible: true,
            fit: BackgroundFit::Cover,
            origin: None,
            width: None,
            height: None,
            x: 0.0,
            y: 0.0,
            scale: 1.0,
            opacity: 1.0,
            z_index: 0,
            provenance: PackageProvenance::default(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct BackgroundVideoProjection {
    pub asset_name: String,
    pub poster: Option<String>,
    pub fit: BackgroundFit,
    pub origin: Option<String>,
    pub opacity: f32,
    pub provenance: PackageProvenance,
}

impl BackgroundVideoProjection {
    pub fn new(asset_name: impl Into<String>) -> Self {
        Self {
            asset_name: asset_name.into(),
            poster: None,
            fit: BackgroundFit::Cover,
            origin: None,
            opacity: 1.0,
            provenance: PackageProvenance::default(),
        }
    }
}
