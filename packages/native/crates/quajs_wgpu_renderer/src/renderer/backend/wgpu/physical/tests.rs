use super::*;
use crate::render_graph::{LogicalRect, RenderViewport};

#[test]
fn maps_logical_viewport_and_scissor_to_physical_pixels() {
    let viewport = viewport();
    let first_clip = LogicalRect {
        x: 5.0,
        y: 10.0,
        width: 20.0,
        height: 15.0,
    };
    let overflowing_clip = LogicalRect {
        x: 80.0,
        y: 40.0,
        width: 40.0,
        height: 20.0,
    };

    assert_eq!(
        physical_viewport_rect(&viewport),
        WgpuPhysicalRect {
            x: 20,
            y: 40,
            width: 400,
            height: 200,
        }
    );
    assert_eq!(
        physical_scissor_rect(&viewport, first_clip),
        WgpuPhysicalRect {
            x: 40,
            y: 80,
            width: 80,
            height: 60,
        }
    );
    assert_eq!(
        physical_scissor_rect(&viewport, overflowing_clip),
        WgpuPhysicalRect {
            x: 340,
            y: 200,
            width: 80,
            height: 40,
        }
    );
}

#[test]
fn clamps_negative_or_empty_scissors_to_viewport_bounds() {
    let viewport = viewport();
    let negative_clip = LogicalRect {
        x: -20.0,
        y: -20.0,
        width: 30.0,
        height: 30.0,
    };
    let empty_clip = LogicalRect {
        x: 10.0,
        y: 10.0,
        width: -10.0,
        height: 20.0,
    };

    assert_eq!(
        physical_scissor_rect(&viewport, negative_clip),
        WgpuPhysicalRect {
            x: 20,
            y: 40,
            width: 40,
            height: 40,
        }
    );
    assert!(physical_scissor_rect(&viewport, empty_clip).is_empty());
}

fn viewport() -> RenderViewport {
    RenderViewport {
        logical_width: 100.0,
        logical_height: 50.0,
        viewport_x: 10.0,
        viewport_y: 20.0,
        viewport_width: 200.0,
        viewport_height: 100.0,
        physical_viewport_width: 400.0,
        physical_viewport_height: 200.0,
        scale: 2.0,
        physical_scale: 4.0,
        device_pixel_ratio: 2.0,
    }
}
