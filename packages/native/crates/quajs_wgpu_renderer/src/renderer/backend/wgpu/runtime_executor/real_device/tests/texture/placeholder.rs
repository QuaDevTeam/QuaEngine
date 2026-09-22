use super::super::*;

#[test]
fn missing_images_never_generate_visible_resource_id_colors() {
    let bg_resource_ids = vec!["images:bg.png".to_string()];
    let fg_resource_ids = vec!["images:fg.png".to_string()];

    for ids in [bg_resource_ids, fg_resource_ids, Vec::new()] {
        assert_eq!(placeholder_texture_rgba8(&ids), [0; 16]);
    }
}

#[test]
fn noop_device_rejects_invalid_decoded_texture_uploads() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);

    let error = device
        .upload_decoded_texture_rgba8(
            "images:bg.png",
            RealWgpuDecodedTextureRgba8::new(2, 2, vec![0; 15]),
        )
        .unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("RGBA byte length mismatch"));
    assert_eq!(device.decoded_texture_resource_count(), 0);
    assert_eq!(device.snapshot().resident_texture_count, 0);
    assert!(device.snapshot().resident_texture_resource_ids.is_empty());
}
