use super::fixtures::*;
use super::*;
use crate::projection::background::BackgroundProjection;
use crate::projection::common::PackageProvenance;
use crate::projection::view::ViewProjection;
use crate::render_graph::{DrawCommand, DrawCommandKind, LogicalRect, RenderGraph, RenderPlane};

#[test]
fn binds_resolved_resource_records_for_backend_encoding() {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let resources = ledger_with_background_and_surface();
    let submission = NativeRenderFrameRef {
        revision: 24,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    let plan = NativeBackendDrawPlan::from_submission_and_resources(&submission, &resources);
    let commands = plan.commands().collect::<Vec<_>>();
    let background = commands
        .iter()
        .find(|command| command.command_id == "background:main")
        .unwrap();
    let overlay_surface = commands
        .iter()
        .find(|command| command.command_id == "ui:menu")
        .unwrap();

    assert_eq!(plan.blocked_command_count, 0);
    assert_eq!(plan.drawable_command_count, submission.command_count);
    assert_eq!(
        background.resource_state,
        NativeBackendDrawCommandResourceState::Ready
    );
    assert_eq!(
        background.resolved_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(background.resource_bindings.len(), 1);
    let background_binding = &background.resource_bindings[0];
    assert_eq!(
        background_binding.resource_id,
        ResourceId::from("images:bg/school.png")
    );
    assert_eq!(
        background_binding.state,
        NativeBackendDrawResourceBindingState::Resolved
    );
    assert_eq!(background_binding.kind, Some(NativeResourceKind::Texture));
    assert_eq!(background_binding.memory.cpu_bytes, 512);
    assert_eq!(background_binding.memory.gpu_bytes, 4096);
    assert_eq!(background_binding.owner_package_id.as_deref(), Some("base"));
    assert!(background_binding.required_package_ids.contains("base"));
    assert_eq!(
        background_binding.label.as_deref(),
        Some("school background")
    );

    assert_eq!(
        overlay_surface.resolved_resource_ids,
        vec![ResourceId::from("surface:ui/menu.qui")]
    );
    assert_eq!(overlay_surface.resource_bindings.len(), 1);
    let surface_binding = &overlay_surface.resource_bindings[0];
    assert_eq!(
        surface_binding.state,
        NativeBackendDrawResourceBindingState::Resolved
    );
    assert_eq!(surface_binding.kind, Some(NativeResourceKind::UiAst));
    assert_eq!(surface_binding.memory.cpu_bytes, 256);
    assert_eq!(surface_binding.memory.gpu_bytes, 0);
    assert_eq!(
        surface_binding.owner_package_id.as_deref(),
        Some("runtime.ui")
    );
    assert!(surface_binding.required_package_ids.contains("runtime.ui"));
}

#[test]
fn revalidates_resource_bindings_against_the_supplied_ledger() {
    let frame = prepare_native_frame(test_layout(), &view_with_ui_scroll());
    let current_resources = ledger_with_background_and_surface();
    let stale_resources = empty_resource_ledger();
    let submission = NativeRenderFrameRef {
        revision: 25,
        frame: &frame,
        resources: &current_resources,
    }
    .submission();

    assert_eq!(submission.missing_resource_count, 0);

    let plan = NativeBackendDrawPlan::from_submission_and_resources(&submission, &stale_resources);
    let commands = plan.commands().collect::<Vec<_>>();
    let background = commands
        .iter()
        .find(|command| command.command_id == "background:main")
        .unwrap();
    let overlay_surface = commands
        .iter()
        .find(|command| command.command_id == "ui:menu")
        .unwrap();

    assert_eq!(
        background.resource_state,
        NativeBackendDrawCommandResourceState::MissingResources
    );
    assert_eq!(
        background.missing_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(background.resource_bindings.len(), 1);
    assert_eq!(
        background.resource_bindings[0].state,
        NativeBackendDrawResourceBindingState::Missing
    );
    assert!(background.resolved_resource_ids.is_empty());

    assert_eq!(
        overlay_surface.resource_state,
        NativeBackendDrawCommandResourceState::MissingResources
    );
    assert_eq!(
        overlay_surface.missing_resource_ids,
        vec![ResourceId::from("surface:ui/menu.qui")]
    );
    assert_eq!(
        overlay_surface.resource_bindings[0].state,
        NativeBackendDrawResourceBindingState::Missing
    );
    assert_eq!(plan.blocked_command_count, 2);
    assert_eq!(plan.drawable_command_count, submission.command_count - 2);
}

#[test]
fn missing_nonblocking_resources_keep_draw_commands_ready() {
    let mut graph = RenderGraph::new(test_layout());
    graph.push(
        DrawCommand::new(
            "ui:styled-title",
            RenderPlane::Overlay,
            DrawCommandKind::Text,
            LogicalRect {
                x: 32.0,
                y: 48.0,
                width: 480.0,
                height: 72.0,
            },
        )
        .resources([
            "fonts:Missing UI",
            "glyphs:Missing UI",
            "qss:themes/night.qss.json",
            "tokens:night.json",
        ])
        .owned_by("runtime.ui")
        .require_package("base"),
    );
    let frame = frame_from_graph(graph);
    let resources = empty_resource_ledger();
    let submission = NativeRenderFrameRef {
        revision: 27,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    let plan = NativeBackendDrawPlan::from_submission_and_resources(&submission, &resources);
    let command = plan.commands().next().unwrap();

    assert_eq!(plan.blocked_command_count, 0);
    assert_eq!(plan.drawable_command_count, 1);
    assert_eq!(
        command.resource_state,
        NativeBackendDrawCommandResourceState::Ready
    );
    assert!(command.resolved_resource_ids.is_empty());
    assert_eq!(
        command.missing_resource_ids,
        vec![
            ResourceId::from("fonts:Missing UI"),
            ResourceId::from("glyphs:Missing UI"),
            ResourceId::from("qss:themes/night.qss.json"),
            ResourceId::from("tokens:night.json"),
        ]
    );
    assert_eq!(
        command
            .resource_bindings
            .iter()
            .map(|binding| binding.kind)
            .collect::<Vec<_>>(),
        vec![
            Some(NativeResourceKind::FontFace),
            Some(NativeResourceKind::GlyphAtlas),
            Some(NativeResourceKind::QssStyle),
            Some(NativeResourceKind::TokenTable),
        ]
    );
    assert!(command.resource_bindings.iter().all(|binding| {
        binding.state == NativeBackendDrawResourceBindingState::Missing
            && binding.owner_package_id.as_deref() == Some("runtime.ui")
            && binding.required_package_ids.contains("base")
    }));
}

#[test]
fn missing_resource_bindings_preserve_command_package_provenance() {
    let frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
            background: Some(BackgroundProjection {
                asset_name: Some("bg/runtime.png".to_string()),
                provenance: PackageProvenance {
                    content_package_id: Some("runtime.background".to_string()),
                    required_runtime_packages: ["base"]
                        .into_iter()
                        .map(ToString::to_string)
                        .collect(),
                },
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    let resources = empty_resource_ledger();
    let submission = NativeRenderFrameRef {
        revision: 26,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    let plan = NativeBackendDrawPlan::from_submission_and_resources(&submission, &resources);
    let background = plan
        .commands()
        .find(|command| command.command_id == "background:main")
        .unwrap();

    assert_eq!(
        background.resource_state,
        NativeBackendDrawCommandResourceState::MissingResources
    );
    assert_eq!(
        background.missing_resource_ids,
        vec![ResourceId::from("images:bg/runtime.png")]
    );
    assert_eq!(background.resource_bindings.len(), 1);

    let binding = &background.resource_bindings[0];
    assert_eq!(
        binding.state,
        NativeBackendDrawResourceBindingState::Missing
    );
    assert_eq!(
        binding.resource_id,
        ResourceId::from("images:bg/runtime.png")
    );
    assert_eq!(
        binding.owner_package_id.as_deref(),
        Some("runtime.background")
    );
    assert!(binding.required_package_ids.contains("base"));
}
