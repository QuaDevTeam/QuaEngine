use super::super::buffer::WgpuNativeRenderBufferVertex;

pub(super) fn vertex_bytes(vertices: &[WgpuNativeRenderBufferVertex]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(
        vertices
            .len()
            .saturating_mul(std::mem::size_of::<WgpuNativeRenderBufferVertex>()),
    );
    for vertex in vertices {
        for value in vertex
            .position
            .iter()
            .chain(vertex.uv.iter())
            .chain(vertex.color.iter())
        {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
    }
    bytes
}

pub(super) fn index_bytes(indices: &[u32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(indices.len().saturating_mul(std::mem::size_of::<u32>()));
    for index in indices {
        bytes.extend_from_slice(&index.to_le_bytes());
    }
    bytes
}
