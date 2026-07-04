pub(crate) const BITMAP_GLYPH_WIDTH: usize = 5;
pub(crate) const BITMAP_GLYPH_HEIGHT: usize = 7;
pub(crate) const BUILTIN_TEXT_ATLAS_RESOURCE_ID: &str = "glyph-atlas:builtin-bitmap-ascii";

const BITMAP_GLYPH_ATLAS_COLUMNS: usize = 16;
const BITMAP_GLYPH_ATLAS_PADDING: usize = 1;
const BITMAP_GLYPH_ATLAS_CELL_WIDTH: usize = BITMAP_GLYPH_WIDTH + BITMAP_GLYPH_ATLAS_PADDING * 2;
const BITMAP_GLYPH_ATLAS_CELL_HEIGHT: usize = BITMAP_GLYPH_HEIGHT + BITMAP_GLYPH_ATLAS_PADDING * 2;
const BITMAP_GLYPH_ATLAS_CHARS: &[char] = &[
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S',
    'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', ',',
    ':', ';', '!', '?', '-', '_', '+', '=', '/', '\\', '(', ')', '[', ']', '\'', '"', '#', '$',
    '%', '&', '@', '*', '^', '`', '{', '|', '}', '~', '<', '>',
];
const BITMAP_SOLID_MASK_ATLAS_INDEX: usize = BITMAP_GLYPH_ATLAS_CHARS.len();

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct BitmapAtlasUvBounds {
    pub top_left: [f32; 2],
    pub bottom_right: [f32; 2],
}

pub(crate) fn builtin_text_atlas_dimensions() -> (u32, u32) {
    let cell_count = BITMAP_GLYPH_ATLAS_CHARS.len() + 1;
    let rows = cell_count.div_ceil(BITMAP_GLYPH_ATLAS_COLUMNS);
    (
        (BITMAP_GLYPH_ATLAS_COLUMNS * BITMAP_GLYPH_ATLAS_CELL_WIDTH) as u32,
        (rows * BITMAP_GLYPH_ATLAS_CELL_HEIGHT) as u32,
    )
}

#[cfg(feature = "real-wgpu")]
pub(crate) fn builtin_text_atlas_rgba8() -> Vec<u8> {
    let (width, height) = builtin_text_atlas_dimensions();
    let mut rgba = vec![0; width as usize * height as usize * 4];
    for (index, character) in BITMAP_GLYPH_ATLAS_CHARS.iter().copied().enumerate() {
        let Some(rows) = bitmap_glyph_rows(character) else {
            continue;
        };
        write_atlas_cell(&mut rgba, width as usize, index, rows);
    }
    write_solid_mask_cell(&mut rgba, width as usize);
    rgba
}

pub(super) fn bitmap_glyph_uv_bounds(character: char) -> Option<BitmapAtlasUvBounds> {
    let normalized = character.to_ascii_uppercase();
    let index = BITMAP_GLYPH_ATLAS_CHARS
        .iter()
        .position(|candidate| *candidate == normalized)?;
    Some(atlas_uv_bounds(index))
}

pub(super) fn bitmap_solid_uv_bounds() -> BitmapAtlasUvBounds {
    atlas_uv_bounds(BITMAP_SOLID_MASK_ATLAS_INDEX)
}

#[cfg(feature = "real-wgpu")]
fn write_atlas_cell(
    rgba: &mut [u8],
    atlas_width: usize,
    index: usize,
    rows: [u8; BITMAP_GLYPH_HEIGHT],
) {
    let x = atlas_cell_x(index) + BITMAP_GLYPH_ATLAS_PADDING;
    let y = atlas_cell_y(index) + BITMAP_GLYPH_ATLAS_PADDING;
    for (row_index, row) in rows.into_iter().enumerate() {
        for column_index in 0..BITMAP_GLYPH_WIDTH {
            let mask = 1 << (BITMAP_GLYPH_WIDTH - 1 - column_index);
            if row & mask == 0 {
                continue;
            }
            write_atlas_pixel(
                rgba,
                atlas_width,
                x + column_index,
                y + row_index,
                [0xff, 0xff, 0xff, 0xff],
            );
        }
    }
}

#[cfg(feature = "real-wgpu")]
fn write_solid_mask_cell(rgba: &mut [u8], atlas_width: usize) {
    let x = atlas_cell_x(BITMAP_SOLID_MASK_ATLAS_INDEX) + BITMAP_GLYPH_ATLAS_PADDING;
    let y = atlas_cell_y(BITMAP_SOLID_MASK_ATLAS_INDEX) + BITMAP_GLYPH_ATLAS_PADDING;
    for row_index in 0..BITMAP_GLYPH_HEIGHT {
        for column_index in 0..BITMAP_GLYPH_WIDTH {
            write_atlas_pixel(
                rgba,
                atlas_width,
                x + column_index,
                y + row_index,
                [0xff, 0xff, 0xff, 0xff],
            );
        }
    }
}

#[cfg(feature = "real-wgpu")]
fn write_atlas_pixel(rgba: &mut [u8], atlas_width: usize, x: usize, y: usize, value: [u8; 4]) {
    let offset = (y * atlas_width + x) * 4;
    rgba[offset..offset + 4].copy_from_slice(&value);
}

fn atlas_uv_bounds(index: usize) -> BitmapAtlasUvBounds {
    let (atlas_width, atlas_height) = builtin_text_atlas_dimensions();
    let x = atlas_cell_x(index) + BITMAP_GLYPH_ATLAS_PADDING;
    let y = atlas_cell_y(index) + BITMAP_GLYPH_ATLAS_PADDING;
    BitmapAtlasUvBounds {
        top_left: [
            x as f32 / atlas_width as f32,
            y as f32 / atlas_height as f32,
        ],
        bottom_right: [
            (x + BITMAP_GLYPH_WIDTH) as f32 / atlas_width as f32,
            (y + BITMAP_GLYPH_HEIGHT) as f32 / atlas_height as f32,
        ],
    }
}

