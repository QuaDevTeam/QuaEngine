use crate::projection::common::PackageProvenance;

#[derive(Clone, Debug, PartialEq)]
pub struct CharacterProjection {
    pub id: String,
    pub name: String,
    pub visible: bool,
    pub sprite: Option<String>,
    pub expression: Option<String>,
    pub position: CharacterPosition,
    pub opacity: f32,
    pub layer: i32,
    pub provenance: PackageProvenance,
}

impl CharacterProjection {
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            visible: true,
            sprite: None,
            expression: None,
            position: CharacterPosition::default(),
            opacity: 1.0,
            layer: 0,
            provenance: PackageProvenance::default(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct CharacterPosition {
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub x_percent: Option<f64>,
    pub y_percent: Option<f64>,
    pub scale: Option<f64>,
    pub rotation: Option<f64>,
    pub anchor: Option<String>,
    pub width: Option<f64>,
    pub height: Option<f64>,
}
