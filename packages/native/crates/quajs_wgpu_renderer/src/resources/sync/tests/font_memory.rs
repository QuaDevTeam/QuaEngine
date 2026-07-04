use super::support::{rect, set, test_layout};
use super::*;

#[test]
fn estimates_font_face_memory_for_text_resources() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        DrawCommand::new(
            "dialogue:text",
            RenderPlane::Safe,
            DrawCommandKind::Text,
            rect(),
        )
        .resource("fonts:Qua Sans")
        .owned_by("runtime.fonts")
        .require_package("base"),
        DrawCommand::new(
            "ui:button",
            RenderPlane::Screen,
            DrawCommandKind::UiSurface,
            rect(),
        )
        .resource("fonts:Qua Sans")
        .owned_by("runtime.ui"),
    ]);
    let resources = plan_render_graph_resources(&graph);
    let sync = plan_frame_resource_sync(&NativeResourceLedger::new(), &resources);
    let font_face = sync
        .upsert
        .iter()
        .find(|record| record.id == ResourceId::from("fonts:Qua Sans"))
        .unwrap();

    assert_eq!(font_face.kind, NativeResourceKind::FontFace);
    assert_eq!(font_face.owner_package_id, None);
    assert_eq!(
        font_face.required_package_ids,
        set(["base", "runtime.fonts", "runtime.ui"])
    );
    assert_eq!(font_face.memory.cpu_bytes, 924);
    assert_eq!(font_face.memory.gpu_bytes, 0);
    assert_eq!(font_face.label.as_deref(), Some("font face fonts:Qua Sans"));
}

#[test]
fn retains_existing_font_face_memory_when_host_has_reported_real_size() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([DrawCommand::new(
        "dialogue:text",
        RenderPlane::Safe,
        DrawCommandKind::Text,
        rect(),
    )
    .resource("fonts:Qua Sans")
    .owned_by("runtime.fonts")]);
    let resources = plan_render_graph_resources(&graph);
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new("fonts:Qua Sans", NativeResourceKind::FontFace)
            .owned_by("runtime.fonts")
            .memory(12_288, 0)
            .label("host font face Qua Sans"),
    );

    let sync = plan_frame_resource_sync(&ledger, &resources);

    assert!(sync.upsert.is_empty());
    assert_eq!(sync.retain, vec![ResourceId::from("fonts:Qua Sans")]);
}
