#[cfg(feature = "image-decode")]
use super::super::*;

#[cfg(feature = "image-decode")]
const PNG_1X1_RED_RGBA: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
    0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99, 0x3d, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

#[cfg(feature = "image-decode")]
const WEBP_1X1_RGBA: &[u8] = &[
    0x52, 0x49, 0x46, 0x46, 0x1c, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
    0x0f, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00, 0x00, 0x07, 0x10, 0xfd, 0x8f, 0xfe, 0x07, 0x22,
    0xa2, 0xff, 0x01, 0x00,
];

#[cfg(feature = "image-decode")]
#[test]
fn decodes_png_image_bytes_to_rgba8() {
    let decoded = decode_image_bytes_rgba8("images:red.png", PNG_1X1_RED_RGBA).unwrap();

    assert_eq!(decoded.width, 1);
    assert_eq!(decoded.height, 1);
    assert_eq!(decoded.rgba, vec![255, 0, 0, 255]);
}

#[cfg(feature = "image-decode")]
#[test]
fn decodes_webp_image_bytes_to_rgba8() {
    let decoded = decode_image_bytes_rgba8("images:pixel.webp", WEBP_1X1_RGBA).unwrap();

    assert_eq!(decoded.width, 1);
    assert_eq!(decoded.height, 1);
    assert_eq!(decoded.rgba, vec![255, 0, 0, 255]);
}

#[cfg(feature = "image-decode")]
#[test]
fn rejects_invalid_encoded_image_bytes() {
    let error = decode_image_bytes_rgba8("images:broken.png", b"not an image").unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("failed to decode encoded image"));
}

#[cfg(feature = "image-decode")]
#[test]
fn noop_device_uploads_encoded_image_texture_for_matching_resource_id() {
    let target = RealWgpuNativeRenderRuntimeTarget::noop(64, 64);
    let mut device = RealWgpuNativeRenderRuntimeDevice::new(target);
    device
        .upload_image_texture_bytes_with_metadata(
            "images:red.png",
            PNG_1X1_RED_RGBA,
            RealWgpuDecodedTextureMetadata::default().owned_by("runtime.images"),
        )
        .unwrap();
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(device);
    let plan = WgpuNativeRenderRuntimePlan {
        revision: 10,
        operation_count: 1,
        cache_operation_count: 1,
        operations: vec![WgpuNativeRenderRuntimeOperation::CreateBindGroup {
            cache_label: "bind-group::texture".to_string(),
            command_id: "background:image".to_string(),
            layout: WgpuNativeRenderBindGroupLayout::TextureSampler,
            resource_ids: vec!["images:red.png".to_string()],
        }],
        ..Default::default()
    };

    let report = executor.apply_runtime_plan(&plan).unwrap();

    assert_eq!(report.resident_texture_count, 1);
    assert_eq!(report.resident_texture_byte_len, 4);
    assert_eq!(
        report.resident_texture_resource_ids,
        vec!["images:red.png".to_string()]
    );
    assert_eq!(
        report.texture_sampler_diagnostics.decoded_bind_group_count,
        1
    );
    assert_eq!(
        report
            .texture_sampler_diagnostics
            .decoded_resource_ids_by_bind_group
            .get("bind-group::texture"),
        Some(&"images:red.png".to_string())
    );
}
