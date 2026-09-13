use super::super::device::{RuntimeBufferState, WgpuNativeRenderRuntimeState};
use super::super::{
    WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind,
    WgpuNativeRenderRuntimeExecutionReport,
};
use super::guards::{ensure_buffer_not_referenced_by_active_pass, invalid_order};
use crate::renderer::backend::wgpu::WgpuNativeRenderBufferRole;

pub(in crate::renderer::backend::wgpu::runtime_executor) fn create_buffer(
    state: &mut WgpuNativeRenderRuntimeState,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    label: &str,
    role: WgpuNativeRenderBufferRole,
    byte_len: usize,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    if state.buffers.contains_key(label) {
        return invalid_order(format!("buffer '{label}' already exists"));
    }
    state.buffers.insert(
        label.to_string(),
        RuntimeBufferState {
            role,
            byte_len,
            write_count: 0,
            last_checksum: None,
        },
    );
    report.buffer_create_count += 1;
    Ok(())
}

pub(in crate::renderer::backend::wgpu::runtime_executor) fn reuse_buffer(
    state: &mut WgpuNativeRenderRuntimeState,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    label: &str,
    byte_len: usize,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    let buffer = resident_buffer(state, label)?;
    if buffer.byte_len != byte_len {
        return invalid_order(format!(
            "buffer '{label}' byte length mismatch: resident {}, requested {byte_len}",
            buffer.byte_len
        ));
    }
    report.buffer_reuse_count += 1;
    Ok(())
}

pub(in crate::renderer::backend::wgpu::runtime_executor) fn recreate_buffer(
    state: &mut WgpuNativeRenderRuntimeState,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    label: &str,
    role: WgpuNativeRenderBufferRole,
    byte_len: usize,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    ensure_buffer_not_referenced_by_active_pass(state, label, "recreate")?;
    require_buffer(state, label)?;
    state.buffers.insert(
        label.to_string(),
        RuntimeBufferState {
            role,
            byte_len,
            write_count: 0,
            last_checksum: None,
        },
    );
    report.buffer_recreate_count += 1;
    Ok(())
}

pub(in crate::renderer::backend::wgpu::runtime_executor) fn release_buffer(
    state: &mut WgpuNativeRenderRuntimeState,
    report: &mut WgpuNativeRenderRuntimeExecutionReport,
    label: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    ensure_buffer_not_referenced_by_active_pass(state, label, "release")?;
    state.buffers.remove(label).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::MissingBuffer,
            format!("cannot release missing buffer '{label}'"),
        )
    })?;
    report.buffer_release_count += 1;
    Ok(())
}

pub(in crate::renderer::backend::wgpu::runtime_executor) fn queue_write(
    state: &mut WgpuNativeRenderRuntimeState,
    target_label: &str,
    buffer_byte_offset: usize,
    byte_len: usize,
    checksum: u64,
    bytes: &[u8],
) -> Result<(), WgpuNativeRenderRuntimeError> {
    require_buffer(state, target_label)?;
    ensure_buffer_not_referenced_by_active_pass(state, target_label, "write to")?;
    let buffer = require_buffer_mut(state, target_label)?;
    if bytes.len() != byte_len {
        return invalid_order(format!(
            "queue write payload length mismatch for '{target_label}': bytes {}, write {byte_len}",
            bytes.len()
        ));
    }
    let actual_checksum = checksum_bytes(bytes);
    if actual_checksum != checksum {
        return invalid_order(format!(
            "queue write checksum mismatch for '{target_label}': payload {actual_checksum}, expected {checksum}"
        ));
    }
    let end = buffer_byte_offset.checked_add(byte_len).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder,
            format!("queue write offset overflow for '{target_label}'"),
        )
    })?;
    if end > buffer.byte_len {
        return invalid_order(format!(
            "queue write range exceeds buffer '{target_label}': end {end}, buffer {}",
            buffer.byte_len
        ));
    }
    buffer.write_count += 1;
    buffer.last_checksum = Some(checksum);
    Ok(())
}

fn require_buffer(
    state: &WgpuNativeRenderRuntimeState,
    label: &str,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    state.buffers.get(label).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::MissingBuffer,
            format!("buffer '{label}' is not resident"),
        )
    })?;
    Ok(())
}

pub(in crate::renderer::backend::wgpu::runtime_executor) fn require_buffer_role_and_byte_len(
    state: &WgpuNativeRenderRuntimeState,
    label: &str,
    expected_role: WgpuNativeRenderBufferRole,
    byte_len: usize,
) -> Result<(), WgpuNativeRenderRuntimeError> {
    let buffer = resident_buffer(state, label)?;
    if buffer.role != expected_role {
        return invalid_order(format!(
            "buffer '{label}' role mismatch: resident {:?}, expected {:?}",
            buffer.role, expected_role
        ));
    }
    if buffer.byte_len != byte_len {
        return invalid_order(format!(
            "buffer '{label}' byte length mismatch: resident {}, requested {byte_len}",
            buffer.byte_len
        ));
    }
    Ok(())
}

fn resident_buffer<'a>(
    state: &'a WgpuNativeRenderRuntimeState,
    label: &str,
) -> Result<&'a RuntimeBufferState, WgpuNativeRenderRuntimeError> {
    state.buffers.get(label).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::MissingBuffer,
            format!("buffer '{label}' is not resident"),
        )
    })
}

fn require_buffer_mut<'a>(
    state: &'a mut WgpuNativeRenderRuntimeState,
    label: &str,
) -> Result<&'a mut RuntimeBufferState, WgpuNativeRenderRuntimeError> {
    state.buffers.get_mut(label).ok_or_else(|| {
        WgpuNativeRenderRuntimeError::new(
            WgpuNativeRenderRuntimeErrorKind::MissingBuffer,
            format!("buffer '{label}' is not resident"),
        )
    })
}

fn checksum_bytes(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |hash, byte| {
        hash.wrapping_mul(0x100000001b3).wrapping_add(*byte as u64)
    })
}
