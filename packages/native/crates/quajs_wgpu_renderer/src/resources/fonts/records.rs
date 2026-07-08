use crate::projection::common::{
    insert_unique_safe_native_dispatch_identifier, is_safe_native_asset_ref,
    is_safe_native_dispatch_identifier,
};
use crate::projection::fonts::{FontFaceProjection, FontsProjection};
use crate::projection::safety::is_safe_native_font_family_name;

use super::super::record::{NativeResourceKind, NativeResourceRecord, ResourceId};

const FONT_FACE_BASE_CPU_BYTES: u64 = 768;
const FONT_FACE_ASSET_BYTE_WEIGHT: u64 = 2;

pub fn font_resource_records(fonts: Option<&FontsProjection>) -> Vec<NativeResourceRecord> {
    let Some(fonts) = fonts else {
        return Vec::new();
    };

    let mut seen_face_ids = std::collections::BTreeSet::new();
    let mut records = Vec::new();
    for face in &fonts.faces {
        let identity = face.identity();
        if !is_safe_native_dispatch_identifier(&identity)
            || !insert_unique_safe_native_dispatch_identifier(&mut seen_face_ids, &identity)
        {
            continue;
        }
        if let Some(record) = font_face_resource_record(fonts, face) {
            records.push(record);
        }
    }
    records
}

pub(super) fn is_font_projection_resource_record(record: &NativeResourceRecord) -> bool {
    record.kind == NativeResourceKind::FontFace && is_font_projection_resource_id(&record.id)
}

pub(super) fn is_font_projection_resource_id(resource_id: &ResourceId) -> bool {
    resource_id.as_str().starts_with("font:face:")
}

pub fn font_face_resource_id(face: &FontFaceProjection) -> ResourceId {
    ResourceId::new(format!("font:face:{}:{}", face.asset_type, face.asset_name))
}

fn font_face_resource_record(
    fonts: &FontsProjection,
    face: &FontFaceProjection,
) -> Option<NativeResourceRecord> {
    if !is_safe_native_font_family_name(&face.family)
        || !is_safe_native_asset_ref(&face.asset_type, &face.asset_name)
    {
        return None;
    }

    let mut record =
        NativeResourceRecord::new(font_face_resource_id(face), NativeResourceKind::FontFace)
            .memory(estimated_font_face_cpu_bytes(face), 0)
            .label(format!(
                "font face {} asset {}:{}",
                face.family, face.asset_type, face.asset_name
            ));

    if let Some(package_id) = face.provenance.safe_content_package_id() {
        record = record.owned_by(package_id);
    }
    for package_id in fonts.safe_required_runtime_packages() {
        record = record.require_package(package_id);
    }
    for package_id in face.provenance.safe_required_runtime_packages() {
        record = record.require_package(package_id);
    }

    Some(record)
}

fn estimated_font_face_cpu_bytes(face: &FontFaceProjection) -> u64 {
    FONT_FACE_BASE_CPU_BYTES.saturating_add(
        (face.asset_type.len() as u64)
            .saturating_add(face.asset_name.len() as u64)
            .saturating_mul(FONT_FACE_ASSET_BYTE_WEIGHT),
    )
}
