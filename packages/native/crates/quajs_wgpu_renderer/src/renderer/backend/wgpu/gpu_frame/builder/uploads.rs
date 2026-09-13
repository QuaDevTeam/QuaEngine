use super::super::super::buffer::WgpuNativeRenderBufferPass;
use super::super::super::pipeline::{
    WgpuNativeRenderBufferDescriptor, WgpuNativeRenderBufferRole, WgpuNativeRenderBufferUsage,
    WgpuNativeRenderPipelineOperation, WgpuNativeRenderPipelinePass,
};
use super::super::bytes::{index_bytes, vertex_bytes};
use super::super::WgpuNativeRenderGpuBufferUpload;

pub(super) fn gpu_uploads_for_pass(
    buffer_pass: Option<&WgpuNativeRenderBufferPass>,
    pipeline_pass: &WgpuNativeRenderPipelinePass,
    initial_staging_byte_offset: usize,
) -> Vec<WgpuNativeRenderGpuBufferUpload> {
    let mut staging_byte_offset = initial_staging_byte_offset;
    let mut uploads = Vec::new();
    let Some(buffer_pass) = buffer_pass else {
        return uploads;
    };

    if !buffer_pass.vertices.is_empty() {
        let bytes = vertex_bytes(&buffer_pass.vertices);
        uploads.push(gpu_upload(
            pipeline_pass,
            WgpuNativeRenderBufferRole::Vertex,
            staging_byte_offset,
            buffer_pass.vertices.len(),
            bytes,
        ));
        staging_byte_offset = uploads
            .last()
            .map(|upload| upload.staging_byte_offset.saturating_add(upload.byte_len))
            .unwrap_or(staging_byte_offset);
    }
    if !buffer_pass.indices.is_empty() {
        let bytes = index_bytes(&buffer_pass.indices);
        uploads.push(gpu_upload(
            pipeline_pass,
            WgpuNativeRenderBufferRole::Index,
            staging_byte_offset,
            buffer_pass.indices.len(),
            bytes,
        ));
    }

    uploads
}

pub(super) fn upload_byte_len_for_role(
    uploads: &[WgpuNativeRenderGpuBufferUpload],
    role: WgpuNativeRenderBufferRole,
) -> usize {
    uploads
        .iter()
        .filter(|upload| upload.descriptor.role == role)
        .map(|upload| upload.byte_len)
        .sum()
}

fn gpu_upload(
    pipeline_pass: &WgpuNativeRenderPipelinePass,
    role: WgpuNativeRenderBufferRole,
    staging_byte_offset: usize,
    element_count: usize,
    bytes: Vec<u8>,
) -> WgpuNativeRenderGpuBufferUpload {
    let descriptor = upload_descriptor_for_role(pipeline_pass, role, bytes.len(), element_count);
    WgpuNativeRenderGpuBufferUpload {
        pass_index: pipeline_pass.pass_index,
        descriptor,
        staging_byte_offset,
        buffer_byte_offset: 0,
        byte_len: bytes.len(),
        element_count,
        bytes,
    }
}

fn upload_descriptor_for_role(
    pass: &WgpuNativeRenderPipelinePass,
    role: WgpuNativeRenderBufferRole,
    byte_len: usize,
    element_count: usize,
) -> WgpuNativeRenderBufferDescriptor {
    pass.operations
        .iter()
        .find_map(|operation| match operation {
            WgpuNativeRenderPipelineOperation::UploadBuffer { descriptor }
                if descriptor.role == role =>
            {
                Some(descriptor.clone())
            }
            _ => None,
        })
        .unwrap_or_else(|| fallback_upload_descriptor(role, byte_len, element_count))
}

fn fallback_upload_descriptor(
    role: WgpuNativeRenderBufferRole,
    byte_len: usize,
    element_count: usize,
) -> WgpuNativeRenderBufferDescriptor {
    WgpuNativeRenderBufferDescriptor {
        label: match role {
            WgpuNativeRenderBufferRole::Vertex => "qua-native::frame-vertex-buffer",
            WgpuNativeRenderBufferRole::Index => "qua-native::frame-index-buffer",
        }
        .to_string(),
        role,
        byte_len,
        element_count,
        usage: match role {
            WgpuNativeRenderBufferRole::Vertex => WgpuNativeRenderBufferUsage::VertexCopyDst,
            WgpuNativeRenderBufferRole::Index => WgpuNativeRenderBufferUsage::IndexCopyDst,
        },
    }
}
