//! Resolved CSS mask layout in logical units. Intrinsic texture dimensions are
//! supplied at draw time; no game state or asset loading lives here.
use super::LogicalRect;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum MaskLength {
    Pixels(f64),
    Percent(f64),
}
impl MaskLength {
    fn resolve(self, extent: f64, scale: f64) -> f64 {
        match self {
            Self::Pixels(n) => n * scale,
            Self::Percent(n) => n * extent,
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum MaskSize {
    Cover,
    Contain,
    Explicit([Option<MaskLength>; 2]),
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MaskRepeat {
    NoRepeat,
    Repeat,
    Round,
    Space,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MaskPosition {
    pub fraction: f64,
    pub offset: f64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct MaskLayout {
    size: MaskSize,
    position: [MaskPosition; 2],
    repeat: [MaskRepeat; 2],
}
impl Default for MaskLayout {
    fn default() -> Self {
        Self {
            size: MaskSize::Cover,
            position: [MaskPosition {
                fraction: 0.5,
                offset: 0.0,
            }; 2],
            repeat: [MaskRepeat::NoRepeat; 2],
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ResolvedMaskTile {
    pub bounds: LogicalRect,
    pub period: [f64; 2],
    pub repeat: [bool; 2],
}
impl MaskLayout {
    pub fn parse(
        position: Option<&str>,
        size: Option<&str>,
        repeat: Option<&str>,
    ) -> Result<Self, &'static str> {
        Ok(Self {
            position: parse_position(position.unwrap_or("center")).ok_or("position")?,
            size: parse_size(size.unwrap_or("cover")).ok_or("size")?,
            repeat: parse_repeat(repeat.unwrap_or("no-repeat")).ok_or("repeat")?,
        })
    }
    pub fn resolve(&self, area: LogicalRect, intrinsic: [f64; 2], scale: f64) -> ResolvedMaskTile {
        // Direct Rust callers may bypass JSON validation. Degenerate inputs
        // resolve to an empty mask instead of NaN/Inf GPU uniforms.
        if ![
            area.x,
            area.y,
            area.width,
            area.height,
            intrinsic[0],
            intrinsic[1],
            scale,
        ]
        .iter()
        .all(|n| n.is_finite())
            || area.width <= 0.0
            || area.height <= 0.0
            || intrinsic.iter().any(|n| *n <= 0.0)
            || scale <= 0.0
        {
            return ResolvedMaskTile {
                bounds: LogicalRect::default(),
                period: [0.0; 2],
                repeat: [false; 2],
            };
        }
        let extents = [area.width, area.height];
        let natural = intrinsic.map(|n| n * scale);
        let mut size = match self.size {
            MaskSize::Cover | MaskSize::Contain => {
                let ratios = [area.width / natural[0], area.height / natural[1]];
                let fit = if self.size == MaskSize::Cover {
                    ratios[0].max(ratios[1])
                } else {
                    ratios[0].min(ratios[1])
                };
                natural.map(|n| n * fit)
            }
            MaskSize::Explicit(lengths) => {
                let x = lengths[0].map(|n| n.resolve(area.width, scale));
                let y = lengths[1].map(|n| n.resolve(area.height, scale));
                match (x, y) {
                    (Some(x), Some(y)) => [x, y],
                    (Some(x), None) => [x, x * natural[1] / natural[0]],
                    (None, Some(y)) => [y * natural[0] / natural[1], y],
                    _ => natural,
                }
            }
        };
        // Chrome resolves the position against the authored tile size before
        // round adjusts its dimensions to fit an integral number of tiles.
        let positioned_size = size;
        for axis in 0..2 {
            if self.repeat[axis] == MaskRepeat::Round && size[axis] > 0.0 {
                let previous = size[axis];
                size[axis] = extents[axis] / (extents[axis] / previous).round().max(1.0);
                if matches!(self.size, MaskSize::Explicit(lengths) if lengths[1-axis].is_none())
                    && self.repeat[1 - axis] != MaskRepeat::Round
                {
                    size[1 - axis] *= size[axis] / previous;
                }
            }
        }
        let mut offset = [0.0; 2];
        let mut period = size;
        let mut repeat = [false; 2];
        for axis in 0..2 {
            offset[axis] = (extents[axis] - positioned_size[axis]) * self.position[axis].fraction
                + self.position[axis].offset * scale;
            match self.repeat[axis] {
                MaskRepeat::NoRepeat => {}
                MaskRepeat::Repeat => repeat[axis] = true,
                MaskRepeat::Round => {
                    repeat[axis] = true;
                }
                MaskRepeat::Space if size[axis] > 0.0 => {
                    let count = (extents[axis] / size[axis]).floor();
                    if count >= 2.0 {
                        offset[axis] = 0.0;
                        period[axis] = (extents[axis] - size[axis]) / (count - 1.0);
                        repeat[axis] = true;
                    }
                }
                _ => {}
            }
        }
        ResolvedMaskTile {
            bounds: LogicalRect {
                x: area.x + offset[0],
                y: area.y + offset[1],
                width: size[0],
                height: size[1],
            },
            period,
            repeat,
        }
    }
}
fn words(input: &str) -> Option<Vec<&str>> {
    if input.len() > 128 || input.chars().any(char::is_control) {
        return None;
    }
    Some(input.split_whitespace().collect())
}
fn length(input: &str) -> Option<MaskLength> {
    let (number, percent) = if let Some(n) = input.strip_suffix('%') {
        (n, true)
    } else if let Some(n) = input.strip_suffix("px") {
        (n, false)
    } else if input == "0" {
        (input, false)
    } else {
        return None;
    };
    let n: f64 = number.parse().ok()?;
    if !n.is_finite() || n.abs() > 1_000_000.0 || (n != 0.0 && n.abs() < 0.000001) {
        return None;
    }
    Some(if percent {
        MaskLength::Percent(n / 100.0)
    } else {
        MaskLength::Pixels(n)
    })
}
fn parse_size(input: &str) -> Option<MaskSize> {
    match words(input)?.as_slice() {
        ["cover"] => Some(MaskSize::Cover),
        ["contain"] => Some(MaskSize::Contain),
        items if (1..=2).contains(&items.len()) => {
            let mut lengths = [None; 2];
            for (i, value) in items.iter().enumerate() {
                if *value != "auto" {
                    let n = length(value)?;
                    if matches!(n, MaskLength::Percent(n) | MaskLength::Pixels(n) if n < 0.0) {
                        return None;
                    }
                    lengths[i] = Some(n);
                }
            }
            Some(MaskSize::Explicit(lengths))
        }
        _ => None,
    }
}
fn axis_position(value: &str, vertical: bool) -> Option<MaskPosition> {
    let fraction = match value {
        "center" => Some(0.5),
        "left" if !vertical => Some(0.0),
        "right" if !vertical => Some(1.0),
        "top" if vertical => Some(0.0),
        "bottom" if vertical => Some(1.0),
        _ => None,
    };
    if let Some(fraction) = fraction {
        return Some(MaskPosition {
            fraction,
            offset: 0.0,
        });
    }
    match length(value)? {
        MaskLength::Pixels(offset) => Some(MaskPosition {
            fraction: 0.0,
            offset,
        }),
        MaskLength::Percent(fraction) => Some(MaskPosition {
            fraction,
            offset: 0.0,
        }),
    }
}
fn parse_position(input: &str) -> Option<[MaskPosition; 2]> {
    let center = MaskPosition {
        fraction: 0.5,
        offset: 0.0,
    };
    match words(input)?.as_slice() {
        [one] => axis_position(one, false)
            .map(|x| [x, center])
            .or_else(|| axis_position(one, true).map(|y| [center, y])),
        [x, y] => axis_position(x, false)
            .zip(axis_position(y, true))
            .or_else(|| axis_position(y, false).zip(axis_position(x, true)))
            .map(|(x, y)| [x, y]),
        // Edge offsets are logical pixels; percentages in the four-value form
        // need a different reference box and are intentionally rejected.
        [edge_x, x, edge_y, y] => {
            let mut px = axis_position(edge_x, false)?;
            let mut py = axis_position(edge_y, true)?;
            let MaskLength::Pixels(x) = length(x)? else {
                return None;
            };
            let MaskLength::Pixels(y) = length(y)? else {
                return None;
            };
            if !matches!(*edge_x, "left" | "right") || !matches!(*edge_y, "top" | "bottom") {
                return None;
            }
            px.offset = if *edge_x == "right" { -x } else { x };
            py.offset = if *edge_y == "bottom" { -y } else { y };
            Some([px, py])
        }
        _ => None,
    }
}
fn parse_repeat(input: &str) -> Option<[MaskRepeat; 2]> {
    let axis = |s: &str| match s {
        "no-repeat" => Some(MaskRepeat::NoRepeat),
        "repeat" => Some(MaskRepeat::Repeat),
        "round" => Some(MaskRepeat::Round),
        "space" => Some(MaskRepeat::Space),
        _ => None,
    };
    match words(input)?.as_slice() {
        ["repeat-x"] => Some([MaskRepeat::Repeat, MaskRepeat::NoRepeat]),
        ["repeat-y"] => Some([MaskRepeat::NoRepeat, MaskRepeat::Repeat]),
        [one] => Some([axis(one)?; 2]),
        [x, y] => Some([axis(x)?, axis(y)?]),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn area() -> LogicalRect {
        LogicalRect {
            x: 50.0,
            y: 30.0,
            width: 200.0,
            height: 100.0,
        }
    }
    #[test]
    fn cover_contain_auto_and_percent_use_intrinsic_dimensions() {
        for (size, expected) in [
            ("cover", [50.0, -20.0, 200.0, 200.0]),
            ("contain", [100.0, 30.0, 100.0, 100.0]),
            ("auto", [110.0, 40.0, 80.0, 80.0]),
            ("50% 100%", [100.0, 30.0, 100.0, 100.0]),
            ("25px auto", [125.0, 55.0, 50.0, 50.0]),
        ] {
            let tile = MaskLayout::parse(None, Some(size), None).unwrap().resolve(
                area(),
                [40.0, 40.0],
                2.0,
            );
            assert_eq!(
                [
                    tile.bounds.x,
                    tile.bounds.y,
                    tile.bounds.width,
                    tile.bounds.height
                ],
                expected,
                "{size}"
            );
        }
    }
    #[test]
    fn repeat_space_round_and_edge_offsets_resolve_without_per_tile_geometry() {
        let tile = MaskLayout::parse(
            Some("right 10px bottom 5px"),
            Some("30px 20px"),
            Some("no-repeat"),
        )
        .unwrap()
        .resolve(area(), [40.0, 40.0], 2.0);
        assert_eq!([tile.bounds.x, tile.bounds.y], [170.0, 80.0]);
        let tile = MaskLayout::parse(None, Some("60px 30px"), Some("space round"))
            .unwrap()
            .resolve(area(), [40.0, 40.0], 1.0);
        assert_eq!(tile.bounds.x, 50.0);
        assert_eq!(tile.bounds.y, 65.0);
        assert_eq!(tile.period[0], 70.0);
        assert!((tile.bounds.height - 100.0 / 3.0).abs() < 1e-9);
        assert_eq!(tile.repeat, [true, true]);
    }
    #[test]
    fn rejects_nonfinite_or_unresolved_css() {
        for size in [
            "NaNpx",
            "-1px",
            "url(bad)",
            "calc(50% - 1px)",
            "10em",
            "1e99px",
        ] {
            assert!(MaskLayout::parse(None, Some(size), None).is_err());
        }
        assert!(MaskLayout::parse(Some("100px junk"), None, None).is_err());
        assert!(MaskLayout::parse(None, None, Some("invalid")).is_err());
    }
}
