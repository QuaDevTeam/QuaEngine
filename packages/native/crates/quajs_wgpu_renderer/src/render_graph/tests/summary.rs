use super::support::{command, test_layout};
use super::*;
use crate::resources::{NativeResourceKind, ResourceId, ResourceMemory};

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
