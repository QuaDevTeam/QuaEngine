use std::collections::{BTreeMap, BTreeSet};

use ab_glyph::{point, Font, FontArc, PxScale};
use quajs_wgpu_renderer::fonts::{
    native_text_atlas_cell_x, native_text_atlas_cell_y, native_text_atlas_char_at,
    native_text_atlas_char_index, native_text_atlas_dimensions,
    native_text_atlas_extended_char_count, FontBackendAssetLoad, FontBackendAtlasTexture,
    FontBackendCommandKind, FontBackendCommandPlan, FontBackendFaceState, NativeFontBackend,
    NativeFontBackendResult, NATIVE_TEXT_ATLAS_CHARS, NATIVE_TEXT_ATLAS_GLYPH_HEIGHT,
    NATIVE_TEXT_ATLAS_GLYPH_WIDTH, NATIVE_TEXT_ATLAS_PADDING, NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX,
};
use quajs_wgpu_renderer::resources::ResourceId;

const RASTER_SCALE: f32 = 32.0;

#[derive(Debug, Default)]
pub(crate) struct SimpleNativeFontAtlasBackend {
    loaded_assets: BTreeMap<String, FontBackendAssetLoad>,
    active_faces: BTreeMap<String, FontBackendFaceState>,
    active_family_atlas_resources: BTreeMap<String, ResourceId>,
    pending_atlases: Vec<FontBackendAtlasTexture>,
    pending_releases: Vec<ResourceId>,
}

impl SimpleNativeFontAtlasBackend {
    pub(crate) fn new() -> Self {
        Self::default()
    }
}

impl NativeFontBackend for SimpleNativeFontAtlasBackend {
    fn wants_font_asset_loads(&self) -> bool {
        true
    }

    fn apply_font_asset_loads(
        &mut self,
        loads: &[FontBackendAssetLoad],
    ) -> NativeFontBackendResult {
        for load in loads {
            self.loaded_assets
                .insert(load.face_id.clone(), load.clone());
        }
        Ok(())
    }

    fn apply_font_commands(&mut self, plan: &FontBackendCommandPlan) -> NativeFontBackendResult {
        for command in &plan.commands {
            let Some(face) = &command.face else {
                continue;
            };
            match command.kind {
                FontBackendCommandKind::LoadFace => self.load_face(face),
                FontBackendCommandKind::ActivateFace => {}
                FontBackendCommandKind::ReleaseFace => self.release_face(face),
            }
        }
        Ok(())
    }

    fn drain_font_atlas_textures(&mut self) -> Vec<FontBackendAtlasTexture> {
        std::mem::take(&mut self.pending_atlases)
    }

    fn drain_font_atlas_texture_releases(&mut self) -> Vec<ResourceId> {
        std::mem::take(&mut self.pending_releases)
    }
}

impl SimpleNativeFontAtlasBackend {
    fn load_face(&mut self, face: &FontBackendFaceState) {
        let Some(load) = self.loaded_assets.get(&face.id) else {
            return;
        };
        if FontArc::try_from_vec(load.bytes.clone()).is_err() {
            return;
        }
        self.active_faces.insert(face.id.clone(), face.clone());
        self.rebuild_family_atlas(&face.family);
    }

    fn release_face(&mut self, face: &FontBackendFaceState) {
        self.loaded_assets.remove(&face.id);
        let family = self
            .active_faces
            .remove(&face.id)
            .map(|active| active.family)
            .unwrap_or_else(|| face.family.clone());
        if self
            .active_faces
            .values()
            .any(|active| active.family == family)
        {
            self.rebuild_family_atlas(&family);
        } else {
            self.release_family_atlas(&family);
        }
    }

    fn rebuild_family_atlas(&mut self, family: &str) {
        let faces = self.loaded_family_faces(family);
        if faces.is_empty() {
            self.release_family_atlas(family);
            return;
        }
        let mut atlas = rasterize_font_family(family, &faces);
        let metadata = package_metadata_for_loaded_faces(&faces);
        atlas.owner_package_id = metadata.owner_package_id;
        atlas.required_package_ids = metadata.required_package_ids;
        self.active_family_atlas_resources
            .insert(family.to_string(), atlas.resource_id.clone());
        self.pending_atlases.push(atlas);
    }

