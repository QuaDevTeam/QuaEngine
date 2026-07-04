use super::*;

#[test]
fn lowers_encoder_plan_into_command_stream() {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let resources = NativeResourceLedger::new();
    let submission = NativeRenderFrameRef {
        revision: 41,
        frame: &frame,
        resources: &resources,
    }
    .submission();
    let draw_plan = NativeBackendDrawPlan::from_submission(&submission);
    let encoder_plan = NativeBackendEncoderPlan::from_draw_plan(&draw_plan);

    let command_stream = NativeBackendCommandStreamPlan::from_encoder_plan(&encoder_plan);
    let commands = command_stream.commands().collect::<Vec<_>>();

    assert_eq!(command_stream.revision, 41);
    assert_eq!(command_stream.pass_count, encoder_plan.pass_count);
    assert_eq!(command_stream.command_count, commands.len());
    assert_eq!(
        command_stream.draw_command_count,
        encoder_plan.draw_step_count
    );
    assert_eq!(
        command_stream.skipped_draw_command_count,
        encoder_plan.skipped_draw_step_count
    );
    assert!(commands.iter().any(|command| {
        matches!(
            command,
            NativeBackendCommandStreamCommand::SetPipeline {
                pipeline: DrawBatchPipeline::Image
            }
        )
    }));
    assert!(commands.iter().any(|command| {
        matches!(
            command,
            NativeBackendCommandStreamCommand::Draw {
                command_id,
                kind: DrawCommandKind::Text,
                clip_depth: 0,
                ..
            } if command_id == "dialogue:text"
        )
    }));
    assert!(commands.iter().any(|command| {
        matches!(
            command,
            NativeBackendCommandStreamCommand::SkipDraw {
                command_id,
                reason: NativeBackendEncoderSkipReason::MissingResources,
                missing_resource_ids,
                ..
            } if command_id == "background:main"
                && missing_resource_ids == &vec![ResourceId::from("images:bg/school.png")]
        )
    }));
}

#[test]
fn preserves_clip_commands_for_wgpu_scissor_mapping() {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let resources = NativeResourceLedger::new();
    let submission = NativeRenderFrameRef {
        revision: 42,
        frame: &frame,
        resources: &resources,
    }
    .submission();
    let draw_plan = NativeBackendDrawPlan::from_submission(&submission);
    let encoder_plan = NativeBackendEncoderPlan::from_draw_plan(&draw_plan);
    let command_stream = NativeBackendCommandStreamPlan::from_encoder_plan(&encoder_plan);
    let commands = command_stream.commands().collect::<Vec<_>>();
    let scroll_bounds = LogicalRect {
        x: 20.0,
        y: 30.0,
        width: 300.0,
        height: 160.0,
    };

    assert!(commands.iter().any(|command| {
        matches!(
            command,
            NativeBackendCommandStreamCommand::SetClip { rect, depth: 1 }
                if *rect == scroll_bounds
        )
    }));
    assert!(commands.iter().any(|command| {
        matches!(
            command,
            NativeBackendCommandStreamCommand::Draw {
                command_id,
                clip_depth: 1,
                ..
            } if command_id == "ui:menu:inside"
        )
    }));
    assert!(commands.iter().any(|command| {
        matches!(
            command,
            NativeBackendCommandStreamCommand::ClearClip { depth: 1 }
        )
    }));
}

