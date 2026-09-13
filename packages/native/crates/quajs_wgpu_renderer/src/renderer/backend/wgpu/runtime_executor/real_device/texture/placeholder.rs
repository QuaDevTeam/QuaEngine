pub(super) const PLACEHOLDER_TEXTURE_EXTENT: wgpu::Extent3d = wgpu::Extent3d {
    width: 2,
    height: 2,
    depth_or_array_layers: 1,
};

pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) fn placeholder_texture_rgba8(
    resource_ids: &[String],
) -> [u8; 16] {
    let seed = placeholder_seed(resource_ids);
    let primary = placeholder_color(mix64(seed ^ 0x9e37_79b9_7f4a_7c15));
    let secondary = placeholder_color(mix64(seed ^ 0xbf58_476d_1ce4_e5b9));
    [
        primary[0],
        primary[1],
        primary[2],
        primary[3],
        secondary[0],
        secondary[1],
        secondary[2],
        secondary[3],
        secondary[0],
        secondary[1],
        secondary[2],
        secondary[3],
        primary[0],
        primary[1],
        primary[2],
        primary[3],
    ]
}

fn placeholder_seed(resource_ids: &[String]) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    if resource_ids.is_empty() {
        update_hash(&mut hash, b"<empty-texture-resource>");
    }
    for resource_id in resource_ids {
        update_hash(&mut hash, resource_id.as_bytes());
        update_hash(&mut hash, &[0xff]);
    }
    hash
}

fn update_hash(hash: &mut u64, bytes: &[u8]) {
    for byte in bytes {
        *hash ^= *byte as u64;
        *hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
}

fn mix64(value: u64) -> u64 {
    let mut mixed = value;
    mixed = (mixed ^ (mixed >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    mixed = (mixed ^ (mixed >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    mixed ^ (mixed >> 31)
}

fn placeholder_color(hash: u64) -> [u8; 4] {
    [
        0x40 | (hash as u8 & 0x7f),
        0x40 | ((hash >> 16) as u8 & 0x7f),
        0x40 | ((hash >> 32) as u8 & 0x7f),
        0xff,
    ]
}
