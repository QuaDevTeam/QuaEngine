use std::collections::BTreeSet;

use super::*;
use crate::render_graph::{
    BorderDrawParams, CharacterAnchor, CharacterDrawParams, DrawBatchPipeline, DrawCommandKind,
    DrawCommandParams, EdgeInsetsDrawParam, FontStyleDrawParam, ImageDrawParams, LogicalRect,
    MediaFit, MediaOrigin, PanelDrawParams, RenderPlane, RenderViewport, ShadowDrawParams,
    ShadowDrawStyle, TextAlign, TextDecorationDrawParam, TextDrawParams, TextOverflowDrawParam,
    TextTransformDrawParam, UiButtonDrawParams, UiSurfaceDrawParams, VideoDrawParams,
    WhiteSpaceDrawParam,
};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderDrawMetadata, WgpuNativeRenderExecutionOperation,
    WgpuNativeRenderExecutionPass, WgpuNativeRenderExecutionPlan,
    WgpuNativeRenderOperationBoundResource, WgpuPhysicalRect,
};
use crate::renderer::backend::{
    NativeBackendCommandStreamValidationReport, NativeBackendEncoderSkipReason,
};
use crate::resources::{NativeResourceKind, ResourceId, ResourceMemory};

mod basic;
mod media;
mod scissor;
mod skip;
mod ui;

fn execution_plan(
    operations: Vec<WgpuNativeRenderExecutionOperation>,
) -> WgpuNativeRenderExecutionPlan {
    execution_plan_with_physical_scale(operations, 1.0)
}

fn execution_plan_with_physical_scale(
    operations: Vec<WgpuNativeRenderExecutionOperation>,
    physical_scale: f64,
) -> WgpuNativeRenderExecutionPlan {
    let operation_count = operations.len();
    let draw_operation_count = operations
        .iter()
        .filter(|operation| matches!(operation, WgpuNativeRenderExecutionOperation::Draw { .. }))
        .count();
    let skipped_draw_operation_count = operations
        .iter()
        .filter(|operation| {
            matches!(
                operation,
                WgpuNativeRenderExecutionOperation::SkipDraw { .. }
            )
        })
        .count();

    WgpuNativeRenderExecutionPlan {
        revision: 77,
        pass_count: 1,
        operation_count,
        draw_operation_count,
        skipped_draw_operation_count,
        resource_bind_operation_count: 0,
        validation: NativeBackendCommandStreamValidationReport::default(),
        passes: vec![WgpuNativeRenderExecutionPass {
            pass_index: 0,
            plane: RenderPlane::Overlay,
            viewport: RenderViewport {
                physical_scale,
                ..viewport()
            },
            physical_viewport: physical_rect(0, 0, 1280, 720),
            operation_count,
            draw_operation_count,
            skipped_draw_operation_count,
            resource_bind_operation_count: 0,
            operations,
        }],
    }
}

fn bound_texture(resource_id: &str) -> WgpuNativeRenderOperationBoundResource {
    WgpuNativeRenderOperationBoundResource {
        resource_id: ResourceId::from(resource_id),
        kind: NativeResourceKind::Texture,
        memory: ResourceMemory::default(),
        owner_package_id: None,
        required_package_ids: Vec::new(),
        label: None,
    }
}

fn draw_metadata(params: DrawCommandParams) -> WgpuNativeRenderDrawMetadata {
    WgpuNativeRenderDrawMetadata {
        bounds: LogicalRect {
            x: 10.0,
            y: 20.0,
            width: 120.0,
            height: 36.0,
        },
        opacity: 1.0,
        params,
        owner_package_id: Some("runtime.menu".to_string()),
        required_package_ids: BTreeSet::from(["runtime.ui".to_string()]),
    }
}

fn physical_rect(x: u32, y: u32, width: u32, height: u32) -> WgpuPhysicalRect {
    WgpuPhysicalRect {
        x,
        y,
        width,
        height,
    }
}

fn viewport() -> RenderViewport {
    RenderViewport {
        logical_width: 1280.0,
        logical_height: 720.0,
        viewport_x: 0.0,
        viewport_y: 0.0,
        viewport_width: 1280.0,
        viewport_height: 720.0,
        physical_viewport_width: 1280.0,
        physical_viewport_height: 720.0,
        scale: 1.0,
        physical_scale: 1.0,
        device_pixel_ratio: 1.0,
    }
}