fn atlas_cell_x(index: usize) -> usize {
    (index % BITMAP_GLYPH_ATLAS_COLUMNS) * BITMAP_GLYPH_ATLAS_CELL_WIDTH
}

fn atlas_cell_y(index: usize) -> usize {
    (index / BITMAP_GLYPH_ATLAS_COLUMNS) * BITMAP_GLYPH_ATLAS_CELL_HEIGHT
}

pub(super) fn bitmap_glyph_rows(character: char) -> Option<[u8; BITMAP_GLYPH_HEIGHT]> {
    match character.to_ascii_uppercase() {
        'A' => Some([
            0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001,
        ]),
        'B' => Some([
            0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110,
        ]),
        'C' => Some([
            0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110,
        ]),
        'D' => Some([
            0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110,
        ]),
        'E' => Some([
            0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111,
        ]),
        'F' => Some([
            0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000,
        ]),
        'G' => Some([
            0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110,
        ]),
        'H' => Some([
            0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001,
        ]),
        'I' => Some([
            0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111,
        ]),
        'J' => Some([
            0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100,
        ]),
        'K' => Some([
            0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001,
        ]),
        'L' => Some([
            0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111,
        ]),
        'M' => Some([
            0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001,
        ]),
        'N' => Some([
            0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001,
        ]),
        'O' => Some([
            0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110,
        ]),
        'P' => Some([
            0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000,
        ]),
        'Q' => Some([
            0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101,
        ]),
        'R' => Some([
            0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001,
        ]),
        'S' => Some([
            0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110,
        ]),
        'T' => Some([
            0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100,
        ]),
        'U' => Some([
            0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110,
        ]),
        'V' => Some([
            0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100,
        ]),
        'W' => Some([
            0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010,
        ]),
        'X' => Some([
            0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001,
        ]),
        'Y' => Some([
            0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100,
        ]),
        'Z' => Some([
            0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111,
        ]),
        '0' => Some([
            0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110,
        ]),
        '1' => Some([
            0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110,
        ]),
        '2' => Some([
            0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111,
        ]),
        '3' => Some([
            0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110,
        ]),
        '4' => Some([
            0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010,
        ]),
        '5' => Some([
            0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110,
        ]),
        '6' => Some([
            0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110,
        ]),
        '7' => Some([
            0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000,
        ]),
        '8' => Some([
            0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110,
        ]),
        '9' => Some([
            0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110,
        ]),
        '.' => Some([
            0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b01100, 0b01100,
        ]),
        ',' => Some([
            0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100, 0b01000,
        ]),
        ':' => Some([
            0b00000, 0b01100, 0b01100, 0b00000, 0b01100, 0b01100, 0b00000,
        ]),
        ';' => Some([
            0b00000, 0b01100, 0b01100, 0b00000, 0b00100, 0b00100, 0b01000,
        ]),
        '!' => Some([
            0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100,
        ]),
        '?' => Some([
            0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b00000, 0b00100,
        ]),
        '-' => Some([
            0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000,
        ]),
        '_' => Some([
            0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b11111,
        ]),
        '+' => Some([
            0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000,
        ]),
        '=' => Some([
            0b00000, 0b00000, 0b11111, 0b00000, 0b11111, 0b00000, 0b00000,
        ]),
        '/' => Some([
            0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000,
        ]),
        '\\' => Some([
            0b10000, 0b01000, 0b01000, 0b00100, 0b00010, 0b00010, 0b00001,
        ]),
        '(' => Some([
            0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010,
        ]),
        ')' => Some([
            0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000,
        ]),
        '[' => Some([
            0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110,
        ]),
        ']' => Some([
            0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110,
        ]),
        '\'' => Some([
            0b00100, 0b00100, 0b01000, 0b00000, 0b00000, 0b00000, 0b00000,
        ]),
        '"' => Some([
            0b01010, 0b01010, 0b01010, 0b00000, 0b00000, 0b00000, 0b00000,
        ]),
        '#' => Some([
            0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010,
        ]),
        '$' => Some([
            0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100,
        ]),
        '%' => Some([
            0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011,
        ]),
        '&' => Some([
            0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101,
        ]),
        '@' => Some([
            0b01110, 0b10001, 0b10111, 0b10101, 0b10111, 0b10000, 0b01110,
        ]),
        '*' => Some([
            0b00000, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0b00000,
        ]),
        '^' => Some([
            0b00100, 0b01010, 0b10001, 0b00000, 0b00000, 0b00000, 0b00000,
        ]),
        '`' => Some([
            0b01000, 0b00100, 0b00010, 0b00000, 0b00000, 0b00000, 0b00000,
        ]),
        '{' => Some([
            0b00010, 0b00100, 0b00100, 0b01000, 0b00100, 0b00100, 0b00010,
        ]),
        '|' => Some([
            0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100,
        ]),
        '}' => Some([
            0b01000, 0b00100, 0b00100, 0b00010, 0b00100, 0b00100, 0b01000,
        ]),
        '~' => Some([
            0b00000, 0b00000, 0b01001, 0b10110, 0b00000, 0b00000, 0b00000,
        ]),
        '<' => Some([
            0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010,
        ]),
        '>' => Some([
            0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000,
        ]),
        _ => None,
    }
}
