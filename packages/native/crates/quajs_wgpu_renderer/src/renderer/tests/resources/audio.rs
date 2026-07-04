use super::*;
use crate::resources::{NativeResourceKind, PackageUnloadBlockerReason};

#[test]
fn package_unload_blocks_active_audio_projection_resources() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_audio());

    let release = state.release_package_resources("runtime.audio");

    assert_eq!(release.revision, 1);
    assert!(!release.plan.can_unload());
    assert!(release.released_resources.is_empty());
    assert_eq!(release.summary.blocked_count, 2);
    assert_eq!(
        release.summary.blocked_by_kind[&NativeResourceKind::AudioBuffer],
        1
    );
    assert_eq!(
        release.summary.blocked_by_kind[&NativeResourceKind::AudioHandle],
        1
    );
    assert_eq!(
        release.summary.blocked_by_reason[&PackageUnloadBlockerReason::ActiveFrameReference],
        2
    );
    assert_eq!(release.summary.blocked_memory.cpu_bytes, 2112);
    assert!(state
        .resources()
        .get("audio:buffer:bgm:bgm:music/opening.ogg")
        .is_some());
    assert!(state
        .resources()
        .get("audio:handle:bgm:bgm:bgm-main")
        .is_some());
}
