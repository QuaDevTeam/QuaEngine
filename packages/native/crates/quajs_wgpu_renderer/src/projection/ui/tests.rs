use std::collections::BTreeSet;

use super::*;
use crate::projection::common::PackageProvenance;
use crate::render_graph::{DrawCommandKind, DrawCommandParams, RenderGraph, RenderPlane};
use crate::resources::ResourceId;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

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
fn appends_ui_commands_to_graph() {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![
            UiOverlayProjection::new("menu").with_surface("ui/menu.qui")
        ]),
    );

    assert_eq!(graph.commands()[0].id, "ui:menu");
    assert_eq!(
        graph.summary().by_plane[&RenderPlane::Screen].command_count,
        1
    );
    assert_eq!(graph.summary().interactive_count, 1);
}

fn test_layout() -> ResolvedStageLayout {
    resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(1600.0),
            height: Some(1000.0),
            ..Default::default()
        },
    )
}

fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required
            .into_iter()
            .map(ToString::to_string)
            .collect::<BTreeSet<_>>(),
    }
}
