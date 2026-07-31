use super::*;

#[test]
fn plans_texture_upload_requests_from_texture_assets() {
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

    let texture_uploads = plan_texture_upload_requests(&assets);

    assert_eq!(texture_uploads.requests.len(), 2);
    assert!(texture_uploads.skipped_resource_ids.is_empty());
    assert!(texture_uploads.non_texture_resource_ids.is_empty());

    let background = texture_uploads.request("images", "bg/school.png").unwrap();
    assert_eq!(
        background.resource_id,
        ResourceId::from("images:bg/school.png")
    );
    assert_eq!(background.command_ids, set(["background:main"]));
    assert_eq!(background.owner_package_ids, set(["base"]));
    assert!(background.required_package_ids.is_empty());
    assert_eq!(background.package_candidates, set(["base"]));

    let character = texture_uploads
        .request("characters", "yuki/default.png")
        .unwrap();
    assert_eq!(
        character.resource_id,
        ResourceId::from("characters:yuki/default.png")
    );
    assert_eq!(character.command_ids, set(["character:yuki"]));
    assert_eq!(character.owner_package_ids, set(["runtime.sprite"]));
    assert_eq!(character.required_package_ids, set(["base"]));
    assert_eq!(
        character.package_candidates,
        set(["base", "runtime.sprite"])
    );
}

#[test]
fn plans_texture_upload_sync_against_resident_resources() {
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
    let texture_uploads = plan_texture_upload_requests(&assets);

    let sync = plan_texture_upload_sync(
        &texture_uploads,
        ["images:bg/school.png", "images:stale.png"],
    );

    assert_eq!(sync.pending_requests.len(), 1);
    assert_eq!(
        sync.pending_request("characters", "yuki/default.png")
            .unwrap()
            .resource_id,
        ResourceId::from("characters:yuki/default.png")
    );
    assert_eq!(
        sync.resident_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(
        sync.orphaned_resident_resource_ids,
        vec![ResourceId::from("images:stale.png")]
    );
    assert!(sync.skipped_resource_ids.is_empty());
    assert!(sync.non_texture_resource_ids.is_empty());
}

#[test]
fn keeps_resident_non_texture_gpu_resources_referenced_by_frame() {
    let texture_uploads = NativeTextureUploadRequestPlan {
        requests: vec![NativeTextureUploadRequest {
            resource_id: ResourceId::from("images:bg/school.png"),
            asset_type: "images".to_string(),
            asset_name: "bg/school.png".to_string(),
            command_ids: set(["background:main"]),
            owner_package_ids: set(["base"]),
            required_package_ids: BTreeSet::new(),
            package_candidates: set(["base"]),
        }],
        non_texture_resource_ids: vec![ResourceId::from(
            "video:texture-ring:video:video/opening.webm",
        )],
        ..Default::default()
    };

    let sync = plan_texture_upload_sync(
        &texture_uploads,
        [
            "images:bg/school.png",
            "video:texture-ring:video:video/opening.webm",
            "images:stale.png",
        ],
    );

    assert_eq!(
        sync.resident_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(
        sync.orphaned_resident_resource_ids,
        vec![ResourceId::from("images:stale.png")]
    );
    assert_eq!(
        sync.non_texture_resource_ids,
        vec![ResourceId::from(
            "video:texture-ring:video:video/opening.webm"
        )]
    );
}

#[test]
fn keeps_renderer_managed_font_and_video_textures_when_frame_does_not_reference_them() {
    let texture_uploads = NativeTextureUploadRequestPlan {
        requests: vec![NativeTextureUploadRequest {
            resource_id: ResourceId::from("images:bg/school.png"),
            asset_type: "images".to_string(),
            asset_name: "bg/school.png".to_string(),
            command_ids: set(["background:main"]),
            owner_package_ids: set(["base"]),
            required_package_ids: BTreeSet::new(),
            package_candidates: set(["base"]),
        }],
        ..Default::default()
    };

    let sync = plan_texture_upload_sync(
        &texture_uploads,
        [
            "images:bg/school.png",
            "fonts:Noto Sans",
            "video:texture-ring:video:video/opening.webm",
            "images:stale.png",
        ],
    );

    assert_eq!(
        sync.orphaned_resident_resource_ids,
        vec![ResourceId::from("images:stale.png")]
    );
}

#[test]
fn excludes_non_texture_assets_from_texture_upload_requests() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        image_command("layer:image", "images:shared.png")
            .owned_by("runtime.image")
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
            "dialogue:text",
            RenderPlane::Safe,
            DrawCommandKind::Text,
            rect(),
        )
        .resource("fonts:Qua Sans")
        .owned_by("runtime.fonts"),
    ]);
    let resources = plan_render_graph_resources(&graph);
    let assets = plan_asset_requests(&resources);

    let texture_uploads = plan_texture_upload_requests(&assets);

    assert_eq!(texture_uploads.requests.len(), 1);
    assert_eq!(
        texture_uploads
            .request("images", "shared.png")
            .unwrap()
            .resource_id,
        ResourceId::from("images:shared.png")
    );
    assert_eq!(
        texture_uploads.non_texture_resource_ids,
        vec![
            ResourceId::from("fonts:Qua Sans"),
            ResourceId::from("qss:themes/default.qss.json"),
        ]
    );
}

#[test]
fn carries_skipped_asset_resource_ids_into_texture_upload_plan() {
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

    let texture_uploads = plan_texture_upload_requests(&assets);

    assert!(texture_uploads.requests.is_empty());
    assert_eq!(
        texture_uploads.skipped_resource_ids,
        vec![
            ResourceId::from("images:"),
            ResourceId::from("movie-source")
        ]
    );
}
