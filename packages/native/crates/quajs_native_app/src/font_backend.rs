use std::collections::BTreeMap;

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
    active_atlas_resources: BTreeMap<String, ResourceId>,
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
        let Some(mut atlas) = rasterize_font_asset(face, load) else {
            return;
        };
        if let Some(owner) = load
            .package_id
            .clone()
            .or_else(|| single_package_candidate(face))
        {
            atlas.owner_package_id = Some(owner.clone());
            atlas.required_package_ids.remove(&owner);
        }
        atlas
            .required_package_ids
            .extend(face.package_candidates.clone());
        if let Some(owner) = &atlas.owner_package_id {
            atlas.required_package_ids.remove(owner);
        }
        self.active_atlas_resources
            .insert(face.id.clone(), atlas.resource_id.clone());
        self.pending_atlases.push(atlas);
    }

    fn release_face(&mut self, face: &FontBackendFaceState) {
        self.loaded_assets.remove(&face.id);
        let Some(resource_id) = self.active_atlas_resources.remove(&face.id) else {
            return;
        };
        if !self
            .active_atlas_resources
            .values()
            .any(|active| active == &resource_id)
        {
            self.pending_releases.push(resource_id);
        }
    }
}

fn rasterize_font_asset(
    face: &FontBackendFaceState,
    load: &FontBackendAssetLoad,
) -> Option<FontBackendAtlasTexture> {
    let font = FontArc::try_from_vec(load.bytes.clone()).ok()?;
    let (width, height) = atlas_dimensions();
    let mut rgba = vec![0; width as usize * height as usize * 4];
    for index in 0..NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX {
        let Some(character) = native_text_atlas_char_at(index) else {
            continue;
        };
        rasterize_glyph(&font, character, index, &mut rgba, width as usize);
    }
    write_solid_mask_cell(&mut rgba, width as usize);
    Some(FontBackendAtlasTexture::new(
        font_family_resource_id(&face.family),
        width,
        height,
        rgba,
    ))
}

fn rasterize_glyph(
    font: &FontArc,
    character: char,
    index: usize,
    rgba: &mut [u8],
    atlas_width: usize,
) {
    let glyph = font
        .glyph_id(character)
        .with_scale_and_position(PxScale::from(RASTER_SCALE), point(0.0, 0.0));
    let Some(outlined) = font.outline_glyph(glyph) else {
        write_fallback_glyph_cell(index, rgba, atlas_width);
        return;
    };
    let bounds = outlined.px_bounds();
    let bounds_width = bounds.width().ceil().max(1.0);
    let bounds_height = bounds.height().ceil().max(1.0);
    let cell_x = native_text_atlas_cell_x(index) + NATIVE_TEXT_ATLAS_PADDING;
    let cell_y = native_text_atlas_cell_y(index) + NATIVE_TEXT_ATLAS_PADDING;

    outlined.draw(|x, y, coverage| {
        if coverage <= 0.0 {
            return;
        }
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
}
