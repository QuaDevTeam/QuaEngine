use super::{provenance, rect, test_layout};
use crate::projection::ui::{
    build_ui_commands, UiIntentProjection, UiOverlayProjection, UiOverlayRenderMode,
    UiOverlaySceneProjection, UiOverlaySceneShellProjection, UiOverlaySurfaceProjection,
    UiProjection, UiSurfaceNodeKind, UiSurfaceNodeProjection,
};
use crate::render_graph::{DrawCommandKind, DrawCommandParams, RenderPlane};
use crate::resources::ResourceId;

#[test]
fn builds_interactive_ui_overlay_surface_command() {
    let layout = test_layout();
    let ui = UiProjection {
        provenance: provenance("runtime.ui", ["base"]),
        overlays: vec![UiOverlayProjection {
            surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui")),
            intent: Some(UiIntentProjection::new("open-settings")),
            provenance: provenance("runtime.menu", ["runtime.ui"]),
            ..UiOverlayProjection::new("menu")
        }],
        ..Default::default()
    };

    let commands = build_ui_commands(&layout, &ui);

    assert_eq!(commands.len(), 1);
    let command = &commands[0];
    assert_eq!(command.id, "ui:menu");
    assert_eq!(command.kind, DrawCommandKind::UiSurface);
    assert_eq!(command.plane, RenderPlane::Screen);
    assert_eq!(command.z_index, 100_000_000);
    assert!(command.interactive);
    assert_eq!(
        command.resource_ids,
        vec![ResourceId::from("surface:ui/menu.qui")]
    );
    assert_eq!(command.owner_package_id.as_deref(), Some("runtime.menu"));
    assert!(command.required_package_ids.contains("base"));
    assert!(command.required_package_ids.contains("runtime.ui"));

    match &command.params {
        DrawCommandParams::UiSurface(params) => {
            assert_eq!(params.element_id, "menu");
            assert_eq!(params.surface_key.as_deref(), Some("ui/menu.qui"));
            assert_eq!(params.render_mode, "ui");
            assert_eq!(params.overlay_stack, "overlay");
            assert!(params.interactive);
            let intent = params.intent.as_ref().unwrap();
            assert_eq!(intent.event, "ui/intent");
            assert_eq!(intent.element_id.as_deref(), Some("menu"));
            assert_eq!(intent.action.as_deref(), Some("open-settings"));
            assert!(intent.choice_id.is_none());
        }
        _ => panic!("expected ui surface params"),
    }
}

#[test]
fn skips_unsafe_overlay_package_provenance_on_direct_projection() {
    let layout = test_layout();
    let ui = UiProjection {
        provenance: provenance("runtime.ui", ["base", "bad/required"]),
        overlays: vec![UiOverlayProjection {
            surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui")),
            provenance: provenance("runtime/menu", ["runtime.ui", "bad#hash"]),
            ..UiOverlayProjection::new("menu")
        }],
        ..Default::default()
    };

    let commands = build_ui_commands(&layout, &ui);
    let command = &commands[0];

    assert_eq!(command.owner_package_id.as_deref(), Some("runtime.ui"));
    assert!(command.required_package_ids.contains("base"));
    assert!(command.required_package_ids.contains("runtime.ui"));
    assert!(!command.required_package_ids.contains("bad/required"));
    assert!(!command.required_package_ids.contains("bad#hash"));
    assert!(!command.required_package_ids.contains("runtime/menu"));
}

#[test]
fn skips_overlays_with_unsafe_element_ids_on_direct_projection() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![
        UiOverlayProjection::new("https://example.test/menu").with_surface("ui/url.qui"),
        UiOverlayProjection::new("native:menu").with_surface("ui/native.qui"),
        UiOverlayProjection::new("bad/menu").with_surface("ui/path.qui"),
        UiOverlayProjection::new("plugin.dll").with_surface("ui/payload.qui"),
        UiOverlayProjection::new("menu:ok").with_surface("ui/menu.qui"),
    ]);

    let commands = build_ui_commands(&layout, &ui);

    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].id, "ui:menu:ok");
    match &commands[0].params {
        DrawCommandParams::UiSurface(params) => {
            assert_eq!(params.element_id, "menu:ok");
            assert_eq!(params.surface_key.as_deref(), Some("ui/menu.qui"));
        }
        _ => panic!("expected ui surface params"),
    }
}

#[test]
fn skips_duplicate_overlay_element_ids_on_direct_projection() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![
        UiOverlayProjection::new("menu").with_surface("ui/menu-first.qui"),
        UiOverlayProjection::new("menu").with_surface("ui/menu-second.qui"),
        UiOverlayProjection::new("confirm").with_surface("ui/confirm.qui"),
    ]);

    let commands = build_ui_commands(&layout, &ui);
    let ids = commands
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(ids, vec!["ui:menu", "ui:confirm"]);
    match &commands[0].params {
        DrawCommandParams::UiSurface(params) => {
            assert_eq!(params.surface_key.as_deref(), Some("ui/menu-first.qui"));
        }
        _ => panic!("expected ui surface params"),
    }
}

#[test]
fn drops_unsafe_overlay_surface_keys_and_intents_on_direct_projection() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(UiOverlaySurfaceProjection::new("../ui/menu.qui")),
        intent: Some(UiIntentProjection::new("native:open")),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);

    assert_eq!(commands.len(), 1);
    assert!(commands[0].resource_ids.is_empty());
    match &commands[0].params {
        DrawCommandParams::UiSurface(params) => {
            assert!(params.surface_key.is_none());
            assert!(params.intent.is_none());
        }
        _ => panic!("expected ui surface params"),
    }
}

