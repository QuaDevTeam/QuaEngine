use super::{provenance, test_layout};
use crate::projection::ui::{
    build_ui_commands, UiIntentProjection, UiOverlayProjection, UiOverlayRenderMode,
    UiOverlaySurfaceProjection, UiProjection,
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
