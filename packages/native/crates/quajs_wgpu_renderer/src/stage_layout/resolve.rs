use super::presets::create_view_layout_projection;
use super::types::{
    ResolvedStageLayout, StageContainerInput, StageSafeArea, StageSafeAreaInsets, ViewLayoutInput,
};

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

pub(crate) fn positive_number(value: Option<f64>, fallback: f64) -> f64 {
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

pub(crate) fn clamp(value: f64, min: f64, max: f64) -> f64 {
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
