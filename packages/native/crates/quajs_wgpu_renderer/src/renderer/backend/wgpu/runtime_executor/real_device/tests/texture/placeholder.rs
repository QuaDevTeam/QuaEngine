use super::super::*;

#[test]
fn placeholder_texture_rgba8_is_deterministic_by_resource_id() {
    let bg_resource_ids = vec!["images:bg.png".to_string()];
    let fg_resource_ids = vec!["images:fg.png".to_string()];

    assert_eq!(
        placeholder_texture_rgba8(&bg_resource_ids),
        placeholder_texture_rgba8(&bg_resource_ids)
    );
    assert_ne!(
        placeholder_texture_rgba8(&bg_resource_ids),
        placeholder_texture_rgba8(&fg_resource_ids)
    );
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
