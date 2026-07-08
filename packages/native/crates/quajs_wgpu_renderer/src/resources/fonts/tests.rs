use std::collections::BTreeSet;

use super::*;
use crate::projection::common::PackageProvenance;
use crate::projection::fonts::{FontFaceProjection, FontsProjection};
use crate::resources::{NativeResourceKind, NativeResourceLedger, ResourceId};

#[test]
fn plans_font_resources_and_asset_requests_from_plugin_projection() {
    let mut fonts = FontsProjection::new(vec![FontFaceProjection::new(
        "Noto Serif JP",
        "fonts/noto-serif-jp.woff2",
    )
    .with_id("noto-serif-jp")
    .with_provenance(provenance("runtime.fonts", ["base"]))]);
    fonts
        .required_runtime_packages
        .insert("runtime.shared-fonts".to_string());
    let ledger = NativeResourceLedger::new();

    let sync = plan_font_resource_sync(&ledger, Some(&fonts));
    let assets = plan_font_asset_requests(&ledger, &sync);

    assert_eq!(sync.upsert.len(), 1);
    let record = &sync.upsert[0];
    assert_eq!(
        record.id,
        ResourceId::from("font:face:fonts:fonts/noto-serif-jp.woff2")
    );
    assert_eq!(record.kind, NativeResourceKind::FontFace);
    assert_eq!(record.owner_package_id.as_deref(), Some("runtime.fonts"));
    assert_eq!(
        record.required_package_ids,
        set(["base", "runtime.shared-fonts"])
    );

    let request = assets
        .request("fonts", "fonts/noto-serif-jp.woff2")
        .expect("font asset request");
    assert_eq!(
        request.package_candidates,
        set(["base", "runtime.fonts", "runtime.shared-fonts"])
    );
}

#[test]
fn does_not_release_dialogue_font_family_resources_through_font_sync() {
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(crate::resources::NativeResourceRecord::new(
        "fonts:Dialogue Sans",
        NativeResourceKind::FontFace,
    ));

    let sync = plan_font_resource_sync(&ledger, None);

    assert!(sync.release.is_empty());
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