    fn loaded_family_faces(&self, family: &str) -> Vec<LoadedFontFace> {
        let mut faces = self
            .active_faces
            .values()
            .filter(|face| face.family == family)
            .filter_map(|face| {
                let load = self.loaded_assets.get(&face.id)?;
                let font = FontArc::try_from_vec(load.bytes.clone()).ok()?;
                Some(LoadedFontFace {
                    face: face.clone(),
                    font,
                    owner_package_id: load
                        .package_id
                        .clone()
                        .or_else(|| single_package_candidate(face)),
                })
            })
            .collect::<Vec<_>>();
        faces.sort_by(|left, right| {
            left.face
                .order
                .cmp(&right.face.order)
                .then_with(|| left.face.id.cmp(&right.face.id))
        });
        faces
    }

    fn release_family_atlas(&mut self, family: &str) {
        let Some(resource_id) = self.active_family_atlas_resources.remove(family) else {
            return;
        };
        self.pending_releases.push(resource_id);
    }
}

#[derive(Clone)]
struct LoadedFontFace {
    face: FontBackendFaceState,
    font: FontArc,
    owner_package_id: Option<String>,
}

#[derive(Default)]
struct FontAtlasPackageMetadata {
    owner_package_id: Option<String>,
    required_package_ids: BTreeSet<String>,
}

fn rasterize_font_family(family: &str, faces: &[LoadedFontFace]) -> FontBackendAtlasTexture {
    let (width, height) = atlas_dimensions();
    let mut rgba = vec![0; width as usize * height as usize * 4];
    for index in 0..NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX {
        let Some(character) = native_text_atlas_char_at(index) else {
            continue;
        };
        rasterize_glyph(faces, character, index, &mut rgba, width as usize);
    }
    write_solid_mask_cell(&mut rgba, width as usize);
    FontBackendAtlasTexture::new(font_family_resource_id(family), width, height, rgba)
}

fn rasterize_glyph(
    faces: &[LoadedFontFace],
    character: char,
    index: usize,
    rgba: &mut [u8],
    atlas_width: usize,
) {
    for face in faces {
        if rasterize_face_glyph(&face.font, character, index, rgba, atlas_width) {
            return;
        }
    }
    write_fallback_glyph_cell(index, rgba, atlas_width);
}

fn rasterize_face_glyph(
    font: &FontArc,
    character: char,
    index: usize,
    rgba: &mut [u8],
    atlas_width: usize,
) -> bool {
    let glyph_id = font.glyph_id(character);
    if glyph_id.0 == 0 {
        return false;
    }
    let glyph = font
        .glyph_id(character)
        .with_scale_and_position(PxScale::from(RASTER_SCALE), point(0.0, 0.0));
    let Some(outlined) = font.outline_glyph(glyph) else {
        return false;
    };
    let bounds = outlined.px_bounds();
    let bounds_width = bounds.width().ceil().max(1.0);
    let bounds_height = bounds.height().ceil().max(1.0);
    let cell_x = native_text_atlas_cell_x(index) + NATIVE_TEXT_ATLAS_PADDING;
    let cell_y = native_text_atlas_cell_y(index) + NATIVE_TEXT_ATLAS_PADDING;

    let mut drew = false;
    outlined.draw(|x, y, coverage| {
        if coverage <= 0.0 {
            return;
        }
        drew = true;
        let target_x = ((x as f32 / bounds_width) * NATIVE_TEXT_ATLAS_GLYPH_WIDTH as f32)
            .floor()
            .clamp(0.0, (NATIVE_TEXT_ATLAS_GLYPH_WIDTH - 1) as f32) as usize;
        let target_y = ((y as f32 / bounds_height) * NATIVE_TEXT_ATLAS_GLYPH_HEIGHT as f32)
            .floor()
            .clamp(0.0, (NATIVE_TEXT_ATLAS_GLYPH_HEIGHT - 1) as f32)
            as usize;
        let alpha = (coverage.clamp(0.0, 1.0) * 255.0).round() as u8;
        blend_atlas_pixel(
            rgba,
            atlas_width,
            cell_x + target_x,
            cell_y + target_y,
            alpha,
        );
    });
    drew
}

