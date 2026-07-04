use super::*;

#[test]
fn noop_device_tracks_decoded_texture_package_memory_and_releases_owned_package_textures() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    device
        .upload_decoded_texture_rgba8_with_metadata(
            "images:bg.png",
            RealWgpuDecodedTextureRgba8::new(2, 2, vec![255; 16]),
            RealWgpuDecodedTextureMetadata::default()
                .owned_by("runtime.bg")
                .require_package("base"),
        )
        .unwrap();
    device
        .upload_decoded_texture_rgba8_with_metadata(
            "images:ui/icon.png",
            RealWgpuDecodedTextureRgba8::new(1, 1, vec![128, 64, 32, 255]),
            RealWgpuDecodedTextureMetadata::default()
                .owned_by("runtime.ui")
                .require_package("base"),
        )
        .unwrap();

    let snapshot = device.snapshot();

    assert_eq!(snapshot.resident_texture_count, 2);
    assert_eq!(snapshot.resident_texture_byte_len, 20);
    assert_eq!(
        snapshot.resident_texture_resource_ids,
        vec![
            "images:bg.png".to_string(),
            "images:ui/icon.png".to_string()
        ]
    );
    assert_eq!(
        snapshot
            .resident_texture_byte_len_by_package
            .get("runtime.bg"),
        Some(&WgpuNativeRenderRuntimeTexturePackageMemory {
            owned_count: 1,
            dependent_count: 0,
            owned_byte_len: 16,
            dependent_byte_len: 0,
        })
    );
    assert_eq!(
        snapshot.resident_texture_byte_len_by_package.get("base"),
        Some(&WgpuNativeRenderRuntimeTexturePackageMemory {
            owned_count: 0,
            dependent_count: 2,
            owned_byte_len: 0,
            dependent_byte_len: 20,
        })
    );

    assert_eq!(device.release_decoded_textures_for_package("runtime.bg"), 1);
    assert_eq!(device.release_decoded_textures_for_package("runtime.bg"), 0);
    let snapshot = device.snapshot();

    assert_eq!(snapshot.resident_texture_count, 1);
    assert_eq!(snapshot.resident_texture_byte_len, 4);
    assert_eq!(
        snapshot.resident_texture_resource_ids,
        vec!["images:ui/icon.png".to_string()]
    );
    assert!(!snapshot
        .resident_texture_byte_len_by_package
        .contains_key("runtime.bg"));
    assert_eq!(
        snapshot.resident_texture_byte_len_by_package.get("base"),
        Some(&WgpuNativeRenderRuntimeTexturePackageMemory {
            owned_count: 0,
            dependent_count: 1,
            owned_byte_len: 0,
            dependent_byte_len: 4,
        })
    );
}

#[test]
fn noop_device_releases_decoded_textures_that_depend_on_package() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    device
        .upload_decoded_texture_rgba8_with_metadata(
            "images:bg.png",
            RealWgpuDecodedTextureRgba8::new(2, 2, vec![255; 16]),
            RealWgpuDecodedTextureMetadata::default()
                .owned_by("runtime.bg")
                .require_package("base"),
        )
        .unwrap();
    device
        .upload_decoded_texture_rgba8_with_metadata(
            "images:ui/icon.png",
            RealWgpuDecodedTextureRgba8::new(1, 1, vec![128, 64, 32, 255]),
            RealWgpuDecodedTextureMetadata::default().owned_by("runtime.ui"),
        )
        .unwrap();

    assert_eq!(
        device.decoded_texture_resource_ids_for_package("base"),
        vec!["images:bg.png".to_string()]
    );
    assert_eq!(device.release_decoded_textures_for_package("base"), 1);
    assert_eq!(device.release_decoded_textures_for_package("base"), 0);

    let snapshot = device.snapshot();
    assert_eq!(snapshot.resident_texture_count, 1);
    assert_eq!(
        snapshot.resident_texture_resource_ids,
        vec!["images:ui/icon.png".to_string()]
    );
    assert!(!snapshot
        .resident_texture_byte_len_by_package
        .contains_key("base"));
    assert_eq!(
        snapshot
            .resident_texture_byte_len_by_package
            .get("runtime.ui"),
        Some(&WgpuNativeRenderRuntimeTexturePackageMemory {
            owned_count: 1,
            dependent_count: 0,
            owned_byte_len: 4,
            dependent_byte_len: 0,
        })
    );
}
