use super::super::{plan_audio_backend_commands, AudioBackendTrackStateMap};
use super::support::track;
use crate::projection::audio::AudioProjection;
use crate::resources::{NativeAssetRequestPlan, ResourceId};

#[test]
fn carries_skipped_asset_resource_ids_for_backend_diagnostics() {
    let audio = AudioProjection::new(vec![track("bgm-main", "music/opening.ogg")]);
    let asset_plan = NativeAssetRequestPlan {
        requests: Vec::new(),
        skipped_resource_ids: vec![ResourceId::from("audio:handle:bgm:bgm:bgm-main")],
    };

    let plan =
        plan_audio_backend_commands(&AudioBackendTrackStateMap::new(), Some(&audio), &asset_plan);

    assert_eq!(
        plan.skipped_asset_resource_ids,
        vec![ResourceId::from("audio:handle:bgm:bgm:bgm-main")]
    );
}
