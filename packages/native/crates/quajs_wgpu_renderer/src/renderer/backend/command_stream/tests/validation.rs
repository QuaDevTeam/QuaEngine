use super::*;

#[test]
fn validates_well_formed_command_streams() {
    let command_stream = manual_command_stream(vec![
        NativeBackendCommandStreamCommand::SetPipeline {
            pipeline: DrawBatchPipeline::Ui,
        },
        NativeBackendCommandStreamCommand::SetClip {
            rect: LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 120.0,
                height: 80.0,
            },
            depth: 1,
        },
        NativeBackendCommandStreamCommand::BindResources {
            command_id: "ui:button".to_string(),
            pipeline: DrawBatchPipeline::Ui,
            resources: vec![NativeBackendCommandStreamResource {
                resource_id: ResourceId::from("surface:ui/menu.qui"),
                kind: NativeResourceKind::UiAst,
                memory: ResourceMemory::default(),
                owner_package_id: Some("runtime.ui".to_string()),
                required_package_ids: ["runtime.ui".to_string()].into_iter().collect(),
                label: Some("menu surface".to_string()),
            }],
        },
        NativeBackendCommandStreamCommand::Draw {
            command_id: "ui:button".to_string(),
            pipeline: DrawBatchPipeline::Ui,
            kind: DrawCommandKind::UiSurface,
            metadata: default_metadata(),
            clip_depth: 1,
            resource_count: 1,
        },
        NativeBackendCommandStreamCommand::ClearClip { depth: 1 },
    ]);

    let report = command_stream.validate();

    assert!(report.is_ok());
    assert_eq!(report.error_count, 0);
}

#[test]
fn validates_draws_require_active_pipeline() {
    let command_stream = manual_command_stream(vec![NativeBackendCommandStreamCommand::Draw {
        command_id: "ui:button".to_string(),
        pipeline: DrawBatchPipeline::Ui,
        kind: DrawCommandKind::UiSurface,
        metadata: default_metadata(),
        clip_depth: 0,
        resource_count: 0,
    }]);

    let report = command_stream.validate();

    assert_eq!(report.error_count, 1);
    assert_eq!(
        report.errors[0].kind,
        NativeBackendCommandStreamValidationErrorKind::DrawWithoutPipeline
    );
    assert_eq!(report.errors[0].command_id.as_deref(), Some("ui:button"));
}

#[test]
fn validates_draw_resource_bindings_match_draw_metadata() {
    let command_stream = manual_command_stream(vec![
        NativeBackendCommandStreamCommand::SetPipeline {
            pipeline: DrawBatchPipeline::Ui,
        },
        NativeBackendCommandStreamCommand::BindResources {
            command_id: "ui:button".to_string(),
            pipeline: DrawBatchPipeline::Ui,
            resources: vec![NativeBackendCommandStreamResource {
                resource_id: ResourceId::from("surface:ui/menu.qui"),
                kind: NativeResourceKind::UiAst,
                memory: ResourceMemory::default(),
                owner_package_id: None,
                required_package_ids: Default::default(),
                label: None,
            }],
        },
        NativeBackendCommandStreamCommand::Draw {
            command_id: "ui:button".to_string(),
            pipeline: DrawBatchPipeline::Ui,
            kind: DrawCommandKind::UiSurface,
            metadata: default_metadata(),
            clip_depth: 0,
            resource_count: 2,
        },
        NativeBackendCommandStreamCommand::Draw {
            command_id: "ui:label".to_string(),
            pipeline: DrawBatchPipeline::Ui,
            kind: DrawCommandKind::Text,
            metadata: default_metadata(),
            clip_depth: 0,
            resource_count: 1,
        },
    ]);

    let report = command_stream.validate();

    assert_eq!(
        report
            .errors
            .iter()
            .map(|error| error.kind)
            .collect::<Vec<_>>(),
        vec![
            NativeBackendCommandStreamValidationErrorKind::DrawResourceBindingMismatch,
            NativeBackendCommandStreamValidationErrorKind::DrawResourceCountWithoutBinding,
        ]
    );
}

#[test]
fn validates_clip_stack_balance() {
    let command_stream = manual_command_stream(vec![
        NativeBackendCommandStreamCommand::SetPipeline {
            pipeline: DrawBatchPipeline::Ui,
        },
        NativeBackendCommandStreamCommand::SetClip {
            rect: LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 120.0,
                height: 80.0,
            },
            depth: 2,
        },
        NativeBackendCommandStreamCommand::ClearClip { depth: 1 },
        NativeBackendCommandStreamCommand::SetClip {
            rect: LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 120.0,
                height: 80.0,
            },
            depth: 1,
        },
        NativeBackendCommandStreamCommand::Draw {
            command_id: "ui:button".to_string(),
            pipeline: DrawBatchPipeline::Ui,
            kind: DrawCommandKind::UiSurface,
            metadata: default_metadata(),
            clip_depth: 2,
            resource_count: 0,
        },
        NativeBackendCommandStreamCommand::ClearClip { depth: 2 },
    ]);

    let report = command_stream.validate();

    assert_eq!(
        report
            .errors
            .iter()
            .map(|error| error.kind)
            .collect::<Vec<_>>(),
        vec![
            NativeBackendCommandStreamValidationErrorKind::SetClipDepthMismatch,
            NativeBackendCommandStreamValidationErrorKind::ClearClipDepthMismatch,
            NativeBackendCommandStreamValidationErrorKind::DrawClipDepthExceedsActiveClip,
            NativeBackendCommandStreamValidationErrorKind::ClearClipUnderflow,
            NativeBackendCommandStreamValidationErrorKind::UnclosedClipAtPassEnd,
        ]
    );
}

#[test]
fn validates_resource_binds_are_consumed_by_draws() {
    let command_stream = manual_command_stream(vec![
        NativeBackendCommandStreamCommand::SetPipeline {
            pipeline: DrawBatchPipeline::Ui,
        },
        NativeBackendCommandStreamCommand::BindResources {
            command_id: "ui:button".to_string(),
            pipeline: DrawBatchPipeline::Ui,
            resources: vec![NativeBackendCommandStreamResource {
                resource_id: ResourceId::from("surface:ui/menu.qui"),
                kind: NativeResourceKind::UiAst,
                memory: ResourceMemory::default(),
                owner_package_id: None,
                required_package_ids: Default::default(),
                label: None,
            }],
        },
        NativeBackendCommandStreamCommand::BindResources {
            command_id: "ui:button".to_string(),
            pipeline: DrawBatchPipeline::Ui,
            resources: vec![NativeBackendCommandStreamResource {
                resource_id: ResourceId::from("surface:ui/dialog.qui"),
                kind: NativeResourceKind::UiAst,
                memory: ResourceMemory::default(),
                owner_package_id: None,
                required_package_ids: Default::default(),
                label: None,
            }],
        },
    ]);

    let report = command_stream.validate();

    assert_eq!(
        report
            .errors
            .iter()
            .map(|error| (&error.kind, error.command_id.as_deref()))
            .collect::<Vec<_>>(),
        vec![
            (
                &NativeBackendCommandStreamValidationErrorKind::ResourceBindWithoutDraw,
                Some("ui:button"),
            ),
            (
                &NativeBackendCommandStreamValidationErrorKind::ResourceBindWithoutDraw,
                Some("ui:button"),
            ),
        ]
    );
}
