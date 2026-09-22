pub(super) const PLACEHOLDER_TEXTURE_EXTENT: wgpu::Extent3d = wgpu::Extent3d {
    width: 2,
    height: 2,
    depth_or_array_layers: 1,
};

pub(in crate::renderer::backend::wgpu::runtime_executor::real_device) fn placeholder_texture_rgba8(
    _resource_ids: &[String],
) -> [u8; 16] {
    // Missing image data is not authored content. Keep the fallback transparent;
    // resource-id-derived debug colors used to flash teal/purple during loading.
    // The product presentation gate keeps the previous surface until demanded
    // images are resident, rather than showing this incomplete offscreen frame.
    [0; 16]
}
