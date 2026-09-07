use crate::render_graph::{DrawCompositeGroup, LogicalRect};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionProjection {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scale: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub composition: Option<serde_json::Value>,
}

impl MotionProjection {
    pub fn group(
        &self,
        id: String,
        bounds: LogicalRect,
        camera: bool,
    ) -> Option<DrawCompositeGroup> {
        let finite = |v: Option<f64>, fallback| {
            v.filter(|n| n.is_finite() && n.abs() <= 1_000_000.0)
                .unwrap_or(fallback)
        };
        let x = finite(self.x, 0.0);
        let y = finite(self.y, 0.0);
        let scale = finite(self.scale, 1.0);
        let angle = finite(self.rotation, 0.0);
        let opacity = self
            .opacity
            .filter(|v| v.is_finite())
            .unwrap_or(1.0)
            .clamp(0.0, 1.0);
        let brightness = self
            .composition
            .as_ref()
            .and_then(|v| v.pointer("/filter/brightness"))
            .and_then(serde_json::Value::as_f64)
            .filter(|v| v.is_finite())
            .unwrap_or(1.0)
            .clamp(0.0, 100.0);
        if x == 0.0
            && y == 0.0
            && scale == 1.0
            && angle == 0.0
            && opacity == 1.0
            && brightness == 1.0
        {
            return None;
        }
        let sign = if camera { -1.0 } else { 1.0 };
        let (sin, cos) = (angle * sign).to_radians().sin_cos();
        let a = cos * scale;
        let b = sin * scale;
        let cx = bounds.x + bounds.width / 2.0;
        let cy = bounds.y + bounds.height / 2.0;
        let mut group = DrawCompositeGroup {
            id,
            opacity: if scale == 0.0 { 0.0 } else { opacity },
            transform: [
                a,
                b,
                -b,
                a,
                cx + x * sign - a * cx + b * cy,
                cy + y * sign - b * cx - a * cy,
            ],
            ..Default::default()
        };
        group.color_filter.brightness = brightness as f32;
        Some(group)
    }
}