fn package_metadata_for_loaded_faces(faces: &[LoadedFontFace]) -> FontAtlasPackageMetadata {
    let mut owners = BTreeSet::new();
    let mut required_package_ids = BTreeSet::new();
    for face in faces {
        required_package_ids.extend(face.face.package_candidates.clone());
        if let Some(owner) = &face.owner_package_id {
            owners.insert(owner.clone());
            required_package_ids.insert(owner.clone());
        }
    }
    let owner_package_id = if owners.len() == 1 {
        owners.iter().next().cloned()
    } else {
        None
    };
    if let Some(owner) = &owner_package_id {
        required_package_ids.remove(owner);
    }
    FontAtlasPackageMetadata {
        owner_package_id,
        required_package_ids,
    }
}

fn write_fallback_glyph_cell(index: usize, rgba: &mut [u8], atlas_width: usize) {
    let cell_x = native_text_atlas_cell_x(index) + NATIVE_TEXT_ATLAS_PADDING;
    let cell_y = native_text_atlas_cell_y(index) + NATIVE_TEXT_ATLAS_PADDING;
    for y in 0..NATIVE_TEXT_ATLAS_GLYPH_HEIGHT {
        for x in 0..NATIVE_TEXT_ATLAS_GLYPH_WIDTH {
            write_atlas_pixel(rgba, atlas_width, cell_x + x, cell_y + y, 0xff);
        }
    }
}

fn write_solid_mask_cell(rgba: &mut [u8], atlas_width: usize) {
    let cell_x =
        native_text_atlas_cell_x(NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX) + NATIVE_TEXT_ATLAS_PADDING;
    let cell_y =
        native_text_atlas_cell_y(NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX) + NATIVE_TEXT_ATLAS_PADDING;
    for y in 0..NATIVE_TEXT_ATLAS_GLYPH_HEIGHT {
        for x in 0..NATIVE_TEXT_ATLAS_GLYPH_WIDTH {
            write_atlas_pixel(rgba, atlas_width, cell_x + x, cell_y + y, 0xff);
        }
    }
}

fn blend_atlas_pixel(rgba: &mut [u8], atlas_width: usize, x: usize, y: usize, alpha: u8) {
    let offset = (y * atlas_width + x) * 4;
    let next_alpha = rgba[offset + 3].max(alpha);
    rgba[offset..offset + 4].copy_from_slice(&[0xff, 0xff, 0xff, next_alpha]);
}

fn write_atlas_pixel(rgba: &mut [u8], atlas_width: usize, x: usize, y: usize, alpha: u8) {
    let offset = (y * atlas_width + x) * 4;
    rgba[offset..offset + 4].copy_from_slice(&[0xff, 0xff, 0xff, alpha]);
}

fn atlas_dimensions() -> (u32, u32) {
    native_text_atlas_dimensions()
}

fn font_family_resource_id(family: &str) -> ResourceId {
    ResourceId::new(format!("fonts:{family}"))
}

