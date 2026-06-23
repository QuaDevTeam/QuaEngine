use super::*;

const EPSILON: f64 = 0.0001;

#[test]
fn resolves_landscape_tablet_layout_like_web_renderer() {
    let layout = resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(1600.0),
            height: Some(1000.0),
            ..Default::default()
        },
    );

    assert_close(layout.aspect_ratio, 1.6);
    assert_close(layout.viewport_width, 1600.0);
    assert_close(layout.viewport_height, 1000.0);
    assert_close(layout.logical_width, 1728.0);
    assert_close(layout.logical_height, 1080.0);
    assert_close(layout.scale, 1000.0 / 1080.0);

    let center = client_point_to_stage_logical(
        &layout,
        StageClientPoint {
            client_x: 800.0,
            client_y: 500.0,
        },
        StageClientRectOrigin::default(),
    );
    assert_close(center.x, 864.0);
    assert_close(center.y, 540.0);
    assert!(center.inside_viewport);
    assert!(center.inside_stage);

    let client = stage_logical_to_client_point(
        &layout,
        StageLogicalPoint { x: 864.0, y: 540.0 },
        StageClientRectOrigin::default(),
    );
    assert_close(client.client_x, 800.0);
    assert_close(client.client_y, 500.0);
}

#[test]
fn centers_landscape_viewport_in_ultrawide_containers() {
    let layout = resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(2560.0),
            height: Some(1080.0),
            ..Default::default()
        },
    );

    assert_close(layout.aspect_ratio, 16.0 / 9.0);
    assert_close(layout.viewport_width, 1920.0);
    assert_close(layout.viewport_height, 1080.0);
    assert_close(layout.viewport_x, 320.0);
    assert_close(layout.viewport_y, 0.0);
    assert_close(layout.logical_width, 1920.0);
    assert_close(layout.logical_height, 1080.0);
}

#[test]
fn resolves_portrait_phone_layout_like_web_renderer() {
    let layout = resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Portrait),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(360.0),
            height: Some(780.0),
            ..Default::default()
        },
    );

    assert_close(layout.aspect_ratio, 9.0 / 19.5);
    assert_close(layout.viewport_width, 360.0);
    assert_close(layout.viewport_height, 780.0);
    assert_close(layout.logical_width, 1080.0);
    assert_close(layout.logical_height, 2340.0);
    assert_close(layout.scale, 1.0 / 3.0);

    let center = client_point_to_stage_logical(
        &layout,
        StageClientPoint {
            client_x: 180.0,
            client_y: 390.0,
        },
        StageClientRectOrigin::default(),
    );
    assert_close(center.x, 540.0);
    assert_close(center.y, 1170.0);

    let client = stage_logical_to_client_point(
        &layout,
        StageLogicalPoint {
            x: 540.0,
            y: 1170.0,
        },
        StageClientRectOrigin::default(),
    );
    assert_close(client.client_x, 180.0);
    assert_close(client.client_y, 390.0);
}

#[test]
fn converts_device_safe_area_to_logical_stage_units() {
    let layout = resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Portrait),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(360.0),
            height: Some(780.0),
            safe_area_insets: Some(StageSafeAreaInsets {
                top: 30.0,
                right: 8.0,
                bottom: 15.0,
                left: 8.0,
            }),
            ..Default::default()
        },
    );

    assert_close(layout.logical_safe_area_insets.top, 90.0);
    assert_close(layout.logical_safe_area_insets.right, 24.0);
    assert_close(layout.logical_safe_area_insets.bottom, 45.0);
    assert_close(layout.logical_safe_area_insets.left, 24.0);
    assert_close(layout.safe_area.x, 38.5714285714);
    assert_close(layout.safe_area.y, 90.0);
    assert_close(layout.safe_area.width, 1002.8571428571);
    assert_close(layout.safe_area.height, 2205.0);
}

#[test]
fn honors_client_rect_origin_for_coordinate_conversion() {
    let layout = resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(1600.0),
            height: Some(1000.0),
            ..Default::default()
        },
    );
    let origin = StageClientRectOrigin {
        left: 100.0,
        top: 50.0,
    };

    let client =
        stage_logical_to_client_point(&layout, StageLogicalPoint { x: 864.0, y: 540.0 }, origin);
    assert_close(client.client_x, 900.0);
    assert_close(client.client_y, 550.0);

    let logical = client_point_to_stage_logical(&layout, client, origin);
    assert_close(logical.x, 864.0);
    assert_close(logical.y, 540.0);
}

#[test]
fn normalizes_layout_and_container_inputs() {
    let layout = create_view_layout_projection(Some(ViewLayoutInput {
        orientation: Some(ViewLayoutOrientation::Portrait),
        width: Some(-1.0),
        height: Some(f64::NAN),
        aspect_ratio: Some(100.0),
        min_aspect_ratio: Some(2.0),
        max_aspect_ratio: Some(1.0),
        ..Default::default()
    }));

    assert_eq!(layout.orientation, ViewLayoutOrientation::Portrait);
    assert_close(layout.width, 1080.0);
    assert_close(layout.height, 2340.0);
    assert_close(layout.min_aspect_ratio, 1.0);
    assert_close(layout.max_aspect_ratio, 2.0);
    assert_close(layout.aspect_ratio, 2.0);

    let resolved = resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(-1.0),
            height: Some(0.0),
            device_pixel_ratio: Some(f64::INFINITY),
            safe_area_insets: Some(StageSafeAreaInsets {
                top: -1.0,
                right: f64::NAN,
                bottom: 2.0,
                left: 3.0,
            }),
        },
    );

    assert_close(resolved.container_width, 1920.0);
    assert_close(resolved.container_height, 1080.0);
    assert_close(resolved.device_pixel_ratio, 1.0);
    assert_close(resolved.css_safe_area_insets.top, 0.0);
    assert_close(resolved.css_safe_area_insets.right, 0.0);
    assert_close(resolved.css_safe_area_insets.bottom, 2.0);
    assert_close(resolved.css_safe_area_insets.left, 3.0);
}

fn assert_close(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() < EPSILON,
        "expected {actual} to be close to {expected}",
    );
}
