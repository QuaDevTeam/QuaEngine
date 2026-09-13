use super::*;

#[test]
fn plans_declarative_ui_asset_requests_for_runtime_package_surfaces() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        DrawCommand::new(
            "ui:menu",
            RenderPlane::Screen,
            DrawCommandKind::UiSurface,
            rect(),
        )
        .resource("surface:ui/menu.qui")
        .owned_by("runtime.ui")
        .require_package("base"),
        DrawCommand::new(
            "ui:menu:style",
            RenderPlane::Screen,
            DrawCommandKind::UiSurface,
            rect(),
        )
        .resource("qss:themes/default.qss.json")
        .owned_by("runtime.ui"),
        DrawCommand::new(
            "ui:menu:tokens",
            RenderPlane::Screen,
            DrawCommandKind::UiSurface,
            rect(),
        )
        .resource("tokens:themes/default.tokens.json")
        .owned_by("runtime.tokens"),
    ]);
    let resources = plan_render_graph_resources(&graph);

    let assets = plan_asset_requests(&resources);

    assert_eq!(assets.requests.len(), 3);
    assert!(assets.skipped_resource_ids.is_empty());

    let surface = assets.request("surface", "ui/menu.qui").unwrap();
    assert_eq!(surface.kind, NativeResourceKind::UiAst);
    assert_eq!(surface.command_ids, set(["ui:menu"]));
    assert_eq!(surface.package_candidates, set(["base", "runtime.ui"]));

    let style = assets.request("qss", "themes/default.qss.json").unwrap();
    assert_eq!(style.kind, NativeResourceKind::QssStyle);
    assert_eq!(style.command_ids, set(["ui:menu:style"]));
    assert_eq!(style.package_candidates, set(["runtime.ui"]));

    let tokens = assets
        .request("tokens", "themes/default.tokens.json")
        .unwrap();
    assert_eq!(tokens.kind, NativeResourceKind::TokenTable);
    assert_eq!(tokens.command_ids, set(["ui:menu:tokens"]));
    assert_eq!(tokens.package_candidates, set(["runtime.tokens"]));
    assert!(is_declarative_asset_kind(surface.kind));
    assert!(is_declarative_asset_kind(style.kind));
    assert!(is_declarative_asset_kind(tokens.kind));
    assert!(!is_declarative_asset_kind(NativeResourceKind::Texture));
}

#[test]
fn plans_font_asset_requests_from_font_face_resources() {
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

    let assets = plan_asset_requests(&resources);
    let request = assets.request("fonts", "Qua Sans").unwrap();

    assert_eq!(assets.requests.len(), 1);
    assert_eq!(request.kind, NativeResourceKind::FontFace);
    assert_eq!(request.command_ids, set(["dialogue:text", "ui:button"]));
    assert_eq!(
        request.package_candidates,
        set(["base", "runtime.fonts", "runtime.ui"])
    );
}
