mod cleanup;
mod frame;
mod host;
mod lifecycle;
mod metadata;
#[cfg(test)]
mod tests;
mod types;
mod validation;
#[cfg(feature = "image-decode")]
mod wgpu;

#[allow(unused_imports)]
pub use cleanup::{
    clear_renderer_with_host_texture_cleanup,
    clear_renderer_with_host_texture_cleanup_and_audio_teardown,
    release_package_resources_with_host_texture_cleanup,
    release_package_resources_with_host_texture_cleanup_and_audio_teardown,
    sync_texture_releases_from_host_cleanup, NativeTextureCleanedClearResult,
    NativeTextureCleanedPackageReleaseResult, NativeTextureHostCleanupSyncFailure,
    NativeTextureHostCleanupSyncReport, NativeTextureMediaTeardownError,
};
#[allow(unused_imports)]
pub use frame::{
    render_frame_with_host_texture_lifecycle_sync,
    render_frame_with_host_texture_lifecycle_sync_and_audio_teardown,
    render_frame_with_host_texture_sync, render_json_frame_with_host_texture_lifecycle_sync,
    render_json_frame_with_host_texture_lifecycle_sync_and_audio_teardown,
    render_json_frame_with_host_texture_sync, NativeTextureJsonLifecycleFrameError,
    NativeTextureLifecycleFrameError, NativeTextureLifecycleSyncedFrameResult,
    NativeTextureSyncedFrameResult,
};
#[allow(unused_imports)]
pub use host::sync_pending_texture_uploads_from_host;
#[allow(unused_imports)]
pub use lifecycle::{
    sync_mounted_texture_bundle_lifecycle_from_host,
    sync_mounted_texture_bundle_lifecycle_from_host_and_audio_teardown,
    NativeTextureBundleLifecycleSyncError, NativeTextureBundleLifecycleSyncReport,
    NativeTextureBundleMountRegistry,
};
#[allow(unused_imports)]
pub use types::{
    NativeTextureReleaseHostSyncFailure, NativeTextureUploadHostSyncFailure,
    NativeTextureUploadHostSyncFailureKind, NativeTextureUploadHostSyncReport,
    NativeTextureUploadMetadata, NativeTextureUploadSink,
};
