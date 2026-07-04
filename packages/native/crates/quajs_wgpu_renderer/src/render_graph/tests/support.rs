use super::*;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

pub(super) fn command(id: &str, plane: RenderPlane, kind: DrawCommandKind) -> DrawCommand {
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
