use super::*;

pub(super) fn view_with_two_resources() -> ViewProjection {
    ViewProjection {
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
    }
}

pub(super) fn image_command(id: &str, resource_id: &str) -> DrawCommand {
    DrawCommand::new(id, RenderPlane::Scene, DrawCommandKind::Image, rect()).resource(resource_id)
}

pub(super) fn rect() -> LogicalRect {
    LogicalRect {
        x: 0.0,
        y: 0.0,
        width: 100.0,
        height: 100.0,
    }
}

pub(super) fn test_layout() -> ResolvedStageLayout {
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

pub(super) fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required
            .into_iter()
            .map(ToString::to_string)
            .collect::<BTreeSet<_>>(),
    }
}

pub(super) fn set<const N: usize>(items: [&str; N]) -> BTreeSet<String> {
    items.into_iter().map(ToString::to_string).collect()
}
