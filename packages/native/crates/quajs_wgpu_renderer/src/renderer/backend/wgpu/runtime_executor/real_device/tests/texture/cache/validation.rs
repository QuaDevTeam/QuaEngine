use super::*;

#[test]
fn noop_device_rejects_unsafe_decoded_texture_resource_ids_without_residency() {
    let unsafe_resource_ids = [
        "",
        "images:",
        " images:bg.png",
        "/images/bg.png",
        "images:\\bg.png",
        "file:///tmp/native.node",
        "images:../native.dll",
        "images:bg.png?raw",
        "images:native/plugin.node",
    ];

    for resource_id in unsafe_resource_ids {
        let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
        let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
        let error = device
            .upload_decoded_texture_rgba8(
                resource_id,
                RealWgpuDecodedTextureRgba8::new(1, 1, vec![128, 64, 32, 255]),
            )
            .unwrap_err();

        assert_eq!(
            error.kind,
            WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
        );
        assert!(
            error.message.contains("decoded texture resource id"),
            "unexpected validation message for {resource_id:?}: {}",
            error.message
        );
        let snapshot = device.snapshot();
        assert_eq!(snapshot.resident_texture_count, 0);
        assert!(snapshot.resident_texture_resource_ids.is_empty());
        assert!(snapshot.resident_texture_byte_len_by_package.is_empty());
    }
}

#[test]
fn noop_device_rejects_unsafe_decoded_texture_package_metadata_without_residency() {
    let unsafe_metadata = [
        RealWgpuDecodedTextureMetadata::default().owned_by(""),
        RealWgpuDecodedTextureMetadata::default().owned_by(" runtime.bg"),
        RealWgpuDecodedTextureMetadata::default().owned_by("file:///tmp/native.node"),
        RealWgpuDecodedTextureMetadata::default().owned_by("runtime/escape"),
        RealWgpuDecodedTextureMetadata::default().owned_by("runtime..escape"),
        RealWgpuDecodedTextureMetadata::default().owned_by("runtime.dll"),
        RealWgpuDecodedTextureMetadata::default().require_package("native/load.dll"),
        RealWgpuDecodedTextureMetadata::default().require_package("runtime.ui?debug"),
    ];

    for metadata in unsafe_metadata {
        let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
        let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
        let error = device
            .upload_decoded_texture_rgba8_with_metadata(
                "images:bg.png",
                RealWgpuDecodedTextureRgba8::new(1, 1, vec![128, 64, 32, 255]),
                metadata,
            )
            .unwrap_err();

        assert_eq!(
            error.kind,
            WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
        );
        assert!(
            error.message.contains("decoded texture")
                && (error.message.contains("owner package id")
                    || error.message.contains("required package id")),
            "unexpected metadata validation message: {}",
            error.message
        );
        let snapshot = device.snapshot();
        assert_eq!(snapshot.resident_texture_count, 0);
        assert!(snapshot.resident_texture_resource_ids.is_empty());
        assert!(snapshot.resident_texture_byte_len_by_package.is_empty());
    }
}
