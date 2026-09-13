use std::collections::BTreeSet;

use super::*;
use crate::render_graph::{
    DrawBatchPipeline, DrawCommandKind, DrawCommandParams, LogicalRect, RenderPlane, RenderViewport,
};
use crate::renderer::backend::{
    NativeBackendCommandStreamCommand, NativeBackendCommandStreamPass,
    NativeBackendCommandStreamPlan, NativeBackendDrawCommandMetadata,
    NativeBackendEncoderSkipReason,
};
use crate::resources::ResourceId;

#[test]
fn command_stream_skip_draws_preserve_physical_bounds() {
    let plan = NativeBackendCommandStreamPlan {
        revision: 42,
        pass_count: 1,
        command_count: 1,
        draw_command_count: 0,
        skipped_draw_command_count: 1,
        passes: vec![NativeBackendCommandStreamPass {
            pass_index: 0,
            plane: RenderPlane::Overlay,
            viewport: viewport(),
            command_count: 1,
            draw_command_count: 0,
            skipped_draw_command_count: 1,
            commands: vec![NativeBackendCommandStreamCommand::SkipDraw {
                command_id: "ui:menu:missing-bg".to_string(),
                pipeline: DrawBatchPipeline::Shape,
                kind: DrawCommandKind::RoundedRect,
                metadata: metadata(),
                reason: NativeBackendEncoderSkipReason::MissingResources,
                missing_resource_ids: vec![ResourceId::from("images:ui/menu-bg.png")],
            }],
        }],
    };

    let execution_plan = WgpuNativeRenderExecutionPlan::from_command_stream_plan(&plan);

    assert_eq!(execution_plan.revision, 42);
    assert_eq!(execution_plan.operation_count, 1);
    assert_eq!(execution_plan.draw_operation_count, 0);
    assert_eq!(execution_plan.skipped_draw_operation_count, 1);
    let operation = &execution_plan.passes[0].operations[0];
    let WgpuNativeRenderExecutionOperation::SkipDraw {
        command_id,
        pipeline,
        kind,
        metadata,
        physical_bounds,
        reason,
        missing_resource_ids,
    } = operation
    else {
        panic!("expected skip draw operation");
    };

    assert_eq!(command_id, "ui:menu:missing-bg");
    assert_eq!(*pipeline, DrawBatchPipeline::Shape);
    assert_eq!(*kind, DrawCommandKind::RoundedRect);
    assert_eq!(*reason, NativeBackendEncoderSkipReason::MissingResources);
    assert_eq!(
        missing_resource_ids,
        &[ResourceId::from("images:ui/menu-bg.png")]
    );
    assert_eq!(
        metadata.bounds,
        LogicalRect {
            x: 5.0,
            y: 10.0,
            width: 20.0,
            height: 15.0,
        }
    );
    assert_eq!(
        *physical_bounds,
        WgpuPhysicalRect {
            x: 40,
            y: 80,
            width: 80,
            height: 60,
        }
    );
}

fn metadata() -> NativeBackendDrawCommandMetadata {
    NativeBackendDrawCommandMetadata {
        bounds: LogicalRect {
            x: 5.0,
            y: 10.0,
            width: 20.0,
            height: 15.0,
        },
        opacity: 1.0,
        params: DrawCommandParams::None,
        owner_package_id: Some("runtime.menu".to_string()),
        required_package_ids: BTreeSet::from(["runtime.ui".to_string()]),
    }
}

fn viewport() -> RenderViewport {
    RenderViewport {
        logical_width: 100.0,
        logical_height: 50.0,
        viewport_x: 10.0,
        viewport_y: 20.0,
        viewport_width: 200.0,
        viewport_height: 100.0,
        physical_viewport_width: 400.0,
        physical_viewport_height: 200.0,
        scale: 2.0,
        physical_scale: 4.0,
        device_pixel_ratio: 2.0,
    }
}
