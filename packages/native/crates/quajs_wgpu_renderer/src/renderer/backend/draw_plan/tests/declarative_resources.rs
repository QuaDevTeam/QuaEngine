use super::fixtures::{frame_from_graph, ledger_with_background_and_surface, test_layout};
use super::*;
use crate::render_graph::{DrawCommand, DrawCommandKind, RenderGraph, RenderPlane};

#[test]
fn keeps_missing_declarative_resources_non_blocking_when_surface_ast_is_ready() {
    let mut graph = RenderGraph::new(test_layout());
    graph.push(
        DrawCommand::new(
            "ui:menu",
            RenderPlane::Screen,
            DrawCommandKind::UiSurface,
            LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 640.0,
                height: 360.0,
            },
        )
        .resources([
            "surface:ui/menu.qui",
            "glyphs:ui/default",
            "qss:ui/menu.qss.json",
            "tokens:ui/theme.tokens.json",
        ])
        .owned_by("runtime.ui")
        .require_package("base"),
    );
    let frame = frame_from_graph(graph);
    let resources = ledger_with_background_and_surface();
    let submission = NativeRenderFrameRef {
        revision: 27,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    let plan = NativeBackendDrawPlan::from_submission_and_resources(&submission, &resources);
    let command = plan
        .commands()
        .find(|command| command.command_id == "ui:menu")
        .unwrap();

    assert_eq!(plan.blocked_command_count, 0);
    assert_eq!(
        command.resource_state,
        NativeBackendDrawCommandResourceState::Ready
    );
    assert_eq!(
        command.resolved_resource_ids,
        vec![ResourceId::from("surface:ui/menu.qui")]
    );
    assert_eq!(
        command.missing_resource_ids,
        vec![
            ResourceId::from("glyphs:ui/default"),
            ResourceId::from("qss:ui/menu.qss.json"),
            ResourceId::from("tokens:ui/theme.tokens.json"),
        ]
    );
    let missing_bindings = command
        .resource_bindings
        .iter()
        .filter(|binding| binding.state == NativeBackendDrawResourceBindingState::Missing)
        .collect::<Vec<_>>();
    assert_eq!(missing_bindings.len(), 3);
    assert!(missing_bindings.iter().all(|binding| matches!(
        binding.kind,
        Some(
            NativeResourceKind::GlyphAtlas
                | NativeResourceKind::QssStyle
                | NativeResourceKind::TokenTable
        )
    )));
    assert!(missing_bindings.iter().all(|binding| {
        binding.owner_package_id.as_deref() == Some("runtime.ui")
            && binding.required_package_ids.contains("base")
    }));
    assert!(plan
        .drawable_commands()
        .any(|command| command.command_id == "ui:menu"));
}