#[test]
fn lowers_structural_clip_children_into_command_stream_scissor() {
    let frame = prepare_native_frame(test_layout(), &view_with_structural_clip_children());
    let resources = NativeResourceLedger::new();
    let submission = NativeRenderFrameRef {
        revision: 44,
        frame: &frame,
        resources: &resources,
    }
    .submission();
    let draw_plan = NativeBackendDrawPlan::from_submission(&submission);
    let encoder_plan = NativeBackendEncoderPlan::from_draw_plan(&draw_plan);
    let command_stream = NativeBackendCommandStreamPlan::from_encoder_plan(&encoder_plan);
    let commands = command_stream.commands().collect::<Vec<_>>();
    let row_bounds = LogicalRect {
        x: 40.0,
        y: 40.0,
        width: 220.0,
        height: 90.0,
    };

    assert!(!commands.iter().any(|command| {
        matches!(
            command,
            NativeBackendCommandStreamCommand::Draw {
                command_id,
                ..
            } if command_id == "ui:menu:row"
        )
    }));
    assert!(commands.iter().any(|command| {
        matches!(
            command,
            NativeBackendCommandStreamCommand::SetClip { rect, depth: 1 }
                if *rect == row_bounds
        )
    }));
    assert!(commands.iter().any(|command| {
        matches!(
            command,
            NativeBackendCommandStreamCommand::Draw {
                command_id,
                clip_depth: 1,
                ..
            } if command_id == "ui:menu:inside"
        )
    }));
    assert!(commands.iter().any(|command| {
        matches!(
            command,
            NativeBackendCommandStreamCommand::ClearClip { depth: 1 }
        )
    }));
}

#[test]
fn emits_resource_bind_commands_before_draws_that_use_resources() {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let resources = ledger_with_background_and_surface();
    let submission = NativeRenderFrameRef {
        revision: 43,
        frame: &frame,
        resources: &resources,
    }
    .submission();
    let draw_plan = NativeBackendDrawPlan::from_submission_and_resources(&submission, &resources);
    let encoder_plan = NativeBackendEncoderPlan::from_draw_plan(&draw_plan);
    let command_stream = NativeBackendCommandStreamPlan::from_encoder_plan(&encoder_plan);
    let commands = command_stream.commands().collect::<Vec<_>>();

    let bind_index = commands
        .iter()
        .position(|command| {
            matches!(
                command,
                NativeBackendCommandStreamCommand::BindResources {
                    command_id,
                    resources,
                    ..
                } if command_id == "background:main"
                    && resources.len() == 1
                    && resources[0].kind == NativeResourceKind::Texture
                    && resources[0].owner_package_id.as_deref() == Some("base")
                    && resources[0].required_package_ids.contains("base")
                    && resources[0].memory.gpu_bytes == 4096
            )
        })
        .expect("expected background resource bind command");
    let draw_index = commands
        .iter()
        .position(|command| {
            matches!(
                command,
                NativeBackendCommandStreamCommand::Draw {
                    command_id,
                    resource_count: 1,
                    ..
                } if command_id == "background:main"
            )
        })
        .expect("expected background draw command");

    assert!(bind_index < draw_index);
}

#[test]
fn preserves_draw_metadata_for_backend_execution() {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let resources = ledger_with_background_and_surface();
    let submission = NativeRenderFrameRef {
        revision: 44,
        frame: &frame,
        resources: &resources,
    }
    .submission();
    let draw_plan = NativeBackendDrawPlan::from_submission_and_resources(&submission, &resources);
    let encoder_plan = NativeBackendEncoderPlan::from_draw_plan(&draw_plan);
    let command_stream = NativeBackendCommandStreamPlan::from_encoder_plan(&encoder_plan);

    let metadata = command_stream
        .commands()
        .find_map(|command| match command {
            NativeBackendCommandStreamCommand::Draw {
                command_id,
                metadata,
                ..
            } if command_id == "ui:menu:inside" => Some(metadata),
            _ => None,
        })
        .expect("expected inside button draw command metadata");

    assert_eq!(
        metadata.bounds,
        LogicalRect {
            x: 24.0,
            y: 44.0,
            width: 220.0,
            height: 56.0,
        }
    );
    assert_eq!(metadata.opacity, 1.0);
    assert!(matches!(metadata.params, DrawCommandParams::UiButton(_)));
    assert_eq!(metadata.owner_package_id.as_deref(), Some("runtime.menu"));
    assert!(metadata.required_package_ids.contains("runtime.ui"));
}
