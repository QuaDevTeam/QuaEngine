use std::collections::BTreeSet;

use crate::audio::NullNativeAudioBackend;
use crate::fonts::{
    FontBackendCommandKind, FontBackendCommandPlan, NativeFontBackend, NativeFontBackendError,
    NativeFontBackendResult, NullNativeFontBackend,
};
use crate::projection::common::PackageProvenance;
use crate::projection::fonts::{FontFaceProjection, FontsProjection};
use crate::projection::plugins::PluginProjection;
use crate::projection::view::ViewProjection;
use crate::renderer::NativeRenderer;

use super::super::{test_layout, RecordingBackend};

#[test]
fn can_apply_font_commands_through_explicit_font_backend() {
    let mut renderer = NativeRenderer::with_font_backend(
        RecordingBackend::default(),
        NullNativeFontBackend::new(),
    );

    let update = renderer
        .prepare_frame_and_apply_font(test_layout(), &view_with_fonts("runtime.fonts"))
        .expect("font backend should accept projected font commands");

    assert_eq!(
        update
            .font_backend_commands
            .commands
            .iter()
            .map(|command| command.kind.clone())
            .collect::<Vec<_>>(),
        vec![
            FontBackendCommandKind::LoadFace,
            FontBackendCommandKind::ActivateFace,
        ]
    );
    let font = renderer.font_backend().unwrap();
    assert_eq!(font.diagnostics().applied_plan_count, 1);
    assert_eq!(font.diagnostics().applied_command_count, 2);
    assert_eq!(font.diagnostics().active_face_count, 1);
    assert!(font.active_faces().contains_key("noto-serif-jp"));
}

#[test]
fn font_backend_failure_does_not_commit_backend_faces() {
    let mut renderer =
        NativeRenderer::with_font_backend(RecordingBackend::default(), RejectingFontBackend);

    let error = renderer
        .prepare_frame_and_apply_font(test_layout(), &view_with_fonts("runtime.fonts"))
        .expect_err("rejecting font backend should roll back renderer font state");

    assert_eq!(
        error,
        NativeFontBackendError::backend_rejected("test font backend rejected plan")
    );
    assert!(renderer.state().font_backend_faces().is_empty());
}

#[test]
fn clear_applies_font_teardown_before_dropping_renderer_state() {
    let mut renderer = NativeRenderer::with_audio_video_font_backend(
        RecordingBackend::default(),
        NullNativeAudioBackend::new(),
        (),
        NullNativeFontBackend::new(),
    );
    renderer
        .prepare_frame_and_apply_font(test_layout(), &view_with_fonts("runtime.fonts"))
        .expect("font frame should seed backend faces");

    let (released, cleanup) = renderer
        .clear_with_host_cleanup_and_media_teardown()
        .expect("font teardown should run before renderer clear");

    assert_eq!(released.len(), 1);
    assert_eq!(cleanup.len(), 1);
    assert!(renderer.state().font_backend_faces().is_empty());
    let font = renderer.font_backend().unwrap();
    assert_eq!(font.diagnostics().applied_plan_count, 2);
    assert_eq!(
        font.diagnostics()
            .last_plan
            .unwrap()
            .commands
            .iter()
            .map(|command| command.kind.clone())
            .collect::<Vec<_>>(),
        vec![FontBackendCommandKind::ReleaseFace]
    );
}

fn view_with_fonts(package_id: &str) -> ViewProjection {
    ViewProjection {
        plugins: Some(PluginProjection::fonts(FontsProjection::new(vec![
            FontFaceProjection::new("Noto Serif JP", "fonts/noto-serif-jp.woff2")
                .with_id("noto-serif-jp")
                .with_provenance(provenance(package_id)),
        ]))),
        ..Default::default()
    }
}

fn provenance(package_id: &str) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(package_id.to_string()),
        required_runtime_packages: BTreeSet::new(),
    }
}

struct RejectingFontBackend;

impl NativeFontBackend for RejectingFontBackend {
    fn apply_font_commands(&mut self, _plan: &FontBackendCommandPlan) -> NativeFontBackendResult {
        Err(NativeFontBackendError::backend_rejected(
            "test font backend rejected plan",
        ))
    }
}
