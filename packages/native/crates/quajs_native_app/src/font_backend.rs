use std::collections::{BTreeMap, BTreeSet};

use ab_glyph::{point, Font, FontArc, FontVec, GlyphId, PxScale, ScaleFont, VariableFont};
use quajs_wgpu_renderer::fonts::{
    FontBackendAssetLoad, FontBackendAtlasFaceLayout, FontBackendAtlasGlyph,
    FontBackendAtlasLayout, FontBackendAtlasTexture, FontBackendCommandKind,
    FontBackendCommandPlan, FontBackendFaceState, FontBackendShapingFace, NativeFontBackend,
    NativeFontBackendResult, NATIVE_BITMAP_FONT_FAMILY,
};
use quajs_wgpu_renderer::frame::PreparedNativeFrame;
use quajs_wgpu_renderer::render_graph::{DrawCommandParams, TextTransformDrawParam};
use quajs_wgpu_renderer::resources::ResourceId;

const RASTER_SCALE: f32 = 64.0;
const GLYPH_CELL_SIZE: usize = 80;
const GLYPH_CELL_PADDING: usize = 6;
const GLYPH_ATLAS_COLUMNS: usize = 16;
const MAX_DECODED_FONT_BYTES: usize = 64 * 1024 * 1024;

/// Pixel scale at which one em measures `RASTER_SCALE` px, i.e. CSS font-size
/// semantics. `PxScale::from(RASTER_SCALE)` would instead pin the
/// ascender-to-descender span, which for CJK faces is ~1.4 em and silently
/// renders every glyph ~30% smaller than the same font-size on the Web.
fn em_px_scale(font: &FontArc) -> PxScale {
    let units_per_em = font.units_per_em().unwrap_or_else(|| font.height_unscaled());
    if units_per_em > 0.0 {
        PxScale::from(RASTER_SCALE * font.height_unscaled() / units_per_em)
    } else {
        PxScale::from(RASTER_SCALE)
    }
}

#[derive(Debug, Default)]
pub(crate) struct SimpleNativeFontAtlasBackend {
    loaded_assets: BTreeMap<String, FontBackendAssetLoad>,
    active_faces: BTreeMap<String, FontBackendFaceState>,
    active_family_atlas_resources: BTreeMap<String, ResourceId>,
    pending_atlases: Vec<FontBackendAtlasTexture>,
    pending_releases: Vec<ResourceId>,
    requested_glyphs: BTreeMap<String, BTreeSet<char>>,
    requested_texts: BTreeMap<String, BTreeSet<String>>,
    prewarm_texts: BTreeSet<String>,
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
            let Some(bytes) = decode_font_asset_bytes(&load.bytes) else {
                continue;
            };
            let mut load = load.clone();
            load.bytes = bytes;
            self.loaded_assets.insert(load.face_id.clone(), load);
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

    fn prewarm_texts(&mut self, texts: &[String]) -> NativeFontBackendResult {
        let next = texts
            .iter()
            .filter(|text| !text.is_empty())
            .cloned()
            .collect::<BTreeSet<_>>();
        let changed = next != self.prewarm_texts;
        self.prewarm_texts = next.clone();
        if changed {
            let families = self
                .active_faces
                .values()
                .map(|face| face.family.clone())
                .collect::<BTreeSet<_>>();
            for family in families {
                if self.merge_requested_texts(&family, &next) {
                    self.rebuild_family_atlas(&family);
                }
            }
        }
        Ok(())
    }

