use std::collections::BTreeMap;

use ab_glyph::{point, Font, FontArc, PxScale};
use quajs_wgpu_renderer::fonts::{
    FontBackendAssetLoad, FontBackendAtlasTexture, FontBackendCommandKind, FontBackendCommandPlan,
    FontBackendFaceState, NativeFontBackend, NativeFontBackendResult,
};
use quajs_wgpu_renderer::resources::ResourceId;

const ATLAS_COLUMNS: usize = 16;
const ATLAS_PADDING: usize = 1;
const GLYPH_WIDTH: usize = 5;
const GLYPH_HEIGHT: usize = 7;
const CELL_WIDTH: usize = GLYPH_WIDTH + ATLAS_PADDING * 2;
const CELL_HEIGHT: usize = GLYPH_HEIGHT + ATLAS_PADDING * 2;
const RASTER_SCALE: f32 = 32.0;
const ATLAS_CHARS: &[char] = &[
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S',
    'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', ',',
    ':', ';', '!', '?', '-', '_', '+', '=', '/', '\\', '(', ')', '[', ']', '\'', '"', '#', '$',
    '%', '&', '@', '*', '^', '`', '{', '|', '}', '~', '<', '>',
];
const SOLID_MASK_INDEX: usize = ATLAS_CHARS.len();

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
    for (index, character) in ATLAS_CHARS.iter().copied().enumerate() {
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
        return;
    };
    let bounds = outlined.px_bounds();
    let bounds_width = bounds.width().ceil().max(1.0);
    let bounds_height = bounds.height().ceil().max(1.0);
    let cell_x = atlas_cell_x(index) + ATLAS_PADDING;
    let cell_y = atlas_cell_y(index) + ATLAS_PADDING;

    outlined.draw(|x, y, coverage| {
        if coverage <= 0.0 {
            return;
        }
        let target_x = ((x as f32 / bounds_width) * GLYPH_WIDTH as f32)
            .floor()
            .clamp(0.0, (GLYPH_WIDTH - 1) as f32) as usize;
        let target_y = ((y as f32 / bounds_height) * GLYPH_HEIGHT as f32)
            .floor()
            .clamp(0.0, (GLYPH_HEIGHT - 1) as f32) as usize;
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

fn write_solid_mask_cell(rgba: &mut [u8], atlas_width: usize) {
    let cell_x = atlas_cell_x(SOLID_MASK_INDEX) + ATLAS_PADDING;
    let cell_y = atlas_cell_y(SOLID_MASK_INDEX) + ATLAS_PADDING;
    for y in 0..GLYPH_HEIGHT {
        for x in 0..GLYPH_WIDTH {
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
    let cell_count = ATLAS_CHARS.len() + 1;
    let rows = cell_count.div_ceil(ATLAS_COLUMNS);
    (
        (ATLAS_COLUMNS * CELL_WIDTH) as u32,
        (rows * CELL_HEIGHT) as u32,
    )
}

fn atlas_cell_x(index: usize) -> usize {
    (index % ATLAS_COLUMNS) * CELL_WIDTH
}

fn atlas_cell_y(index: usize) -> usize {
    (index / ATLAS_COLUMNS) * CELL_HEIGHT
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
