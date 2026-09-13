use super::super::{RealRuntimeBuffer, RealWgpuNativeRenderRuntimeDevice};
use crate::renderer::backend::wgpu::runtime_executor::{
    WgpuNativeRenderRuntimeError, WgpuNativeRenderRuntimeErrorKind,
    WgpuNativeRenderRuntimeExecutionReport,
};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBufferDescriptor, WgpuNativeRenderBufferRole,
};

use super::super::invalid_order;

impl RealWgpuNativeRenderRuntimeDevice {
    pub(in super::super) fn create_buffer(
        &mut self,
        label: &str,
        descriptor: &WgpuNativeRenderBufferDescriptor,
        byte_len: usize,
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        if self.buffers.contains_key(label) {
            return invalid_order(format!("buffer '{label}' already exists"));
        }
        let buffer = self.real_buffer(label, descriptor, byte_len);
        self.buffers.insert(label.to_string(), buffer);
        report.buffer_create_count += 1;
        Ok(())
    }

    pub(in super::super) fn reuse_buffer(
        &self,
        label: &str,
        byte_len: usize,
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        let buffer = self.require_buffer(label)?;
        if buffer.byte_len != byte_len {
            return invalid_order(format!(
                "buffer '{label}' byte length mismatch: resident {}, requested {byte_len}",
                buffer.byte_len
            ));
        }
        report.buffer_reuse_count += 1;
        Ok(())
    }

    pub(in super::super) fn recreate_buffer(
        &mut self,
        label: &str,
        descriptor: &WgpuNativeRenderBufferDescriptor,
        byte_len: usize,
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        self.ensure_buffer_not_referenced_by_active_pass(label, "recreate")?;
        self.require_buffer(label)?;
        let buffer = self.real_buffer(label, descriptor, byte_len);
        self.buffers.insert(label.to_string(), buffer);
        report.buffer_recreate_count += 1;
        Ok(())
    }

    pub(in super::super) fn release_buffer(
        &mut self,
        label: &str,
        report: &mut WgpuNativeRenderRuntimeExecutionReport,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        self.ensure_buffer_not_referenced_by_active_pass(label, "release")?;
        self.buffers.remove(label).ok_or_else(|| {
            WgpuNativeRenderRuntimeError::new(
                WgpuNativeRenderRuntimeErrorKind::MissingBuffer,
                format!("cannot release missing buffer '{label}'"),
            )
        })?;
        report.buffer_release_count += 1;
        Ok(())
    }

    pub(in super::super) fn queue_write(
        &mut self,
        target_label: &str,
        buffer_byte_offset: usize,
        byte_len: usize,
        checksum: u64,
        bytes: &[u8],
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        self.require_buffer(target_label)?;
        self.ensure_buffer_not_referenced_by_active_pass(target_label, "write to")?;
        let queue = self.target.queue().clone();
        let buffer_handle = {
            let buffer = self.require_buffer_mut(target_label)?;
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
            buffer.buffer.clone()
        };
        queue.write_buffer(&buffer_handle, buffer_byte_offset as u64, bytes);
        Ok(())
    }

    pub(super) fn real_buffer(
        &self,
        label: &str,
        descriptor: &WgpuNativeRenderBufferDescriptor,
        byte_len: usize,
    ) -> RealRuntimeBuffer {
        let usage = match descriptor.role {
            WgpuNativeRenderBufferRole::Vertex => {
                wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST
            }
            WgpuNativeRenderBufferRole::Index => {
                wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST
            }
        };
        let buffer = self.target.device().create_buffer(&wgpu::BufferDescriptor {
            label: Some(label),
            size: byte_len.max(1) as u64,
            usage,
            mapped_at_creation: false,
        });
        RealRuntimeBuffer {
            buffer,
            role: descriptor.role,
            byte_len,
            write_count: 0,
            last_checksum: None,
        }
    }
}

pub(in super::super) fn checksum_bytes(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |hash, byte| {
        hash.wrapping_mul(0x100000001b3).wrapping_add(*byte as u64)
    })
}
