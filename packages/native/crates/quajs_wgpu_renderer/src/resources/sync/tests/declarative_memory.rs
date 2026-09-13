use super::support::{provenance, rect, test_layout};
use super::*;

#[test]
fn estimates_frame_managed_ui_ast_memory_for_runtime_package_metrics() {
    let graph = build_view_render_graph(
        test_layout(),
        &ViewProjection {
            ui: Some(UiProjection {
                provenance: provenance("runtime.ui", ["base"]),
                overlays: vec![UiOverlayProjection {
                    surface: Some(
                        UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                            UiSurfaceNodeProjection::new(
                                "title",
                                UiSurfaceNodeKind::Text,
                                crate::projection::ui::UiSurfaceNodeRect {
                                    x: 40.0,
                                    y: 48.0,
                                    width: 240.0,
                                    height: 44.0,
                                },
                            )
                            .with_text("Menu"),
                        ),
                    ),
                    ..UiOverlayProjection::new("menu")
                }],
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    let resources = plan_render_graph_resources(&graph);
    let sync = plan_frame_resource_sync(&NativeResourceLedger::new(), &resources);
    let ui_ast = sync
        .upsert
        .iter()
        .find(|record| record.id == ResourceId::from("surface:ui/menu.qui"))
        .unwrap();

    assert_eq!(ui_ast.kind, NativeResourceKind::UiAst);
    assert_eq!(ui_ast.owner_package_id.as_deref(), Some("runtime.ui"));
    assert!(ui_ast.required_package_ids.contains("base"));
    assert_eq!(ui_ast.memory.cpu_bytes, 1126);
    assert_eq!(ui_ast.memory.gpu_bytes, 0);
    assert_eq!(ui_ast.label.as_deref(), Some("ui ast surface:ui/menu.qui"));
}

#[test]
fn retains_existing_ui_ast_memory_when_host_has_reported_real_size() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([DrawCommand::new(
        "ui:menu",
        RenderPlane::Screen,
        DrawCommandKind::UiSurface,
        rect(),
    )
    .resource("surface:ui/menu.qui")
    .owned_by("runtime.ui")]);
    let resources = plan_render_graph_resources(&graph);
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new("surface:ui/menu.qui", NativeResourceKind::UiAst)
            .owned_by("runtime.ui")
            .memory(4096, 0)
            .label("compiled ui menu"),
    );

    let sync = plan_frame_resource_sync(&ledger, &resources);

    assert!(sync.upsert.is_empty());
    assert_eq!(sync.retain, vec![ResourceId::from("surface:ui/menu.qui")]);
}
