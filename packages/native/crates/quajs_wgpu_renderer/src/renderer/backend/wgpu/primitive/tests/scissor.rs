use super::*;

#[test]
fn intersects_active_scissors_when_lowering_draws_into_primitives() {
    let plan = WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan(vec![
        WgpuNativeRenderExecutionOperation::SetScissor {
            rect: LogicalRect {
                x: 10.0,
                y: 10.0,
                width: 100.0,
                height: 80.0,
            },
            physical_rect: physical_rect(10, 10, 100, 80),
            depth: 1,
        },
        WgpuNativeRenderExecutionOperation::SetScissor {
            rect: LogicalRect {
                x: 50.0,
                y: 0.0,
                width: 100.0,
                height: 120.0,
            },
            physical_rect: physical_rect(50, 0, 100, 120),
            depth: 2,
        },
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "ui:menu:clipped".to_string(),
            pipeline: DrawBatchPipeline::Shape,
            kind: DrawCommandKind::RoundedRect,
            metadata: draw_metadata(DrawCommandParams::Panel(PanelDrawParams {
                role: "ui-panel".to_string(),
                corner_radius: 0.0,
                fill_color: "#101820".to_string(),
                border: BorderDrawParams::default(),
                padding: EdgeInsetsDrawParam::default(),
                intent: None,
            })),
            physical_bounds: physical_rect(40, 20, 120, 70),
            clip_depth: 2,
            resource_count: 0,
        },
        WgpuNativeRenderExecutionOperation::ClearScissor { depth: 1 },
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "ui:menu:unclipped".to_string(),
            pipeline: DrawBatchPipeline::Shape,
            kind: DrawCommandKind::RoundedRect,
            metadata: draw_metadata(DrawCommandParams::Panel(PanelDrawParams {
                role: "ui-panel".to_string(),
                corner_radius: 0.0,
                fill_color: "#101820".to_string(),
                border: BorderDrawParams::default(),
                padding: EdgeInsetsDrawParam::default(),
                intent: None,
            })),
            physical_bounds: physical_rect(40, 20, 120, 70),
            clip_depth: 0,
            resource_count: 0,
        },
    ]));

    let clipped = &plan.passes[0].primitives[0];
    let unclipped = &plan.passes[0].primitives[1];

    assert_eq!(clipped.scissor, Some(physical_rect(50, 20, 60, 70)));
    assert!(clipped.is_visible());
    assert_eq!(unclipped.scissor, None);
    assert!(unclipped.is_visible());
}

#[test]
fn fully_clipped_scissor_makes_primitive_non_visible() {
    let plan = WgpuNativeRenderPrimitivePlan::from_execution_plan(&execution_plan(vec![
        WgpuNativeRenderExecutionOperation::SetScissor {
            rect: LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 10.0,
                height: 10.0,
            },
            physical_rect: physical_rect(0, 0, 10, 10),
            depth: 1,
        },
        WgpuNativeRenderExecutionOperation::Draw {
            command_id: "ui:menu:outside".to_string(),
            pipeline: DrawBatchPipeline::Shape,
            kind: DrawCommandKind::RoundedRect,
            metadata: draw_metadata(DrawCommandParams::Panel(PanelDrawParams {
                role: "ui-panel".to_string(),
                corner_radius: 0.0,
                fill_color: "#101820".to_string(),
                border: BorderDrawParams::default(),
                padding: EdgeInsetsDrawParam::default(),
                intent: None,
            })),
            physical_bounds: physical_rect(20, 20, 50, 50),
            clip_depth: 1,
            resource_count: 0,
        },
    ]));

    let primitive = &plan.passes[0].primitives[0];

    assert_eq!(plan.primitive_count, 1);
    assert_eq!(plan.visible_primitive_count, 0);
    assert_eq!(primitive.scissor, Some(physical_rect(20, 20, 0, 0)));
    assert!(!primitive.is_visible());
}
