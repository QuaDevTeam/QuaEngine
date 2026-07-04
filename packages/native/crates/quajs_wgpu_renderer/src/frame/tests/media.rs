use crate::frame::prepare_native_frame;
use crate::projection::background::{
    BackgroundMode, BackgroundProjection, BackgroundVideoProjection,
};
use crate::projection::view::ViewProjection;
use crate::render_graph::DrawCommandKind;
use crate::resources::NativeResourceKind;

use super::support::{provenance, test_layout};

#[test]
fn keeps_video_fallback_poster_requests_visible_to_frame_consumer() {
    let frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
            background: Some(BackgroundProjection {
                mode: BackgroundMode::Video,
                video: Some(BackgroundVideoProjection {
                    poster: Some("poster/opening.png".to_string()),
                    provenance: provenance("runtime.video", ["base"]),
                    ..BackgroundVideoProjection::new("opening.mp4")
                }),
                ..Default::default()
            }),
            ..Default::default()
        },
    );

    assert_eq!(frame.summary.command_count, 1);
    assert_eq!(frame.graph.commands()[0].kind, DrawCommandKind::VideoFrame);
    assert!(frame.resources.request("video:opening.mp4").is_none());
    assert_eq!(
        frame
            .resources
            .request("images:poster/opening.png")
            .unwrap()
            .kind,
        NativeResourceKind::Texture
    );
    assert!(frame.assets.request("video", "opening.mp4").is_none());
    assert!(frame
        .assets
        .request("images", "poster/opening.png")
        .is_some());
}
