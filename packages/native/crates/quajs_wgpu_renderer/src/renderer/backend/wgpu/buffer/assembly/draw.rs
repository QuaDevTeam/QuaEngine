use crate::resources::ResourceId;

use crate::renderer::backend::NativeBackendEncoderSkipReason;

use super::super::super::mesh::{WgpuNativeRenderPaint, WgpuNativeRenderQuad};
use super::super::super::physical::WgpuPhysicalRect;
use super::super::types::{
    WgpuNativeRenderDrawCall, WgpuNativeRenderSkippedQuad, WgpuNativeRenderSkippedQuadReason,
};

impl WgpuNativeRenderDrawCall {
    pub(super) fn from_quad(
        quad: &WgpuNativeRenderQuad,
        first_vertex: u32,
        first_index: u32,
    ) -> Self {
        Self::from_quad_range(
            quad,
            first_vertex,
            first_index,
            quad.vertices.len() as u32,
            quad.indices.len() as u32,
        )
    }

    pub(super) fn from_quad_range(
        quad: &WgpuNativeRenderQuad,
        first_vertex: u32,
        first_index: u32,
        vertex_count: u32,
        index_count: u32,
    ) -> Self {
        Self {
            command_id: quad.command_id.clone(),
            pipeline: quad.pipeline,
            draw_kind: quad.draw_kind,
            first_vertex,
            vertex_count,
            first_index,
            index_count,
            physical_bounds: quad.physical_bounds,
            scissor: quad.scissor,
            paint: quad.paint.clone(),
            opacity: quad.opacity,
            corner_radius: quad.corner_radius,
            resource_ids: quad.resource_ids.clone(),
            owner_package_id: quad.owner_package_id.clone(),
            required_package_ids: quad.required_package_ids.clone(),
        }
    }
}

impl WgpuNativeRenderSkippedQuad {
    pub(in crate::renderer::backend::wgpu::buffer) fn from_quad(
        quad: &WgpuNativeRenderQuad,
    ) -> Self {
        Self {
            command_id: quad.command_id.clone(),
            reason: skipped_reason_from_quad(quad),
            physical_bounds: quad.physical_bounds,
            resource_ids: skipped_resource_ids_from_quad(quad),
            owner_package_id: quad.owner_package_id.clone(),
            required_package_ids: quad.required_package_ids.clone(),
        }
    }
}

fn skipped_reason_from_quad(quad: &WgpuNativeRenderQuad) -> WgpuNativeRenderSkippedQuadReason {
    if let WgpuNativeRenderPaint::Skipped { reason, .. } = &quad.paint {
        return skipped_reason_from_encoder_reason(*reason);
    }
    if quad.physical_bounds.is_empty() || quad.scissor.map_or(false, WgpuPhysicalRect::is_empty) {
        return WgpuNativeRenderSkippedQuadReason::EmptyBounds;
    }
    if quad.opacity <= 0.0 {
        return WgpuNativeRenderSkippedQuadReason::Transparent;
    }
    if matches!(quad.paint, WgpuNativeRenderPaint::InvalidColor { .. }) {
        return WgpuNativeRenderSkippedQuadReason::InvalidPaint;
    }
    WgpuNativeRenderSkippedQuadReason::NonDrawablePaint
}

fn skipped_reason_from_encoder_reason(
    reason: NativeBackendEncoderSkipReason,
) -> WgpuNativeRenderSkippedQuadReason {
    match reason {
        NativeBackendEncoderSkipReason::MissingResources => {
            WgpuNativeRenderSkippedQuadReason::MissingResources
        }
    }
}

fn skipped_resource_ids_from_quad(quad: &WgpuNativeRenderQuad) -> Vec<ResourceId> {
    match &quad.paint {
        WgpuNativeRenderPaint::Skipped {
            missing_resource_ids,
            ..
        } if !missing_resource_ids.is_empty() => missing_resource_ids.clone(),
        _ => quad.resource_ids.clone(),
    }
}
