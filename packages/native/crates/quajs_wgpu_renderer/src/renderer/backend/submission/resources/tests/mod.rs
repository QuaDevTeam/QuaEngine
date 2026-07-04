use super::*;
use crate::frame::prepare_native_frame;
use crate::projection::background::BackgroundProjection;
use crate::projection::common::PackageProvenance;
use crate::projection::view::ViewProjection;
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

use super::super::NativeRenderFrameRef;

mod diagnostics;
mod memory;
mod missing;
mod policy;

fn frame_with_background() -> crate::frame::PreparedNativeFrame {
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

fn test_layout() -> crate::stage_layout::ResolvedStageLayout {
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

fn package_provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required.into_iter().map(ToString::to_string).collect(),
    }
}
