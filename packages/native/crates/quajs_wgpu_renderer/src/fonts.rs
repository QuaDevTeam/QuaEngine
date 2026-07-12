pub mod backend;
pub mod commands;
pub mod text_atlas;

/// Reserved family marker for renderer-owned diagnostic text that should use
/// the tiny built-in atlas instead of product font shaping.
pub const NATIVE_BITMAP_FONT_FAMILY: &str = "__qua_native_bitmap__";

pub use backend::{
    FontBackendAssetLoad, FontBackendAtlasFaceLayout, FontBackendAtlasGlyph,
    FontBackendAtlasLayout, FontBackendAtlasLayoutMap, FontBackendAtlasTexture,
    FontBackendShapedDirection, FontBackendShapedGlyph, FontBackendShapedRun,
    FontBackendShapingFace, NativeFontBackend, NativeFontBackendError, NativeFontBackendErrorKind,
    NativeFontBackendResult, NullNativeFontBackend, NullNativeFontBackendDiagnostics,
};
pub use commands::{
    plan_font_backend_commands, plan_font_backend_package_teardown_commands, FontBackendCommand,
    FontBackendCommandKind, FontBackendCommandPlan, FontBackendFaceState, FontBackendFaceStateMap,
};
pub use text_atlas::{
    native_text_atlas_cell_x, native_text_atlas_cell_y, native_text_atlas_char_at,
    native_text_atlas_char_index, native_text_atlas_dimensions,
    native_text_atlas_extended_char_count, NativeTextAtlasCharRange, NATIVE_TEXT_ATLAS_CELL_HEIGHT,
    NATIVE_TEXT_ATLAS_CELL_WIDTH, NATIVE_TEXT_ATLAS_CHARS, NATIVE_TEXT_ATLAS_COLUMNS,
    NATIVE_TEXT_ATLAS_EXTENDED_RANGES, NATIVE_TEXT_ATLAS_GLYPH_HEIGHT,
    NATIVE_TEXT_ATLAS_GLYPH_WIDTH, NATIVE_TEXT_ATLAS_PADDING, NATIVE_TEXT_ATLAS_SOLID_MASK_INDEX,
};
