use super::*;
use crate::render_graph::LogicalRect;
use crate::renderer::NullNativeRenderBackend;

#[test]
fn projection_json_applies_resolved_scroll_offsets() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    renderer
        .prepare_frame_json_str(json_frame_with_scroll_offset_input())
        .expect("json frame input should prepare");

    let frame = renderer.state().frame().expect("frame prepared");
    let inside = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:menu:inside")
        .expect("scroll child command exists");

    assert_eq!(
        inside.bounds,
        LogicalRect {
            x: 64.0,
            y: 84.0,
            width: 220.0,
            height: 56.0,
        }
    );
    assert_eq!(
        inside.clip_bounds,
        vec![LogicalRect {
            x: 40.0,
            y: 40.0,
            width: 280.0,
            height: 120.0,
        }]
    );

    let hit = renderer.hit_intent(80.0, 96.0).expect("offset button hit");
    assert_eq!(hit.command_id, "ui:menu:inside");
    assert_eq!(hit.intent.action.as_deref(), Some("inside"));
}