#[test]
fn sorts_visible_overlays_by_stack_and_skips_hidden_entries() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![
        UiOverlayProjection {
            visible: false,
            ..UiOverlayProjection::new("hidden")
        },
        UiOverlayProjection::new("confirm").with_surface("ui/confirm.qui"),
        UiOverlayProjection::new("menu").with_surface("ui/menu.qui"),
    ]);

    let commands = build_ui_commands(&layout, &ui);
    let ids = commands
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(ids, vec!["ui:menu", "ui:confirm"]);
    assert!(commands[0].z_index < commands[1].z_index);
    match &commands[1].params {
        DrawCommandParams::UiSurface(params) => {
            assert_eq!(params.overlay_stack, "modal");
        }
        _ => panic!("expected ui surface params"),
    }
}

#[test]
fn render_only_overlays_default_to_non_interactive_surfaces() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        render_mode: UiOverlayRenderMode::RenderOnly,
        surface: Some(UiOverlaySurfaceProjection::new("fx/rain")),
        ..UiOverlayProjection::new("rain")
    }]);

    let commands = build_ui_commands(&layout, &ui);

    assert_eq!(commands.len(), 1);
    assert!(!commands[0].interactive);
    match &commands[0].params {
        DrawCommandParams::UiSurface(params) => {
            assert_eq!(params.render_mode, "render-only");
            assert!(!params.interactive);
            assert!(params.intent.is_none());
        }
        _ => panic!("expected ui surface params"),
    }
}

#[test]
fn render_only_ui_scene_uses_scene_surface_shell_placement_and_interactivity() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        interactive: Some(false),
        surface: Some(UiOverlaySurfaceProjection::new("ui/fallback-overlay.qui")),
        scene: Some(UiOverlaySceneProjection {
            render_mode: UiOverlayRenderMode::RenderOnly,
            interactive: Some(true),
            surface: Some(
                UiOverlaySurfaceProjection::new("ui/settings-scene.qui").with_root(
                    UiSurfaceNodeProjection::new(
                        "close",
                        UiSurfaceNodeKind::Button,
                        rect(320.0, 240.0, 160.0, 56.0),
                    )
                    .with_text("Close")
                    .with_intent(UiIntentProjection::new("close")),
                ),
            ),
            overlay: Some(UiOverlaySceneShellProjection {
                overlay_stack: Some("modal".to_string()),
                stack_priority: Some(220),
                z_index: Some(7),
            }),
            ..UiOverlaySceneProjection::new("settings-scene")
        }),
        ..UiOverlayProjection::new("host")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let ids = commands
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(ids, vec!["ui:host", "ui:host:close"]);
    assert_eq!(commands[0].z_index, 220_000_007);
    assert!(commands[0].interactive);
    assert_eq!(
        commands[0].resource_ids,
        vec![ResourceId::from("surface:ui/settings-scene.qui")]
    );

    match &commands[0].params {
        DrawCommandParams::UiSurface(params) => {
            assert_eq!(params.element_id, "host");
            assert_eq!(params.surface_key.as_deref(), Some("ui/settings-scene.qui"));
            assert_eq!(params.render_mode, "render-only");
            assert_eq!(params.overlay_stack, "modal");
            assert!(params.interactive);
            assert!(params.intent.is_none());
        }
        _ => panic!("expected ui surface params"),
    }

    assert!(commands[1].interactive);
    match &commands[1].params {
        DrawCommandParams::UiButton(params) => {
            let intent = params.intent.as_ref().unwrap();
            assert_eq!(intent.event, "ui/intent");
            assert_eq!(intent.element_id.as_deref(), Some("host:close"));
            assert_eq!(intent.action.as_deref(), Some("close"));
        }
        _ => panic!("expected ui button params"),
    }
}

#[test]
fn paints_overlay_stack_panels_above_hud_stack_app_shell() {
    // A product app shell is the base plate: it declares the `hud` stack so
    // plugin panels (`overlay` stack) always paint, and therefore hit-test,
    // above it. Regression guard for the shell's opaque title background
    // covering the settings/gallery panel.
    let layout = test_layout();
    let ui = UiProjection {
        overlays: vec![
            UiOverlayProjection {
                surface: Some(UiOverlaySurfaceProjection::new("demo/native-app.qui")),
                overlay_stack: Some("hud".to_string()),
                z_index: Some(10),
                ..UiOverlayProjection::new("native-app-shell")
            },
            UiOverlayProjection {
                surface: Some(UiOverlaySurfaceProjection::new("plugin-settings/native")),
                overlay_stack: Some("overlay".to_string()),
                z_index: Some(60),
                ..UiOverlayProjection::new("settings")
            },
        ],
        ..Default::default()
    };

    let commands = build_ui_commands(&layout, &ui);

    let shell = commands
        .iter()
        .position(|command| command.id == "ui:native-app-shell")
        .expect("app shell command");
    let settings = commands
        .iter()
        .position(|command| command.id == "ui:settings")
        .expect("settings command");

    assert!(shell < settings, "app shell must paint before the panel");
    assert_eq!(commands[shell].z_index, 10);
    assert_eq!(commands[settings].z_index, 100_000_060);
    assert!(commands[settings].z_index > commands[shell].z_index);
}
