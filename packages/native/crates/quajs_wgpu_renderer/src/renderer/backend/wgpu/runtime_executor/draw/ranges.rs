use super::super::device::WgpuNativeRenderRuntimeState;
use super::super::{WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind};
use super::invalid_order;

pub(super) fn validate_draw_buffer_ranges(
    state: &WgpuNativeRenderRuntimeState,
    command_id: &str,
    vertex_buffer_label: &str,
    index_buffer_label: &str,
    first_index: u32,
    index_count: u32,
    first_vertex: u32,
    vertex_count: u32,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    let index_end = first_index.checked_add(index_count).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
            format!("draw '{command_id}' index range overflows"),
        )
    })?;
    let vertex_end = first_vertex.checked_add(vertex_count).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
            format!("draw '{command_id}' vertex range overflows"),
        )
    })?;
    if first_vertex > i32::MAX as u32 {
        return invalid_order(format!(
            "draw '{command_id}' first vertex {first_vertex} exceeds wgpu base vertex range"
        ));
    }
    let required_index_bytes = (index_end as usize)
        .checked_mul(std::mem::size_of::<u32>())
        .ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
                format!("draw '{command_id}' index byte range overflows"),
            )
        })?;
    let required_vertex_bytes = (vertex_end as usize).checked_mul(32).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
            format!("draw '{command_id}' vertex byte range overflows"),
        )
    })?;
    let index_buffer_byte_len = resident_buffer_byte_len(state, index_buffer_label)?;
    if required_index_bytes > index_buffer_byte_len {
        return invalid_order(format!(
            "draw '{command_id}' index range requires {required_index_bytes} bytes, but index buffer has {index_buffer_byte_len}"
        ));
    }
    let vertex_buffer_byte_len = resident_buffer_byte_len(state, vertex_buffer_label)?;
    if required_vertex_bytes > vertex_buffer_byte_len {
        return invalid_order(format!(
            "draw '{command_id}' vertex range requires {required_vertex_bytes} bytes, but vertex buffer has {vertex_buffer_byte_len}"
        ));
    }
    Ok(())
}

pub(super) fn resident_buffer_byte_len(
    state: &WgpuNativeRenderRuntimeState,
    label: &str,
) -> Result<usize, WgpuNativeRenderRuntimeError> {
    state
        .buffers
        .get(label)
        .map(|buffer| buffer.byte_len)
        .ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::MissingBuffer,
                format!("buffer '{label}' is not resident"),
            )
        })
}
