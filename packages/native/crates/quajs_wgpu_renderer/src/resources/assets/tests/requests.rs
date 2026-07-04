use super::*;

#[test]
fn plans_asset_requests_from_render_resources() {
    let graph = build_view_render_graph(
        test_layout(),
        &ViewProjection {
            background: Some(BackgroundProjection {
                asset_name: Some("bg/school.png".to_string()),
                provenance: provenance("base", []),
                ..Default::default()
            }),
            characters: vec![CharacterProjection {
                sprite: Some("yuki/default.png".to_string()),
                provenance: provenance("runtime.sprite", ["base"]),
                ..CharacterProjection::new("yuki", "Yuki")
            }],
            ..Default::default()
        },
    );
    let resources = plan_render_graph_resources(&graph);

    let assets = plan_asset_requests(&resources);

    assert_eq!(assets.requests.len(), 2);
    assert!(assets.skipped_resource_ids.is_empty());

    let background = assets.request("images", "bg/school.png").unwrap();
    assert_eq!(background.kind, NativeResourceKind::Texture);
    assert_eq!(background.command_ids, set(["background:main"]));
    assert_eq!(background.owner_package_ids, set(["base"]));
    assert!(background.required_package_ids.is_empty());
    assert_eq!(background.package_candidates, set(["base"]));

    let character = assets.request("characters", "yuki/default.png").unwrap();
    assert_eq!(character.kind, NativeResourceKind::Texture);
    assert_eq!(character.command_ids, set(["character:yuki"]));
    assert_eq!(character.owner_package_ids, set(["runtime.sprite"]));
    assert_eq!(character.required_package_ids, set(["base"]));
    assert_eq!(
        character.package_candidates,
        set(["base", "runtime.sprite"])
    );
}

#[test]
fn requests_video_fallback_poster_asset_without_decoder_asset() {
    let graph = build_view_render_graph(
        test_layout(),
        &ViewProjection {
            background: Some(BackgroundProjection {
                mode: BackgroundMode::Video,
                video: Some(BackgroundVideoProjection {
                    poster: Some("poster/opening.png".to_string()),
                    provenance: provenance("runtime.video", ["base"]),
                    ..BackgroundVideoProjection::new("opening.mp4")
                }),
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    let resources = plan_render_graph_resources(&graph);

    let assets = plan_asset_requests(&resources);

    assert!(assets.request("video", "opening.mp4").is_none());
    assert_eq!(
        assets.request("images", "poster/opening.png").unwrap().kind,
        NativeResourceKind::Texture
    );
}

#[test]
fn skips_unparseable_resource_ids() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        DrawCommand::new(
            "movie",
            RenderPlane::Scene,
            DrawCommandKind::VideoFrame,
            rect(),
        )
        .resource("movie-source"),
        DrawCommand::new("empty", RenderPlane::Scene, DrawCommandKind::Image, rect())
            .resource("images:"),
    ]);
    let resources = plan_render_graph_resources(&graph);

    let assets = plan_asset_requests(&resources);

    assert!(assets.requests.is_empty());
    assert_eq!(
        assets.skipped_resource_ids,
        vec![
            ResourceId::from("images:"),
            ResourceId::from("movie-source")
        ]
    );
}

#[test]
fn merges_same_asset_request_from_multiple_commands() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        image_command("layer:a", "images:shared.png")
            .owned_by("runtime.a")
            .require_package("base"),
        image_command("layer:b", "images:shared.png")
            .owned_by("runtime.b")
            .require_package("runtime.a"),
    ]);
    let resources = plan_render_graph_resources(&graph);

    let assets = plan_asset_requests(&resources);
    let request = assets.request("images", "shared.png").unwrap();

    assert_eq!(assets.requests.len(), 1);
    assert_eq!(request.command_ids, set(["layer:a", "layer:b"]));
    assert_eq!(
        request.package_candidates,
        set(["base", "runtime.a", "runtime.b"])
    );
}
