use crate::frame::{prepare_native_frame, PreparedNativeFrame};
use crate::projection::background::BackgroundProjection;
use crate::projection::view::ViewProjection;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

pub(super) fn frame_with_background() -> PreparedNativeFrame {
    prepare_native_frame(
        test_layout(),
        &ViewProjection {
            background: Some(BackgroundProjection {
                asset_name: Some("bg/school.png".to_string()),
                ..Default::default()
            }),
            ..Default::default()
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
