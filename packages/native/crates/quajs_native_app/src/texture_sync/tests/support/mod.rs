mod backend;
mod fixtures;
mod host;

pub(crate) use backend::{
    AssetLoadingAudioBackend, AssetLoadingFontBackend, AssetLoadingVideoBackend,
    RecordingTextureUploadSink, RejectingAudioBackend, TextureResidentBackend,
};
pub(crate) use fixtures::{
    bundle, renderer_with_rejecting_audio_after_audio_frame,
    renderer_with_rejecting_audio_after_inactive_audio_frame, set, sync_plan, test_layout,
    texture_request, view_with_audio_package, view_with_background, view_with_font_package,
    view_with_video_package,
};
pub(crate) use host::RecordingAssetHost;
