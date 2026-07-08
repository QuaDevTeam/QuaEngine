use std::collections::BTreeSet;

use super::*;
use crate::projection::common::PackageProvenance;
use crate::projection::fonts::{FontFaceProjection, FontsProjection};
use crate::resources::{
    NativeAssetRequest, NativeAssetRequestPlan, NativeResourceKind, ResourceId,
};

#[test]
fn plans_load_and_activate_for_new_font_faces() {
    let fonts = FontsProjection::new(vec![FontFaceProjection::new(
        "Noto Serif JP",
        "fonts/noto-serif-jp.woff2",
    )
    .with_id("noto-serif-jp")
    .with_provenance(provenance("runtime.fonts", []))]);
    let plan = plan_font_backend_commands(
        &FontBackendFaceStateMap::new(),
        Some(&fonts),
        &assets([("fonts", "fonts/noto-serif-jp.woff2", ["runtime.fonts"])]),
    );

    assert_eq!(plan.commands.len(), 2);
    assert_eq!(plan.commands[0].kind, FontBackendCommandKind::LoadFace);
    assert_eq!(plan.commands[1].kind, FontBackendCommandKind::ActivateFace);
    let face = plan.commands[0].face.as_ref().unwrap();
    assert_eq!(face.id, "noto-serif-jp");
    assert_eq!(face.family, "Noto Serif JP");
    assert_eq!(face.package_candidates, set(["runtime.fonts"]));
    assert_eq!(
        face.face_resource_id,
        ResourceId::from("font:face:fonts:fonts/noto-serif-jp.woff2")
    );
}

#[test]
fn releases_removed_font_faces() {
    let initial = FontsProjection::new(vec![FontFaceProjection::new(
        "Noto Serif JP",
        "fonts/noto-serif-jp.woff2",
    )
    .with_id("noto-serif-jp")]);
    let previous = plan_font_backend_commands(
        &FontBackendFaceStateMap::new(),
        Some(&initial),
        &NativeAssetRequestPlan::default(),
    )
    .next_faces;

    let plan = plan_font_backend_commands(&previous, None, &NativeAssetRequestPlan::default());

    assert_eq!(plan.commands.len(), 1);
    assert_eq!(plan.commands[0].kind, FontBackendCommandKind::ReleaseFace);
    assert!(plan.next_faces.is_empty());
}

fn assets<const N: usize, const P: usize>(
    records: [(&str, &str, [&str; P]); N],
) -> NativeAssetRequestPlan {
    NativeAssetRequestPlan {
        requests: records
            .into_iter()
            .map(|(asset_type, asset_name, packages)| NativeAssetRequest {
                resource_id: ResourceId::new(format!("font:face:{asset_type}:{asset_name}")),
                asset_type: asset_type.to_string(),
                asset_name: asset_name.to_string(),
                kind: NativeResourceKind::FontFace,
                command_ids: BTreeSet::new(),
                owner_package_ids: BTreeSet::new(),
                required_package_ids: BTreeSet::new(),
                package_candidates: set(packages),
            })
            .collect(),
        skipped_resource_ids: Vec::new(),
    }
}

fn provenance<const N: usize>(
    content_package_id: &str,
    required_runtime_packages: [&str; N],
) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(content_package_id.to_string()),
        required_runtime_packages: set(required_runtime_packages),
    }
}

fn set<const N: usize>(values: [&str; N]) -> BTreeSet<String> {
    values.into_iter().map(ToString::to_string).collect()
}
