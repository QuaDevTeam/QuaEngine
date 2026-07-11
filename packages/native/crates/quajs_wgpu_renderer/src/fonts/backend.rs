use std::collections::{BTreeMap, BTreeSet};
use std::fmt::{Display, Formatter};
use std::sync::Arc;

use super::commands::{FontBackendCommandPlan, FontBackendFaceStateMap};
use crate::frame::PreparedNativeFrame;
use crate::resources::ResourceId;

#[derive(Clone, Debug, PartialEq)]
pub struct FontBackendAtlasGlyph {
    pub uv_top_left: [f32; 2],
    pub uv_bottom_right: [f32; 2],
    pub advance: f32,
    pub bearing_x: f32,
    pub bearing_y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FontBackendShapedDirection {
    LeftToRight,
    RightToLeft,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FontBackendShapedGlyph {
    pub glyph_id: u32,
    pub cluster: u32,
    pub x_advance: f32,
    pub y_advance: f32,
    pub x_offset: f32,
    pub y_offset: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FontBackendShapedRun {
    pub direction: FontBackendShapedDirection,
    pub glyphs: Vec<FontBackendShapedGlyph>,
}

impl FontBackendShapedRun {
    pub fn advance(&self) -> f32 {
        self.glyphs.iter().map(|glyph| glyph.x_advance).sum()
    }

    pub fn cluster_count(&self) -> usize {
        self.glyphs
            .iter()
            .map(|glyph| glyph.cluster)
            .collect::<BTreeSet<_>>()
            .len()
    }
}

#[derive(Clone, Debug)]
pub struct FontBackendShapingFace {
    bytes: Arc<[u8]>,
    face_index: u32,
}

impl FontBackendShapingFace {
    pub fn new(bytes: impl Into<Arc<[u8]>>, face_index: u32) -> Option<Self> {
        let face = Self {
            bytes: bytes.into(),
            face_index,
        };
        rustybuzz::Face::from_slice(&face.bytes, face.face_index)?;
        Some(face)
    }

    pub fn shape(&self, text: &str, raster_size: f32) -> Option<FontBackendShapedRun> {
        if text.is_empty() || !raster_size.is_finite() || raster_size <= 0.0 {
            return None;
        }
        let face = rustybuzz::Face::from_slice(&self.bytes, self.face_index)?;
        let font_height = f32::from(face.ascender()) - f32::from(face.descender());
        if font_height <= 0.0 {
            return None;
        }
        let mut buffer = rustybuzz::UnicodeBuffer::new();
        buffer.push_str(text);
        buffer.guess_segment_properties();
        let direction = if buffer.direction() == rustybuzz::Direction::RightToLeft {
            FontBackendShapedDirection::RightToLeft
        } else {
            FontBackendShapedDirection::LeftToRight
        };
        let shaped = rustybuzz::shape(&face, &[], buffer);
        // Match ab_glyph's PxScale contract, which scales ascent-to-descent height.
        let scale = raster_size / font_height;
        let glyphs = shaped
            .glyph_infos()
            .iter()
            .zip(shaped.glyph_positions())
            .map(|(info, position)| FontBackendShapedGlyph {
                glyph_id: info.glyph_id,
                cluster: info.cluster,
                x_advance: position.x_advance as f32 * scale,
                y_advance: position.y_advance as f32 * scale,
                x_offset: position.x_offset as f32 * scale,
                y_offset: position.y_offset as f32 * scale,
            })
            .collect::<Vec<_>>();
        (!glyphs.is_empty()).then_some(FontBackendShapedRun { direction, glyphs })
    }
}

impl PartialEq for FontBackendShapingFace {
    fn eq(&self, other: &Self) -> bool {
        self.face_index == other.face_index && Arc::ptr_eq(&self.bytes, &other.bytes)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct FontBackendAtlasLayout {
    pub resource_id: ResourceId,
    pub family: String,
    pub raster_size: f32,
    pub ascent: f32,
    pub descent: f32,
    pub line_height: f32,
    pub is_default: bool,
    pub glyphs: BTreeMap<char, FontBackendAtlasGlyph>,
    pub glyphs_by_id: BTreeMap<u32, FontBackendAtlasGlyph>,
    pub shaping_face: Option<FontBackendShapingFace>,
}

pub type FontBackendAtlasLayoutMap = BTreeMap<ResourceId, FontBackendAtlasLayout>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FontBackendAssetLoad {
    pub face_id: String,
    pub resource_id: ResourceId,
    pub asset_type: String,
    pub asset_name: String,
    pub package_id: Option<String>,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeFontBackendErrorKind {
    BackendRejected,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeFontBackendError {
    pub kind: NativeFontBackendErrorKind,
    pub message: String,
}

impl NativeFontBackendError {
    pub fn backend_rejected(message: impl Into<String>) -> Self {
        Self {
            kind: NativeFontBackendErrorKind::BackendRejected,
            message: message.into(),
        }
    }
}

impl Display for NativeFontBackendError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for NativeFontBackendError {}

pub type NativeFontBackendResult = Result<(), NativeFontBackendError>;

#[derive(Clone, Debug, PartialEq)]
pub struct FontBackendAtlasTexture {
    pub resource_id: ResourceId,
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
    pub layout: Option<FontBackendAtlasLayout>,
}

impl FontBackendAtlasTexture {
    pub fn new(
        resource_id: impl Into<ResourceId>,
        width: u32,
        height: u32,
        rgba: impl Into<Vec<u8>>,
    ) -> Self {
        Self {
            resource_id: resource_id.into(),
            width,
            height,
            rgba: rgba.into(),
            owner_package_id: None,
            required_package_ids: BTreeSet::new(),
            layout: None,
        }
    }

    pub fn with_layout(mut self, layout: FontBackendAtlasLayout) -> Self {
        self.layout = Some(layout);
        self
    }

    pub fn owned_by(mut self, package_id: impl Into<String>) -> Self {
        self.owner_package_id = Some(package_id.into());
        self
    }

    pub fn require_package(mut self, package_id: impl Into<String>) -> Self {
        self.required_package_ids.insert(package_id.into());
        self
    }

    pub fn require_packages<I, S>(mut self, package_ids: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        for package_id in package_ids {
            self.required_package_ids.insert(package_id.into());
        }
        self
    }
}

pub trait NativeFontBackend {
    fn wants_font_asset_loads(&self) -> bool {
        false
    }

    fn apply_font_asset_loads(
        &mut self,
        _loads: &[FontBackendAssetLoad],
    ) -> NativeFontBackendResult {
        Ok(())
    }

    fn apply_font_commands(&mut self, plan: &FontBackendCommandPlan) -> NativeFontBackendResult;

    fn prepare_frame_text(&mut self, _frame: &PreparedNativeFrame) -> NativeFontBackendResult {
        Ok(())
    }

    fn drain_font_atlas_textures(&mut self) -> Vec<FontBackendAtlasTexture> {
        Vec::new()
    }

    fn drain_font_atlas_texture_releases(&mut self) -> Vec<ResourceId> {
        Vec::new()
    }
}

impl NativeFontBackend for () {
    fn apply_font_commands(&mut self, _plan: &FontBackendCommandPlan) -> NativeFontBackendResult {
        Ok(())
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NullNativeFontBackend {
    loaded_assets: Vec<FontBackendAssetLoad>,
    applied_plans: Vec<FontBackendCommandPlan>,
    active_faces: FontBackendFaceStateMap,
}

impl NullNativeFontBackend {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn applied_plans(&self) -> &[FontBackendCommandPlan] {
        &self.applied_plans
    }

    pub fn loaded_assets(&self) -> &[FontBackendAssetLoad] {
        &self.loaded_assets
    }

    pub fn active_faces(&self) -> &FontBackendFaceStateMap {
        &self.active_faces
    }

    pub fn diagnostics(&self) -> NullNativeFontBackendDiagnostics {
        NullNativeFontBackendDiagnostics {
            loaded_asset_count: self.loaded_assets.len(),
            applied_plan_count: self.applied_plans.len(),
            applied_command_count: self
                .applied_plans
                .iter()
                .map(|plan| plan.commands.len())
                .sum(),
            active_face_count: self.active_faces.len(),
            last_plan: self.applied_plans.last().cloned(),
        }
    }
}

impl NativeFontBackend for NullNativeFontBackend {
    fn apply_font_asset_loads(
        &mut self,
        loads: &[FontBackendAssetLoad],
    ) -> NativeFontBackendResult {
        self.loaded_assets.extend(loads.iter().cloned());
        Ok(())
    }

    fn apply_font_commands(&mut self, plan: &FontBackendCommandPlan) -> NativeFontBackendResult {
        self.active_faces = plan.next_faces.clone();
        self.applied_plans.push(plan.clone());
        Ok(())
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NullNativeFontBackendDiagnostics {
    pub loaded_asset_count: usize,
    pub applied_plan_count: usize,
    pub applied_command_count: usize,
    pub active_face_count: usize,
    pub last_plan: Option<FontBackendCommandPlan>,
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn shapes_opentype_ligatures_and_detects_rtl_direction() {
        let bytes = std::fs::read(demo_font_path()).expect("demo font bytes");
        let face = FontBackendShapingFace::new(bytes, 0).expect("valid shaping face");

        let ligature = face.shape("ffi", 64.0).expect("ligature run");
        assert!(ligature.glyphs.len() < "ffi".chars().count());
        assert_eq!(ligature.cluster_count(), 1);
        assert!(ligature.advance() > 0.0);

        let rtl = face.shape("مرحبا", 64.0).expect("rtl run");
        assert_eq!(rtl.direction, FontBackendShapedDirection::RightToLeft);
    }

    fn demo_font_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../demo/assets/fonts/NotoSans-Regular.ttf")
    }
}
