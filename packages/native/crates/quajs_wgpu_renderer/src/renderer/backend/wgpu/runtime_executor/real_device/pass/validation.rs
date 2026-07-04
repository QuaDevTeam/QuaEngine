use super::super::{invalid_order, RealRuntimeBuffer};
use super::RealRuntimeDrawIndexed;
use crate::renderer::backend::wgpu::runtime_executor::{
    WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind,
};
use crate::renderer::backend::wgpu::{WgpuNativeRenderBufferRole, WgpuPhysicalRect};

pub(in super::super) fn validate_draw(
    pass_label: &str,
    draw: &RealRuntimeDrawIndexed,
    vertex_buffer: &RealRuntimeBuffer,
    index_buffer: &RealRuntimeBuffer,
    target_extent: wgpu::Extent3d,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if draw.index_count == 0 || draw.vertex_count == 0 || draw.physical_bounds.is_empty() {
        return invalid_order(format!(
            "draw '{}' in pass '{pass_label}' has an empty index/vertex range or bounds",
            draw.command_id
        ));
    }
    if draw.scissor.map_or(false, WgpuPhysicalRect::is_empty) {
        return invalid_order(format!(
            "draw '{}' in pass '{pass_label}' has an empty scissor rect",
            draw.command_id
        ));
    }
    if vertex_buffer.role != WgpuNativeRenderBufferRole::Vertex {
        return invalid_order(format!(
            "draw '{}' vertex buffer '{}' has role {:?}, expected Vertex",
            draw.command_id, draw.vertex_buffer_label, vertex_buffer.role
        ));
    }
    if index_buffer.role != WgpuNativeRenderBufferRole::Index {
        return invalid_order(format!(
            "draw '{}' index buffer '{}' has role {:?}, expected Index",
            draw.command_id, draw.index_buffer_label, index_buffer.role
        ));
    }
    if let Some(scissor) = draw.scissor {
        validate_scissor_rect(pass_label, &draw.command_id, scissor, target_extent)?;
    }
    let index_end = draw
        .first_index
        .checked_add(draw.index_count)
        .ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
                format!("draw '{}' index range overflows", draw.command_id),
            )
        })?;
    let vertex_end = draw
        .first_vertex
        .checked_add(draw.vertex_count)
        .ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
                format!("draw '{}' vertex range overflows", draw.command_id),
            )
        })?;
    if draw.first_vertex > i32::MAX as u32 {
        return invalid_order(format!(
            "draw '{}' first vertex {} exceeds wgpu base vertex range",
            draw.command_id, draw.first_vertex
        ));
    }
    let required_index_bytes = (index_end as usize)
        .checked_mul(std::mem::size_of::<u32>())
        .ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
                format!("draw '{}' index byte range overflows", draw.command_id),
            )
        })?;
    let required_vertex_bytes = (vertex_end as usize).checked_mul(32).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
            format!("draw '{}' vertex byte range overflows", draw.command_id),
        )
    })?;
    if required_index_bytes > index_buffer.byte_len {
        return invalid_order(format!(
            "draw '{}' index range requires {required_index_bytes} bytes, but index buffer has {}",
            draw.command_id, index_buffer.byte_len
        ));
    }
    if required_vertex_bytes > vertex_buffer.byte_len {
        return invalid_order(format!(
            "draw '{}' vertex range requires {required_vertex_bytes} bytes, but vertex buffer has {}",
            draw.command_id, vertex_buffer.byte_len
        ));
    }
    Ok(())
}

pub(in super::super) fn validate_pass_viewport(
    pass_label: &str,
    viewport: WgpuPhysicalRect,
    target_extent: wgpu::Extent3d,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if viewport.is_empty() {
        return invalid_order(format!("pass '{pass_label}' has an empty viewport"));
    }
    if !rect_fits_target(viewport, target_extent) {
        return invalid_order(format!(
            "pass '{pass_label}' viewport {:?} exceeds render target extent {}x{}",
            viewport, target_extent.width, target_extent.height
        ));
    }
    Ok(())
}

pub(in super::super) fn missing_draw_state(
    pass_label: &str,
    name: &str,
) -> WgpuNativeRenderRuntimeError {
    WgpuNativeRenderRuntimeError::new(
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
        format!("pass '{pass_label}' has draw commands without a bound {name}"),
    )
}

fn validate_scissor_rect(
    pass_label: &str,
    command_id: &str,
    scissor: WgpuPhysicalRect,
    target_extent: wgpu::Extent3d,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if !rect_fits_target(scissor, target_extent) {
        return invalid_order(format!(
            "draw '{command_id}' in pass '{pass_label}' scissor {:?} exceeds render target extent {}x{}",
            scissor, target_extent.width, target_extent.height
        ));
    }
    Ok(())
}

fn rect_fits_target(rect: WgpuPhysicalRect, target_extent: wgpu::Extent3d) -> bool {
    let Some(right) = rect.x.checked_add(rect.width) else {
        return false;
    };
    let Some(bottom) = rect.y.checked_add(rect.height) else {
        return false;
    };
    right <= target_extent.width && bottom <= target_extent.height
}
