use super::types::{
    ResolvedStageLayout, StageClientPoint, StageClientRectOrigin, StageHitTestPoint,
    StageLogicalPoint,
};

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
            && viewport_x < layout.viewport_width
            && viewport_y < layout.viewport_height,
        inside_stage: x >= 0.0 && y >= 0.0 && x < layout.logical_width && y < layout.logical_height,
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