fn single_package_candidate(face: &FontBackendFaceState) -> Option<String> {
    if face.package_candidates.len() == 1 {
        face.package_candidates.iter().next().cloned()
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use quajs_wgpu_renderer::fonts::FontBackendCommand;

    #[test]
    fn product_font_backend_uses_renderer_text_atlas_contract() {
        assert_eq!(atlas_dimensions(), native_text_atlas_dimensions());
        assert_eq!(
            NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX,
            NATIVE_TEXT_ATLAS_CHARS.len() + native_text_atlas_extended_char_count()
        );
        assert!(NATIVE_TEXT_ATLAS_CHARS.contains(&'A'));
        assert!(NATIVE_TEXT_ATLAS_CHARS.contains(&'a'));
        assert!(native_text_atlas_char_index('界').is_some());
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn product_font_backend_merges_same_family_faces_for_fallback_slots() {
        let Some(latin_bytes) = read_system_font("/System/Library/Fonts/Supplemental/Arial.ttf")
        else {
            return;
        };
        let Some(cjk_bytes) =
            read_system_font("/System/Library/Fonts/Supplemental/Arial Unicode.ttf")
        else {
            return;
        };
        if font_supports_character(&latin_bytes, '界') || !font_supports_character(&cjk_bytes, '界')
        {
            return;
        }

        let latin = face("latin", 0, "fonts/latin.ttf");
        let cjk = face("cjk", 1, "fonts/cjk.ttf");
        let mut backend = SimpleNativeFontAtlasBackend::new();
        backend
            .apply_font_asset_loads(&[
                load(&latin, latin_bytes, Some("base.fonts")),
                load(&cjk, cjk_bytes, Some("runtime.cjk")),
            ])
            .unwrap();
        backend
            .apply_font_commands(&FontBackendCommandPlan {
                commands: vec![
                    command(FontBackendCommandKind::LoadFace, &latin),
                    command(FontBackendCommandKind::LoadFace, &cjk),
                ],
                next_faces: Default::default(),
                skipped_asset_resource_ids: Vec::new(),
            })
            .unwrap();

        let atlases = backend.drain_font_atlas_textures();
        assert_eq!(atlases.len(), 2);
        assert!(glyph_cell_is_solid_mask(&atlases[0], '界'));
        assert!(!glyph_cell_is_solid_mask(&atlases[1], '界'));
        assert_eq!(atlases[1].owner_package_id, None);
        assert!(atlases[1].required_package_ids.contains("base.fonts"));
        assert!(atlases[1].required_package_ids.contains("runtime.cjk"));
    }

    #[cfg(target_os = "macos")]
    fn read_system_font(path: &str) -> Option<Vec<u8>> {
        std::fs::read(path).ok()
    }

    #[cfg(target_os = "macos")]
    fn font_supports_character(bytes: &[u8], character: char) -> bool {
        let Ok(font) = FontArc::try_from_vec(bytes.to_vec()) else {
            return false;
        };
        let glyph_id = font.glyph_id(character);
        glyph_id.0 != 0
            && font
                .outline_glyph(glyph_id.with_scale(PxScale::from(RASTER_SCALE)))
                .is_some()
    }

    #[cfg(target_os = "macos")]
    fn glyph_cell_is_solid_mask(atlas: &FontBackendAtlasTexture, character: char) -> bool {
        let index = native_text_atlas_char_index(character).expect("character must be in atlas");
        let atlas_width = atlas.width as usize;
        let cell_x = native_text_atlas_cell_x(index) + NATIVE_TEXT_ATLAS_PADDING;
        let cell_y = native_text_atlas_cell_y(index) + NATIVE_TEXT_ATLAS_PADDING;
        for y in 0..NATIVE_TEXT_ATLAS_GLYPH_HEIGHT {
            for x in 0..NATIVE_TEXT_ATLAS_GLYPH_WIDTH {
                let alpha = atlas.rgba[((cell_y + y) * atlas_width + cell_x + x) * 4 + 3];
                if alpha != 0xff {
                    return false;
                }
            }
        }
        true
    }

    #[cfg(target_os = "macos")]
    fn face(id: &str, order: usize, asset_name: &str) -> FontBackendFaceState {
        FontBackendFaceState {
            id: id.to_string(),
            order,
            family: "Qua Fallback".to_string(),
            asset_type: "fonts".to_string(),
            asset_name: asset_name.to_string(),
            style: None,
            weight: None,
            stretch: None,
            display: None,
            unicode_range: None,
            package_candidates: Default::default(),
            face_resource_id: ResourceId::from(format!("font:face:fonts:{asset_name}")),
        }
    }

    #[cfg(target_os = "macos")]
    fn load(
        face: &FontBackendFaceState,
        bytes: Vec<u8>,
        package_id: Option<&str>,
    ) -> FontBackendAssetLoad {
        FontBackendAssetLoad {
            face_id: face.id.clone(),
            resource_id: face.face_resource_id.clone(),
            asset_type: face.asset_type.clone(),
            asset_name: face.asset_name.clone(),
            package_id: package_id.map(ToString::to_string),
            bytes,
        }
    }

    #[cfg(target_os = "macos")]
    fn command(kind: FontBackendCommandKind, face: &FontBackendFaceState) -> FontBackendCommand {
        FontBackendCommand {
            face_id: face.id.clone(),
            kind,
            face: Some(face.clone()),
        }
    }
}
