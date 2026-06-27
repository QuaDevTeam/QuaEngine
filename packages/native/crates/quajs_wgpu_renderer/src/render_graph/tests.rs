use super::*;
use crate::resources::{NativeResourceKind, ResourceId, ResourceMemory};
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn sorts_commands_by_web_aligned_plane_order_and_z_index() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        command("overlay", RenderPlane::Overlay, DrawCommandKind::Rect).z_index(-10),
        command("scene-front", RenderPlane::Scene, DrawCommandKind::Image).z_index(20),
        command("subject", RenderPlane::Subject, DrawCommandKind::Image),
        command("scene-back", RenderPlane::Scene, DrawCommandKind::Clear).z_index(-10),
        command("screen", RenderPlane::Screen, DrawCommandKind::UiSurface),
        command("safe", RenderPlane::Safe, DrawCommandKind::Text),
    ]);

    let ids: Vec<_> = graph
        .commands()
        .iter()
        .map(|command| command.id.as_str())
        .collect();

    assert_eq!(
        ids,
        vec![
            "scene-back",
            "scene-front",
            "subject",
            "safe",
            "overlay",
            "screen"
        ]
    );
}

#[test]
fn sorts_commands_with_extreme_internal_z_index_without_overflowing() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        command("max", RenderPlane::Screen, DrawCommandKind::UiSurface).z_index(i32::MAX),
        command("min", RenderPlane::Scene, DrawCommandKind::Image).z_index(i32::MIN),
        command("normal", RenderPlane::Safe, DrawCommandKind::Text),
    ]);

    let ids: Vec<_> = graph
        .commands()
        .iter()
        .map(|command| command.id.as_str())
        .collect();

    assert_eq!(ids, vec!["min", "normal", "max"]);
}

#[test]
fn summarizes_commands_by_plane_package_and_resource() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        command("bg", RenderPlane::Scene, DrawCommandKind::Image)
            .resource("tex:bg")
            .owned_by("base"),
        command("sprite", RenderPlane::Subject, DrawCommandKind::Image)
            .resources(["tex:sprite", "buf:sprite"])
            .owned_by("runtime.diff")
            .require_package("base"),
        command("choice", RenderPlane::Safe, DrawCommandKind::UiSurface)
            .resource("ui:choice")
            .owned_by("runtime.ui")
            .interactive(true),
    ]);

    let summary = graph.summary();

    assert_eq!(summary.command_count, 3);
    assert_eq!(summary.interactive_count, 1);
    assert_eq!(summary.by_plane[&RenderPlane::Scene].command_count, 1);
    assert_eq!(
        summary.by_plane[&RenderPlane::Subject].resource_ref_count,
        2
    );
    assert_eq!(summary.by_plane[&RenderPlane::Safe].interactive_count, 1);
    assert_eq!(summary.by_package["base"].command_count, 2);
    assert_eq!(summary.by_package["runtime.diff"].resource_ref_count, 2);
    assert_eq!(summary.by_package["runtime.ui"].interactive_count, 1);
    assert_eq!(summary.resources.referenced_resource_ids.len(), 4);
    assert!(summary
        .resources
        .referenced_resource_ids
        .contains(&ResourceId::from("tex:sprite")));
}

#[test]
fn estimates_only_referenced_resource_memory() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        command("bg", RenderPlane::Scene, DrawCommandKind::Image).resource("tex:bg"),
        command("choice", RenderPlane::Safe, DrawCommandKind::UiSurface).resource("ui:choice"),
    ]);

    let summary = graph.estimate_resource_use([
        (
            ResourceId::from("tex:bg"),
            NativeResourceKind::Texture,
            ResourceMemory {
                cpu_bytes: 10,
                gpu_bytes: 90,
            },
        ),
        (
            ResourceId::from("ui:choice"),
            NativeResourceKind::UiAst,
            ResourceMemory {
                cpu_bytes: 20,
                gpu_bytes: 0,
            },
        ),
        (
            ResourceId::from("unused"),
            NativeResourceKind::AudioBuffer,
            ResourceMemory {
                cpu_bytes: 999,
                gpu_bytes: 0,
            },
        ),
    ]);

    assert_eq!(summary.by_kind[&NativeResourceKind::Texture], 1);
    assert_eq!(summary.by_kind[&NativeResourceKind::UiAst], 1);
    assert_eq!(
        summary.estimated_memory,
        ResourceMemory {
            cpu_bytes: 30,
            gpu_bytes: 90
        }
    );
}

#[test]
fn hit_tests_topmost_interactive_command() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        DrawCommand::new(
            "panel",
            RenderPlane::Safe,
            DrawCommandKind::RoundedRect,
            LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 500.0,
                height: 300.0,
            },
        )
        .interactive(true),
        DrawCommand::new(
            "button",
            RenderPlane::Safe,
            DrawCommandKind::UiSurface,
            LogicalRect {
                x: 100.0,
                y: 100.0,
                width: 200.0,
                height: 80.0,
            },
        )
        .z_index(10)
        .interactive(true),
        DrawCommand::new(
            "toast",
            RenderPlane::Overlay,
            DrawCommandKind::UiSurface,
            LogicalRect {
                x: 120.0,
                y: 120.0,
                width: 100.0,
                height: 40.0,
            },
        ),
    ]);

    assert_eq!(graph.hit_test(150.0, 130.0).unwrap().id, "button");
    assert_eq!(graph.hit_test(10.0, 10.0).unwrap().id, "panel");
    assert!(graph.hit_test(800.0, 800.0).is_none());
}

#[test]
fn hit_test_respects_command_clip_bounds() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([DrawCommand::new(
        "button",
        RenderPlane::Safe,
        DrawCommandKind::UiSurface,
        LogicalRect {
            x: 40.0,
            y: 40.0,
            width: 160.0,
            height: 120.0,
        },
    )
    .clip_bounds([LogicalRect {
        x: 20.0,
        y: 20.0,
        width: 220.0,
        height: 80.0,
    }])
    .interactive(true)]);

    assert_eq!(graph.hit_test(80.0, 80.0).unwrap().id, "button");
    assert!(graph.hit_test(80.0, 130.0).is_none());
}

#[test]
fn creates_logical_rect_from_safe_area() {
    let layout = test_layout();
    let rect = LogicalRect::from_safe_area(layout.safe_area);

    assert_eq!(rect.x, layout.safe_area.x);
    assert_eq!(rect.y, layout.safe_area.y);
    assert_eq!(rect.width, layout.safe_area.width);
    assert_eq!(rect.height, layout.safe_area.height);
    assert!(!rect.is_empty());
}

fn command(id: &str, plane: RenderPlane, kind: DrawCommandKind) -> DrawCommand {
    DrawCommand::new(
        id,
        plane,
        kind,
        LogicalRect {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 100.0,
        },
    )
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
