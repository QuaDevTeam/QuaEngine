#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ViewLayoutOrientation {
    Landscape,
    Portrait,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ViewLayoutScaleMode {
    Fit,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ViewLayoutProjection {
    pub orientation: ViewLayoutOrientation,
    pub width: f64,
    pub height: f64,
    pub aspect_ratio: f64,
    pub min_aspect_ratio: f64,
    pub max_aspect_ratio: f64,
    pub scale_mode: ViewLayoutScaleMode,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ViewLayoutInput {
    pub preset: Option<ViewLayoutOrientation>,
    pub orientation: Option<ViewLayoutOrientation>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub aspect_ratio: Option<f64>,
    pub min_aspect_ratio: Option<f64>,
    pub max_aspect_ratio: Option<f64>,
    pub scale_mode: Option<ViewLayoutScaleMode>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StageContainerSize {
    pub width: f64,
    pub height: f64,
    pub device_pixel_ratio: f64,
    pub safe_area_insets: StageSafeAreaInsets,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StageContainerInput {
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub device_pixel_ratio: Option<f64>,
    pub safe_area_insets: Option<StageSafeAreaInsets>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StageSafeArea {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StageSafeAreaInsets {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StageClientPoint {
    pub client_x: f64,
    pub client_y: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StageLogicalPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StageClientRectOrigin {
    pub left: f64,
    pub top: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StageHitTestPoint {
    pub x: f64,
    pub y: f64,
    pub inside_viewport: bool,
    pub inside_stage: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ResolvedStageLayout {
    pub layout: ViewLayoutProjection,
    pub container_width: f64,
    pub container_height: f64,
    pub viewport_width: f64,
    pub viewport_height: f64,
    pub viewport_x: f64,
    pub viewport_y: f64,
    pub logical_width: f64,
    pub logical_height: f64,
    pub scale: f64,
    pub physical_scale: f64,
    pub aspect_ratio: f64,
    pub device_pixel_ratio: f64,
    pub physical_viewport_width: f64,
    pub physical_viewport_height: f64,
    pub aspect_safe_area: StageSafeArea,
    pub device_safe_area: StageSafeArea,
    pub css_safe_area_insets: StageSafeAreaInsets,
    pub logical_safe_area_insets: StageSafeAreaInsets,
    pub safe_area: StageSafeArea,
}

pub fn landscape_layout() -> ViewLayoutProjection {
    ViewLayoutProjection {
        orientation: ViewLayoutOrientation::Landscape,
        width: 1920.0,
        height: 1080.0,
        aspect_ratio: 16.0 / 9.0,
        min_aspect_ratio: 16.0 / 10.0,
        max_aspect_ratio: 16.0 / 9.0,
        scale_mode: ViewLayoutScaleMode::Fit,
    }
}

pub fn portrait_layout() -> ViewLayoutProjection {
    ViewLayoutProjection {
        orientation: ViewLayoutOrientation::Portrait,
        width: 1080.0,
        height: 2340.0,
        aspect_ratio: 9.0 / 19.5,
        min_aspect_ratio: 9.0 / 21.0,
        max_aspect_ratio: 9.0 / 16.0,
        scale_mode: ViewLayoutScaleMode::Fit,
    }
}

pub fn create_view_layout_projection(input: Option<ViewLayoutInput>) -> ViewLayoutProjection {
    let input = input.unwrap_or_default();
    let base = match input.preset.or(input.orientation) {
        Some(ViewLayoutOrientation::Portrait) => portrait_layout(),
        Some(ViewLayoutOrientation::Landscape) | None => landscape_layout(),
    };
    let width = positive_number(input.width, base.width);
    let height = positive_number(input.height, base.height);
    let preferred_aspect_ratio = positive_number(input.aspect_ratio, width / height);
    let mut min_aspect_ratio = positive_number(input.min_aspect_ratio, base.min_aspect_ratio);
    let mut max_aspect_ratio = positive_number(input.max_aspect_ratio, base.max_aspect_ratio);

    if min_aspect_ratio > max_aspect_ratio {
        std::mem::swap(&mut min_aspect_ratio, &mut max_aspect_ratio);
    }

    ViewLayoutProjection {
        orientation: base.orientation,
        width,
        height,
        aspect_ratio: clamp(preferred_aspect_ratio, min_aspect_ratio, max_aspect_ratio),
        min_aspect_ratio,
        max_aspect_ratio,
        scale_mode: input.scale_mode.unwrap_or(base.scale_mode),
    }
}

pub fn resolve_stage_layout(
    layout_input: Option<ViewLayoutInput>,
    container: StageContainerInput,
) -> ResolvedStageLayout {
    let layout = create_view_layout_projection(layout_input);
    let container_width = positive_number(container.width, layout.width);
    let container_height = positive_number(container.height, layout.height);
    let device_pixel_ratio = positive_number(container.device_pixel_ratio, 1.0);
    let css_safe_area_insets = normalize_safe_area_insets(container.safe_area_insets);
    let container_aspect_ratio = container_width / container_height;
    let aspect_ratio = clamp(
        container_aspect_ratio,
        layout.min_aspect_ratio,
        layout.max_aspect_ratio,
    );
    let viewport = fit_aspect_ratio(container_width, container_height, aspect_ratio);
    let scale = viewport.height / layout.height;
    let logical_width = viewport.width / scale;
    let logical_height = layout.height;
    let safe_width = logical_width.min(layout.height * layout.min_aspect_ratio);
    let aspect_safe_area = StageSafeArea {
        x: (logical_width - safe_width) / 2.0,
        y: 0.0,
        width: safe_width,
        height: logical_height,
    };
    let viewport_x = (container_width - viewport.width) / 2.0;
    let viewport_y = (container_height - viewport.height) / 2.0;
    let logical_safe_area_insets = resolve_logical_safe_area_insets(LogicalSafeAreaInput {
        container_width,
        container_height,
        viewport_width: viewport.width,
        viewport_height: viewport.height,
        viewport_x,
        viewport_y,
        scale,
        css_safe_area_insets,
    });
    let device_safe_area = StageSafeArea {
        x: logical_safe_area_insets.left,
        y: logical_safe_area_insets.top,
        width: f64::max(
            0.0,
            logical_width - logical_safe_area_insets.left - logical_safe_area_insets.right,
        ),
        height: f64::max(
            0.0,
            logical_height - logical_safe_area_insets.top - logical_safe_area_insets.bottom,
        ),
    };
    let safe_area = intersect_safe_area(aspect_safe_area, device_safe_area);

    ResolvedStageLayout {
        layout,
        container_width,
        container_height,
        viewport_width: viewport.width,
        viewport_height: viewport.height,
        viewport_x,
        viewport_y,
        logical_width,
        logical_height,
        scale,
        physical_scale: scale * device_pixel_ratio,
        aspect_ratio,
        device_pixel_ratio,
        physical_viewport_width: viewport.width * device_pixel_ratio,
        physical_viewport_height: viewport.height * device_pixel_ratio,
        aspect_safe_area,
        device_safe_area,
        css_safe_area_insets,
        logical_safe_area_insets,
        safe_area,
    }
}

pub fn client_point_to_stage_logical(
    layout: &ResolvedStageLayout,
    point: StageClientPoint,
    container_rect: StageClientRectOrigin,
) -> StageHitTestPoint {
    let container_x = point.client_x - container_rect.left;
    let container_y = point.client_y - container_rect.top;
    let viewport_x = container_x - layout.viewport_x;
    let viewport_y = container_y - layout.viewport_y;
    let x = viewport_x / layout.scale;
    let y = viewport_y / layout.scale;

    StageHitTestPoint {
        x,
        y,
        inside_viewport: viewport_x >= 0.0
            && viewport_y >= 0.0
            && viewport_x <= layout.viewport_width
            && viewport_y <= layout.viewport_height,
        inside_stage: x >= 0.0
            && y >= 0.0
            && x <= layout.logical_width
            && y <= layout.logical_height,
    }
}

pub fn stage_logical_to_client_point(
    layout: &ResolvedStageLayout,
    point: StageLogicalPoint,
    container_rect: StageClientRectOrigin,
) -> StageClientPoint {
    StageClientPoint {
        client_x: container_rect.left + layout.viewport_x + point.x * layout.scale,
        client_y: container_rect.top + layout.viewport_y + point.y * layout.scale,
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct AspectFitSize {
    width: f64,
    height: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct LogicalSafeAreaInput {
    container_width: f64,
    container_height: f64,
    viewport_width: f64,
    viewport_height: f64,
    viewport_x: f64,
    viewport_y: f64,
    scale: f64,
    css_safe_area_insets: StageSafeAreaInsets,
}

fn fit_aspect_ratio(width: f64, height: f64, aspect_ratio: f64) -> AspectFitSize {
    let height_from_width = width / aspect_ratio;
    if height_from_width <= height {
        return AspectFitSize {
            width,
            height: height_from_width,
        };
    }

    AspectFitSize {
        width: height * aspect_ratio,
        height,
    }
}

fn positive_number(value: Option<f64>, fallback: f64) -> f64 {
    match value {
        Some(value) if value.is_finite() && value > 0.0 => value,
        _ => fallback,
    }
}

fn non_negative_number(value: f64) -> f64 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        0.0
    }
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

fn normalize_safe_area_insets(insets: Option<StageSafeAreaInsets>) -> StageSafeAreaInsets {
    let insets = insets.unwrap_or_default();
    StageSafeAreaInsets {
        top: non_negative_number(insets.top),
        right: non_negative_number(insets.right),
        bottom: non_negative_number(insets.bottom),
        left: non_negative_number(insets.left),
    }
}

fn resolve_logical_safe_area_insets(options: LogicalSafeAreaInput) -> StageSafeAreaInsets {
    let right_bar_width = options.container_width - options.viewport_x - options.viewport_width;
    let bottom_bar_height = options.container_height - options.viewport_y - options.viewport_height;
    StageSafeAreaInsets {
        top: f64::max(0.0, options.css_safe_area_insets.top - options.viewport_y) / options.scale,
        right: f64::max(0.0, options.css_safe_area_insets.right - right_bar_width) / options.scale,
        bottom: f64::max(0.0, options.css_safe_area_insets.bottom - bottom_bar_height)
            / options.scale,
        left: f64::max(0.0, options.css_safe_area_insets.left - options.viewport_x) / options.scale,
    }
}

fn intersect_safe_area(left: StageSafeArea, right: StageSafeArea) -> StageSafeArea {
    let x = left.x.max(right.x);
    let y = left.y.max(right.y);
    let max_x = (left.x + left.width).min(right.x + right.width);
    let max_y = (left.y + left.height).min(right.y + right.height);

    StageSafeArea {
        x,
        y,
        width: f64::max(0.0, max_x - x),
        height: f64::max(0.0, max_y - y),
    }
}

#[cfg(test)]
mod tests {
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

        let client = stage_logical_to_client_point(
            &layout,
            StageLogicalPoint { x: 864.0, y: 540.0 },
            origin,
        );
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
}