    fn prepare_frame_text(&mut self, frame: &PreparedNativeFrame) -> NativeFontBackendResult {
        let mut requested_glyphs = BTreeMap::<String, BTreeSet<char>>::new();
        let mut requested_texts = BTreeMap::<String, BTreeSet<String>>::new();
        for command in frame.graph.commands() {
            let (text, families, transform) = match &command.params {
                DrawCommandParams::Text(params) => (
                    params.text.as_str(),
                    params.font_family.as_slice(),
                    params.text_transform,
                ),
                DrawCommandParams::UiButton(params) => (
                    params.label.as_str(),
                    params.font_family.as_slice(),
                    params.text_transform,
                ),
                _ => continue,
            };
            let Some(family) = self.resolve_family(families) else {
                continue;
            };
            let text = transform_text(text, transform);
            requested_glyphs
                .entry(family.clone())
                .or_default()
                .extend(text.chars().filter(|character| !character.is_control()));
            if !text.is_empty() {
                requested_texts.entry(family).or_default().insert(text);
            }
        }

        for family in requested_glyphs
            .keys()
            .chain(requested_texts.keys())
            .cloned()
            .collect::<BTreeSet<_>>()
        {
            let characters = requested_glyphs.remove(&family).unwrap_or_default();
            let texts = requested_texts.remove(&family).unwrap_or_default();
            let mut atlas_characters = self.requested_glyphs.remove(&family).unwrap_or_default();
            let glyphs_changed = characters
                .iter()
                .any(|character| !atlas_characters.contains(character));
            atlas_characters.extend(characters);
            // Atlas resources are keyed by the glyphs they contain. The
            // product HUD intentionally changes numeric text every frame;
            // rebuilding the whole high-resolution atlas for those strings
            // would serialize the render loop on Rustybuzz/rasterization and
            // prevent stable WGPU plan reuse. Keep the latest shaping strings
            // for the next real atlas rebuild, but only rebuild when a new
            // character must be uploaded.
            self.requested_texts
                .entry(family.clone())
                .or_default()
                .extend(texts);
            self.requested_glyphs
                .insert(family.clone(), atlas_characters);
            if glyphs_changed {
                self.rebuild_family_atlas(&family);
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

fn decode_font_asset_bytes(bytes: &[u8]) -> Option<Vec<u8>> {
    if bytes.len() > MAX_DECODED_FONT_BYTES {
        return None;
    }
    match bytes.get(..4) {
        Some(b"wOFF") => decode_webfont(bytes, wuff::decompress_woff1),
        Some(b"wOF2") => decode_webfont(bytes, wuff::decompress_woff2),
        _ => Some(bytes.to_vec()),
    }
}

fn decode_webfont(
    bytes: &[u8],
    decode: impl FnOnce(&[u8]) -> Result<Vec<u8>, wuff::WuffErr>,
) -> Option<Vec<u8>> {
    let declared_size = bytes
        .get(16..20)
        .and_then(|size| <[u8; 4]>::try_from(size).ok())
        .map(u32::from_be_bytes)? as usize;
    if declared_size == 0 || declared_size > MAX_DECODED_FONT_BYTES {
        return None;
    }
    let decoded = decode(bytes).ok()?;
    (decoded.len() == declared_size).then_some(decoded)
}

impl SimpleNativeFontAtlasBackend {
    fn load_face(&mut self, face: &FontBackendFaceState) {
        let Some(load) = self.loaded_assets.get(&face.id) else {
            return;
        };
        if font_arc_for_face(load, face).is_none() {
            return;
        }
        self.active_faces.insert(face.id.clone(), face.clone());
        let prewarm_texts = self.prewarm_texts.clone();
        self.merge_requested_texts(&face.family, &prewarm_texts);
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
            self.requested_glyphs.remove(&family);
            self.requested_texts.remove(&family);
            self.release_family_atlas(&family);
        }
    }

    fn rebuild_family_atlas(&mut self, family: &str) {
        let faces = self.loaded_family_faces(family);
        let Some(characters) = self.requested_glyphs.get(family) else {
            return;
        };
        let texts = self
            .requested_texts
            .get(family)
            .cloned()
            .unwrap_or_default();
        if faces.is_empty() || characters.is_empty() {
            self.release_family_atlas(family);
            return;
        }
        let mut atlas = rasterize_font_family(
            family,
            &faces,
            characters,
            &texts,
            self.default_family().as_deref() == Some(family),
        );
        let metadata = package_metadata_for_loaded_faces(&faces);
        atlas.owner_package_id = metadata.owner_package_id;
        atlas.required_package_ids = metadata.required_package_ids;
        self.active_family_atlas_resources
            .insert(family.to_string(), atlas.resource_id.clone());
        self.pending_atlases.push(atlas);
    }

    fn merge_requested_texts(&mut self, family: &str, texts: &BTreeSet<String>) -> bool {
        let characters = texts
            .iter()
            .flat_map(|text| text.chars())
            .filter(|character| !character.is_control())
            .collect::<BTreeSet<_>>();
        let glyphs = self.requested_glyphs.entry(family.to_string()).or_default();
        let changed = characters
            .iter()
            .any(|character| !glyphs.contains(character));
        glyphs.extend(characters);
        self.requested_texts
            .entry(family.to_string())
            .or_default()
            .extend(texts.iter().cloned());
        changed
    }

    fn loaded_family_faces(&self, family: &str) -> Vec<LoadedFontFace> {
        let mut faces = self
            .active_faces
            .values()
            .filter(|face| face.family == family)
            .filter_map(|face| {
                let load = self.loaded_assets.get(&face.id)?;
                let font = font_arc_for_face(load, face)?;
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

    fn default_family(&self) -> Option<String> {
        self.active_faces
            .values()
            .min_by_key(|face| (face.order, face.id.as_str()))
            .map(|face| face.family.clone())
    }

    fn resolve_family(&self, requested: &[String]) -> Option<String> {
        if requested
            .iter()
            .any(|family| family == NATIVE_BITMAP_FONT_FAMILY)
        {
            return None;
        }
        requested
            .iter()
            .find(|family| {
                self.active_faces
                    .values()
                    .any(|face| face.family.as_str() == family.as_str())
            })
            .cloned()
            .or_else(|| self.default_family())
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

fn rasterize_font_family(
    family: &str,
    faces: &[LoadedFontFace],
    characters: &BTreeSet<char>,
    texts: &BTreeSet<String>,
    is_default: bool,
) -> FontBackendAtlasTexture {
    let shaping_faces = faces
        .iter()
        .map(|loaded| {
            FontBackendShapingFace::new(loaded.font.font_data().to_vec(), 0).map(|shaping| {
                shaping.with_settings(
                    loaded.face.feature_settings.as_deref(),
                    loaded.face.variation_settings.as_deref(),
                )
            })
        })
        .collect::<Vec<_>>();
    let shaped_glyph_ids = shaping_faces
        .iter()
        .map(|face| {
            face.as_ref()
                .map(|face| collect_shaped_glyph_ids(face, texts))
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let character_keys = characters
        .iter()
        .copied()
        .map(|character| (character, family_glyph_key(faces, character)))
        .collect::<BTreeMap<_, _>>();
    let mut keys = character_keys.values().copied().collect::<BTreeSet<_>>();
    for (face_index, glyph_ids) in shaped_glyph_ids.iter().enumerate() {
        keys.extend(
            glyph_ids
                .iter()
                .copied()
                .map(|glyph_id| RasterGlyphKey::Face {
                    face_index,
                    glyph_id,
                }),
        );
    }

    let rows = keys.len().div_ceil(GLYPH_ATLAS_COLUMNS).max(1);
    let width = (GLYPH_ATLAS_COLUMNS * GLYPH_CELL_SIZE) as u32;
    let height = (rows * GLYPH_CELL_SIZE) as u32;
    let mut rgba = vec![0; width as usize * height as usize * 4];
    let mut rasterized = BTreeMap::new();

    for (index, key) in keys.into_iter().enumerate() {
        let cell_x = (index % GLYPH_ATLAS_COLUMNS) * GLYPH_CELL_SIZE + GLYPH_CELL_PADDING;
        let cell_y = (index / GLYPH_ATLAS_COLUMNS) * GLYPH_CELL_SIZE + GLYPH_CELL_PADDING;
        let glyph = match key {
            RasterGlyphKey::Face {
                face_index,
                glyph_id,
            } => rasterize_font_glyph(
                &faces[face_index].font,
                GlyphId(glyph_id as u16),
                cell_x,
                cell_y,
                &mut rgba,
                width as usize,
                height as usize,
            ),
            RasterGlyphKey::Missing => {
                rasterize_missing_glyph(cell_x, cell_y, &mut rgba, width as usize, height as usize)
            }
        };
        rasterized.insert(key, glyph);
    }

    let glyphs = character_keys
        .into_iter()
        .filter_map(|(character, key)| Some((character, rasterized.get(&key)?.clone())))
        .collect();
    let face_layouts = shaping_faces
        .into_iter()
        .enumerate()
        .filter_map(|(face_index, shaping_face)| {
            let shaping_face = shaping_face?;
            let glyphs_by_id = shaped_glyph_ids[face_index]
                .iter()
                .filter_map(|glyph_id| {
                    let key = RasterGlyphKey::Face {
                        face_index,
                        glyph_id: *glyph_id,
                    };
                    Some((*glyph_id, rasterized.get(&key)?.clone()))
                })
                .collect();
            Some(FontBackendAtlasFaceLayout {
                face_id: faces[face_index].face.id.clone(),
                style: faces[face_index].face.style.clone(),
                weight: faces[face_index].face.weight.clone(),
                glyphs_by_id,
                shaping_face: Box::new(shaping_face),
            })
        })
        .collect::<Vec<_>>();
    let shaping_face = face_layouts.first().map(|face| {
        (*face.shaping_face)
            .clone()
            .with_atlas_faces(face_layouts.clone())
    });
    let glyphs_by_id = shaped_glyph_ids[0]
        .iter()
        .filter_map(|glyph_id| {
            let key = RasterGlyphKey::Face {
                face_index: 0,
                glyph_id: *glyph_id,
            };
            Some((*glyph_id, rasterized.get(&key)?.clone()))
        })
        .collect();

    let scaled = faces[0].font.as_scaled(em_px_scale(&faces[0].font));
    let resource_id = font_family_resource_id(family);
    let layout = FontBackendAtlasLayout {
        resource_id: resource_id.clone(),
        family: family.to_string(),
        raster_size: RASTER_SCALE,
        ascent: scaled.ascent(),
        descent: scaled.descent(),
        line_height: scaled.height() + scaled.line_gap(),
        is_default,
        glyphs,
        glyphs_by_id,
        shaping_face,
    };
    FontBackendAtlasTexture::new(resource_id, width, height, rgba).with_layout(layout)
}

fn collect_shaped_glyph_ids(
    face: &FontBackendShapingFace,
    texts: &BTreeSet<String>,
) -> BTreeSet<u32> {
    let mut glyph_ids = BTreeSet::new();
    for text in texts {
        let mut variants = BTreeSet::from([text.clone()]);
        variants.extend(text.split_whitespace().map(ToString::to_string));
        for character in text.chars().filter(|character| !character.is_control()) {
            variants.insert(character.to_string());
        }
        for variant in variants {
            if let Some(run) = face.shape(&variant, RASTER_SCALE) {
                glyph_ids.extend(
                    run.glyphs
                        .into_iter()
                        .map(|glyph| glyph.glyph_id)
                        .filter(|glyph_id| *glyph_id != 0 && *glyph_id <= u16::MAX as u32),
                );
            }
        }
    }
    glyph_ids
}

fn transform_text(text: &str, transform: TextTransformDrawParam) -> String {
    match transform {
        TextTransformDrawParam::Uppercase => text.to_uppercase(),
        TextTransformDrawParam::Lowercase => text.to_lowercase(),
        TextTransformDrawParam::Capitalize => text
            .split_whitespace()
            .map(|word| {
                let mut characters = word.chars();
                characters
                    .next()
                    .map(|first| first.to_uppercase().collect::<String>() + characters.as_str())
                    .unwrap_or_default()
            })
            .collect::<Vec<_>>()
            .join(" "),
        TextTransformDrawParam::None => text.to_string(),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum RasterGlyphKey {
    Face { face_index: usize, glyph_id: u32 },
    Missing,
}

fn family_glyph_key(faces: &[LoadedFontFace], character: char) -> RasterGlyphKey {
    faces
        .iter()
        .enumerate()
        .find_map(|(face_index, face)| {
            let glyph_id = face.font.glyph_id(character).0;
            (glyph_id != 0).then_some(RasterGlyphKey::Face {
                face_index,
                glyph_id: u32::from(glyph_id),
            })
        })
        .unwrap_or(RasterGlyphKey::Missing)
}

fn font_arc_for_face(load: &FontBackendAssetLoad, face: &FontBackendFaceState) -> Option<FontArc> {
    let mut font = FontVec::try_from_vec(load.bytes.clone()).ok()?;
    if let Some(settings) = face.variation_settings.as_deref() {
        for variation in settings.split(',').filter_map(parse_variation_axis) {
            font.set_variation(&variation.0, variation.1);
        }
    }
    Some(FontArc::new(font))
}

fn parse_variation_axis(value: &str) -> Option<([u8; 4], f32)> {
    let mut parts = value.trim().split_whitespace();
    let tag = parts.next()?.trim_matches(['\'', '"']).as_bytes();
    let value = parts.next()?.parse().ok()?;
    if tag.len() != 4 || parts.next().is_some() {
        return None;
    }
    Some((tag.try_into().ok()?, value))
}

fn rasterize_font_glyph(
    font: &FontArc,
    glyph_id: GlyphId,
    cell_x: usize,
    cell_y: usize,
    rgba: &mut [u8],
    atlas_width: usize,
    atlas_height: usize,
) -> FontBackendAtlasGlyph {
    let raster_scale = em_px_scale(font);
    let scaled = font.as_scaled(raster_scale);
    let advance = scaled.h_advance(glyph_id);
    let glyph = glyph_id.with_scale_and_position(raster_scale, point(0.0, 0.0));
    let Some(outlined) = font.outline_glyph(glyph) else {
        return empty_glyph(advance, cell_x, cell_y, atlas_width, atlas_height);
    };
    let bounds = outlined.px_bounds();
    let max_size = GLYPH_CELL_SIZE.saturating_sub(GLYPH_CELL_PADDING * 2);
    let glyph_width = bounds.width().ceil().max(1.0).min(max_size as f32) as usize;
    let glyph_height = bounds.height().ceil().max(1.0).min(max_size as f32) as usize;
    outlined.draw(|x, y, coverage| {
        let x = x as usize;
        let y = y as usize;
        if x >= glyph_width || y >= glyph_height || coverage <= 0.0 {
            return;
        }
        blend_atlas_pixel(
            rgba,
            atlas_width,
            cell_x + x,
            cell_y + y,
            (coverage.clamp(0.0, 1.0) * 255.0).round() as u8,
        );
    });
    FontBackendAtlasGlyph {
        uv_top_left: [
            cell_x as f32 / atlas_width as f32,
            cell_y as f32 / atlas_height as f32,
        ],
        uv_bottom_right: [
            (cell_x + glyph_width) as f32 / atlas_width as f32,
            (cell_y + glyph_height) as f32 / atlas_height as f32,
        ],
        advance,
        bearing_x: bounds.min.x,
        bearing_y: bounds.min.y,
        width: glyph_width as f32,
        height: glyph_height as f32,
    }
}

fn empty_glyph(
    advance: f32,
    cell_x: usize,
    cell_y: usize,
    atlas_width: usize,
    atlas_height: usize,
) -> FontBackendAtlasGlyph {
    let uv = [
        cell_x as f32 / atlas_width as f32,
        cell_y as f32 / atlas_height as f32,
    ];
    FontBackendAtlasGlyph {
        uv_top_left: uv,
        uv_bottom_right: uv,
        advance,
        bearing_x: 0.0,
        bearing_y: 0.0,
        width: 0.0,
        height: 0.0,
    }
}

fn rasterize_missing_glyph(
    cell_x: usize,
    cell_y: usize,
    rgba: &mut [u8],
    atlas_width: usize,
    atlas_height: usize,
) -> FontBackendAtlasGlyph {
    let width = (RASTER_SCALE * 0.55) as usize;
    let height = (RASTER_SCALE * 0.8) as usize;
    for y in 0..height {
        for x in 0..width {
            if x < 2 || y < 2 || x + 2 >= width || y + 2 >= height {
                blend_atlas_pixel(rgba, atlas_width, cell_x + x, cell_y + y, 0xff);
            }
        }
    }
    FontBackendAtlasGlyph {
        uv_top_left: [
            cell_x as f32 / atlas_width as f32,
            cell_y as f32 / atlas_height as f32,
        ],
        uv_bottom_right: [
            (cell_x + width) as f32 / atlas_width as f32,
            (cell_y + height) as f32 / atlas_height as f32,
        ],
        advance: width as f32 + 4.0,
        bearing_x: 0.0,
        bearing_y: -(height as f32),
        width: width as f32,
        height: height as f32,
    }
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

fn blend_atlas_pixel(rgba: &mut [u8], atlas_width: usize, x: usize, y: usize, alpha: u8) {
    let offset = (y * atlas_width + x) * 4;
    let next_alpha = rgba[offset + 3].max(alpha);
    rgba[offset..offset + 4].copy_from_slice(&[0xff, 0xff, 0xff, next_alpha]);
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
    use std::path::PathBuf;

    use super::*;
    use quajs_wgpu_renderer::fonts::FontBackendCommand;

    #[test]
    #[cfg(target_os = "macos")]
    fn product_font_backend_rasterizes_high_resolution_proportional_glyphs() {
        let Some(bytes) = read_system_font("/System/Library/Fonts/Supplemental/Arial.ttf") else {
            return;
        };
        let font = FontArc::try_from_vec(bytes).unwrap();
        let faces = vec![LoadedFontFace {
            face: face("latin", 0, "fonts/latin.ttf"),
            font,
            owner_package_id: Some("base.fonts".to_string()),
        }];
        let atlas = rasterize_font_family(
            "Qua Fallback",
            &faces,
            &['I', 'M'].into_iter().collect(),
            &BTreeSet::from(["IM".to_string()]),
            true,
        );
        let layout = atlas.layout.as_ref().unwrap();

        assert_eq!(layout.raster_size, 64.0);
        assert!(layout.is_default);
        assert!(layout.glyphs[&'M'].width > 5.0);
        assert!(layout.glyphs[&'M'].height > 7.0);
        assert!(layout.glyphs[&'M'].advance > layout.glyphs[&'I'].advance);
        assert!(atlas.rgba.iter().skip(3).step_by(4).any(|alpha| *alpha > 0));
    }

    #[test]
    fn product_font_backend_rasterizes_shaped_ligature_glyph_ids() {
        let bytes = std::fs::read(demo_font_path()).expect("demo font bytes");
        let font = FontArc::try_from_vec(bytes).unwrap();
        let faces = vec![LoadedFontFace {
            face: FontBackendFaceState {
                id: "noto-latin".to_string(),
                order: 0,
                family: "Noto Sans".to_string(),
                asset_type: "fonts".to_string(),
                asset_name: "fonts/NotoSans-Regular.ttf".to_string(),
                style: Some("normal".to_string()),
                weight: Some("400".to_string()),
                stretch: None,
                display: None,
                unicode_range: None,
                feature_settings: None,
                variation_settings: None,
                package_candidates: BTreeSet::from(["base.fonts".to_string()]),
                face_resource_id: ResourceId::from("font:face:fonts:fonts/NotoSans-Regular.ttf"),
            },
            font,
            owner_package_id: Some("base.fonts".to_string()),
        }];
        let text = "office".to_string();
        let atlas = rasterize_font_family(
            "Noto Sans",
            &faces,
            &text.chars().collect(),
            &BTreeSet::from([text.clone()]),
            true,
        );
        let layout = atlas.layout.as_ref().unwrap();
        let run = layout
            .shaping_face
            .as_ref()
            .unwrap()
            .shape(&text, RASTER_SCALE)
            .unwrap();
        let legacy_advance = text
            .chars()
            .filter_map(|character| layout.glyphs.get(&character))
            .map(|glyph| glyph.advance)
            .sum::<f32>();

        assert!(run.glyphs.len() < text.chars().count());
        assert!(
            (run.advance() - legacy_advance).abs() < legacy_advance * 0.2,
            "shaped advance {} diverged from legacy advance {legacy_advance}",
            run.advance(),
        );
        assert!(run
            .glyphs
            .iter()
            .all(|glyph| layout.glyphs_by_id.contains_key(&glyph.glyph_id)));
        assert!(atlas.rgba.iter().skip(3).step_by(4).any(|alpha| *alpha > 0));
    }

    #[test]
    fn product_font_backend_prewarms_full_typewriter_text_before_face_activation() {
        let bytes = std::fs::read(demo_font_path()).expect("demo font bytes");
        let face = demo_face("noto-regular", "400", "fonts/NotoSans-Regular.ttf");
        let mut backend = SimpleNativeFontAtlasBackend::new();
        backend
            .prewarm_texts(&["Typewriter complete text".to_string()])
            .unwrap();
        backend
            .apply_font_asset_loads(&[load(&face, bytes, Some("base.fonts"))])
            .unwrap();
        backend
            .apply_font_commands(&FontBackendCommandPlan {
                commands: vec![command(FontBackendCommandKind::LoadFace, &face)],
                next_faces: Default::default(),
                skipped_asset_resource_ids: Vec::new(),
            })
            .unwrap();

        let atlases = backend.drain_font_atlas_textures();
        assert_eq!(atlases.len(), 1);
        let glyphs = &atlases[0].layout.as_ref().unwrap().glyphs;
        assert!("Typewriter complete text"
            .chars()
            .filter(|character| !character.is_whitespace())
            .all(|character| glyphs.contains_key(&character)));
    }

    #[test]
    fn product_font_backend_keeps_each_family_face_in_one_atlas() {
        let bytes = std::fs::read(demo_font_path()).expect("demo font bytes");
        let regular_face = demo_face("noto-regular", "400", "fonts/NotoSans-Regular.ttf");
        let bold_face = demo_face("noto-bold", "700", "fonts/NotoSans-Bold.ttf");
        let faces = vec![
            LoadedFontFace {
                face: regular_face,
                font: FontArc::try_from_vec(bytes.clone()).unwrap(),
                owner_package_id: Some("base.fonts".to_string()),
            },
            LoadedFontFace {
                face: bold_face,
                font: FontArc::try_from_vec(bytes).unwrap(),
                owner_package_id: Some("base.fonts".to_string()),
            },
        ];
        let text = "office".to_string();

        let atlas = rasterize_font_family(
            "Noto Sans",
            &faces,
            &text.chars().collect(),
            &BTreeSet::from([text]),
            true,
        );
        let atlas_faces = atlas
            .layout
            .as_ref()
            .unwrap()
            .shaping_face
            .as_ref()
            .unwrap()
            .atlas_faces();

        assert_eq!(atlas_faces.len(), 2);
        assert_eq!(atlas_faces[0].weight.as_deref(), Some("400"));
        assert_eq!(atlas_faces[1].weight.as_deref(), Some("700"));
        assert!(atlas_faces.iter().all(|face| !face.glyphs_by_id.is_empty()));
    }

    #[test]
    fn font_asset_decoder_preserves_sfnt_and_rejects_unsafe_webfont_headers() {
        let sfnt = std::fs::read(demo_font_path()).expect("demo font bytes");
        assert_eq!(
            decode_font_asset_bytes(&sfnt).as_deref(),
            Some(sfnt.as_slice())
        );

        let mut oversized = vec![0; 20];
        oversized[..4].copy_from_slice(b"wOF2");
        oversized[16..20].copy_from_slice(&((MAX_DECODED_FONT_BYTES as u32) + 1).to_be_bytes());
        assert!(decode_font_asset_bytes(&oversized).is_none());

        let mut malformed = vec![0; 20];
        malformed[..4].copy_from_slice(b"wOFF");
        malformed[16..20].copy_from_slice(&1024u32.to_be_bytes());
        assert!(decode_font_asset_bytes(&malformed).is_none());
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
        backend.requested_glyphs.insert(
            "Qua Fallback".to_string(),
            ['A', '界'].into_iter().collect(),
        );
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
        assert!(atlases[0]
            .layout
            .as_ref()
            .unwrap()
            .glyphs
            .contains_key(&'界'));
        assert!(atlases[1].layout.as_ref().unwrap().glyphs[&'界'].width > 0.0);
        assert_eq!(atlases[1].owner_package_id, None);
        assert!(atlases[1].required_package_ids.contains("base.fonts"));
        assert!(atlases[1].required_package_ids.contains("runtime.cjk"));
    }

    #[cfg(target_os = "macos")]
    fn read_system_font(path: &str) -> Option<Vec<u8>> {
        std::fs::read(path).ok()
    }

    fn demo_font_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../demo/assets/fonts/NotoSans-Regular.ttf")
    }

    fn demo_face(id: &str, weight: &str, asset_name: &str) -> FontBackendFaceState {
        FontBackendFaceState {
            id: id.to_string(),
            order: usize::from(weight == "700"),
            family: "Noto Sans".to_string(),
            asset_type: "fonts".to_string(),
            asset_name: asset_name.to_string(),
            style: Some("normal".to_string()),
            weight: Some(weight.to_string()),
            stretch: None,
            display: None,
            unicode_range: None,
            feature_settings: None,
            variation_settings: None,
            package_candidates: BTreeSet::from(["base.fonts".to_string()]),
            face_resource_id: ResourceId::from(format!("font:face:fonts:{asset_name}")),
        }
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
            feature_settings: None,
            variation_settings: None,
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
