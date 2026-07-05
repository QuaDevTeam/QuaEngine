pub(in crate::renderer::backend::wgpu::buffer::text_geometry) fn text_character_width_factor(
    character: char,
) -> f32 {
    let code_point = character as u32;
    if matches!(
        code_point,
        0x1100..=0x115F
            | 0x2329..=0x232A
            | 0x2E80..=0xA4CF
            | 0xAC00..=0xD7A3
            | 0xF900..=0xFAFF
            | 0xFE10..=0xFE19
            | 0xFE30..=0xFE6F
            | 0xFF00..=0xFF60
            | 0xFFE0..=0xFFE6
            | 0x1F300..=0x1FAFF
    ) {
        2.0
    } else {
        1.0
    }
}
