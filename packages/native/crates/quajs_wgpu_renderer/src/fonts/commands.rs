use std::collections::{BTreeMap, BTreeSet};

use crate::projection::common::{
    insert_unique_safe_native_dispatch_identifier, is_safe_native_asset_ref,
    is_safe_native_dispatch_identifier,
};
use crate::projection::fonts::{FontFaceProjection, FontsProjection};
use crate::projection::safety::is_safe_native_font_family_name;
use crate::resources::{font_face_resource_id, NativeAssetRequestPlan, ResourceId};

pub type FontBackendFaceStateMap = BTreeMap<String, FontBackendFaceState>;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct FontBackendCommandPlan {
    pub commands: Vec<FontBackendCommand>,
    pub next_faces: FontBackendFaceStateMap,
    pub skipped_asset_resource_ids: Vec<ResourceId>,
}

impl FontBackendCommandPlan {
    pub fn is_empty(&self) -> bool {
        self.commands.is_empty()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct FontBackendCommand {
    pub face_id: String,
    pub kind: FontBackendCommandKind,
    pub face: Option<FontBackendFaceState>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FontBackendCommandKind {
    LoadFace,
    ActivateFace,
    ReleaseFace,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FontBackendFaceState {
    pub id: String,
    pub order: usize,
    pub family: String,
    pub asset_type: String,
    pub asset_name: String,
    pub style: Option<String>,
    pub weight: Option<String>,
    pub stretch: Option<String>,
    pub display: Option<String>,
    pub unicode_range: Option<String>,
    pub package_candidates: BTreeSet<String>,
    pub face_resource_id: ResourceId,
}

pub fn plan_font_backend_commands(
    previous_faces: &FontBackendFaceStateMap,
    fonts: Option<&FontsProjection>,
    assets: &NativeAssetRequestPlan,
) -> FontBackendCommandPlan {
    let next_faces = font_backend_face_states(fonts, assets);
    let mut commands = Vec::new();

    for (face_id, next) in &next_faces {
        match previous_faces.get(face_id) {
            None => {
                commands.push(face_command(FontBackendCommandKind::LoadFace, next));
                commands.push(face_command(FontBackendCommandKind::ActivateFace, next));
            }
            Some(previous) if face_identity_changed(previous, next) => {
                commands.push(face_command(FontBackendCommandKind::ReleaseFace, previous));
                commands.push(face_command(FontBackendCommandKind::LoadFace, next));
                commands.push(face_command(FontBackendCommandKind::ActivateFace, next));
            }
            Some(_) => {}
        }
    }

    for (face_id, previous) in previous_faces {
        if !next_faces.contains_key(face_id) {
            commands.push(face_command(FontBackendCommandKind::ReleaseFace, previous));
        }
    }

    FontBackendCommandPlan {
        commands,
        next_faces,
        skipped_asset_resource_ids: assets.skipped_resource_ids.clone(),
    }
}

pub fn plan_font_backend_package_teardown_commands(
    previous_faces: &FontBackendFaceStateMap,
    released_resource_ids: &BTreeSet<ResourceId>,
) -> FontBackendCommandPlan {
    let mut commands = Vec::new();
    let mut next_faces = FontBackendFaceStateMap::new();

    for (face_id, previous) in previous_faces {
        if released_resource_ids.contains(&previous.face_resource_id) {
            commands.push(face_command(FontBackendCommandKind::ReleaseFace, previous));
        } else {
            next_faces.insert(face_id.clone(), previous.clone());
        }
    }

    FontBackendCommandPlan {
        commands,
        next_faces,
        skipped_asset_resource_ids: Vec::new(),
    }
}

fn font_backend_face_states(
    fonts: Option<&FontsProjection>,
    assets: &NativeAssetRequestPlan,
) -> FontBackendFaceStateMap {
    let Some(fonts) = fonts else {
        return BTreeMap::new();
    };

    let mut seen_face_ids = BTreeSet::new();
    let mut states = BTreeMap::new();
    for (order, face) in fonts.faces.iter().enumerate() {
        let face_id = face.identity();
        if !is_safe_native_dispatch_identifier(&face_id)
            || !insert_unique_safe_native_dispatch_identifier(&mut seen_face_ids, &face_id)
            || !is_safe_native_font_family_name(&face.family)
            || !is_safe_native_asset_ref(&face.asset_type, &face.asset_name)
        {
            continue;
        }
        let state = font_backend_face_state(fonts, face, &face_id, order, assets);
        states.insert(state.id.clone(), state);
    }
    states
}

fn font_backend_face_state(
    fonts: &FontsProjection,
    face: &FontFaceProjection,
    face_id: &str,
    order: usize,
    assets: &NativeAssetRequestPlan,
) -> FontBackendFaceState {
    let package_candidates = assets
        .request(&face.asset_type, &face.asset_name)
        .map(|request| request.package_candidates.clone())
        .unwrap_or_else(|| {
            let mut packages = face.provenance.package_ids();
            packages.extend(
                fonts
                    .safe_required_runtime_packages()
                    .map(ToString::to_string),
            );
            packages
        });

    FontBackendFaceState {
        id: face_id.to_string(),
        order,
        family: face.family.clone(),
        asset_type: face.asset_type.clone(),
        asset_name: face.asset_name.clone(),
        style: face.style.clone(),
        weight: face.weight.as_ref().map(font_weight_identity),
        stretch: face.stretch.clone(),
        display: face.display.clone(),
        unicode_range: face.unicode_range.clone(),
        package_candidates,
        face_resource_id: font_face_resource_id(face),
    }
}

fn font_weight_identity(weight: &crate::projection::common::FontWeightProjection) -> String {
    match weight {
        crate::projection::common::FontWeightProjection::Number(weight) => weight.to_string(),
        crate::projection::common::FontWeightProjection::Keyword(keyword) => keyword.clone(),
    }
}

fn face_command(kind: FontBackendCommandKind, face: &FontBackendFaceState) -> FontBackendCommand {
    FontBackendCommand {
        face_id: face.id.clone(),
        kind,
        face: Some(face.clone()),
    }
}

fn face_identity_changed(previous: &FontBackendFaceState, next: &FontBackendFaceState) -> bool {
    previous.family != next.family
        || previous.order != next.order
        || previous.asset_type != next.asset_type
        || previous.asset_name != next.asset_name
        || previous.style != next.style
        || previous.weight != next.weight
        || previous.stretch != next.stretch
        || previous.display != next.display
        || previous.unicode_range != next.unicode_range
        || previous.package_candidates != next.package_candidates
        || previous.face_resource_id != next.face_resource_id
}

#[cfg(test)]
mod tests;
