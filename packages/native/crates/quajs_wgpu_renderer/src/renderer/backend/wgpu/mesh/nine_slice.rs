use crate::render_graph::NineSliceDrawParams;

use super::quad::WgpuNativeRenderQuad;

/// One logical draw may lower to several texture quads. The source texture is
/// still loaded/bound once; corners retain their texels as the panel resizes.
pub(super) fn slice_quads(
    base: WgpuNativeRenderQuad,
    source_size: (u32, u32),
    logical_size: (f64, f64),
    slice: NineSliceDrawParams,
) -> Vec<WgpuNativeRenderQuad> {
    let (sw, sh) = (source_size.0 as f64, source_size.1 as f64);
    let (w, h) = logical_size;
    if sw <= 0.0 || sh <= 0.0 || w <= 0.0 || h <= 0.0 {
        return vec![];
    }
    let [st, sr, sb, sl] = slice.slice;
    let [mut t, mut r, mut b, mut l] = slice.width;
    let factor = (w / (l + r).max(f64::EPSILON))
        .min(h / (t + b).max(f64::EPSILON))
        .min(1.0);
    t *= factor;
    r *= factor;
    b *= factor;
    l *= factor;
    let sx = [0.0, sl.min(sw), (sw - sr).max(0.0), sw];
    let sy = [0.0, st.min(sh), (sh - sb).max(0.0), sh];
    let dx = [0.0, l, w - r, w];
    let dy = [0.0, t, h - b, h];
    let mut quads = Vec::new();
    for row in 0..3 {
        for col in 0..3 {
            if row == 1 && col == 1 && !slice.fill {
                continue;
            }
            let source_w = sx[col + 1] - sx[col];
            let source_h = sy[row + 1] - sy[row];
            let draw_w = dx[col + 1] - dx[col];
            let draw_h = dy[row + 1] - dy[row];
            if source_w <= 0.0 || source_h <= 0.0 || draw_w <= 0.0 || draw_h <= 0.0 {
                continue;
            }
            let xscale = if row != 1 {
                draw_h / source_h
            } else if st > 0.0 {
                t / st
            } else {
                1.0
            };
            let yscale = if col != 1 {
                draw_w / source_w
            } else if sl > 0.0 {
                l / sl
            } else {
                1.0
            };
            let mut xs = tiles(
                dx[col],
                draw_w,
                sx[col],
                source_w,
                slice.repeat && col == 1,
                xscale,
            );
            let mut ys = tiles(
                dy[row],
                draw_h,
                sy[row],
                source_h,
                slice.repeat && row == 1,
                yscale,
            );
            // Bound mesh growth for pathological one-texel tiles over huge
            // authored panels. Ordinary skin assets stay far below this limit.
            if xs.len() * ys.len() + quads.len() > 4096 {
                xs = tiles(dx[col], draw_w, sx[col], source_w, false, 1.0);
                ys = tiles(dy[row], draw_h, sy[row], source_h, false, 1.0);
            }
            for &(x0, x1, u0, u1) in &xs {
                for &(y0, y1, v0, v1) in &ys {
                    let mut quad = base.clone();
                    // Isolate the slice from adjacent atlas texels under
                    // bilinear filtering, including repeated tile seams.
                    quad.effect2 = [
                        ((sx[col] + source_w.min(1.0) / 2.0) / sw) as f32,
                        ((sy[row] + source_h.min(1.0) / 2.0) / sh) as f32,
                        ((sx[col + 1] - source_w.min(1.0) / 2.0) / sw) as f32,
                        ((sy[row + 1] - source_h.min(1.0) / 2.0) / sh) as f32,
                    ];
                    for (vertex, (x, y, u, v)) in quad.vertices.iter_mut().zip([
                        (x0, y0, u0, v0),
                        (x1, y0, u1, v0),
                        (x1, y1, u1, v1),
                        (x0, y1, u0, v1),
                    ]) {
                        // Bilinear mapping also preserves a rotated parent quad.
                        let a = base.vertices[0].position;
                        let bx = base.vertices[1].position;
                        let by = base.vertices[3].position;
                        vertex.position = [
                            a[0] + (bx[0] - a[0]) * (x / w) as f32
                                + (by[0] - a[0]) * (y / h) as f32,
                            a[1] + (bx[1] - a[1]) * (x / w) as f32
                                + (by[1] - a[1]) * (y / h) as f32,
                        ];
                        vertex.uv = [(u / sw) as f32, (v / sh) as f32];
                    }
                    quads.push(quad);
                }
            }
        }
    }
    quads
}

fn tiles(
    start: f64,
    length: f64,
    source: f64,
    source_length: f64,
    repeat: bool,
    scale: f64,
) -> Vec<(f64, f64, f64, f64)> {
    let tile = source_length * scale;
    if !repeat || tile <= 0.0 || !tile.is_finite() || length / tile > 4096.0 {
        return vec![(start, start + length, source, source + source_length)];
    }
    // CSS repeat centers a whole tile, clipping matching partial tiles at the ends.
    let middle = start + length / 2.0;
    let first = middle - tile / 2.0 - ((length - tile) / (2.0 * tile)).ceil().max(0.0) * tile;
    let count = ((start + length - first) / tile).ceil() as usize;
    (0..count)
        .filter_map(|i| {
            let origin = first + i as f64 * tile;
            let a = origin.max(start);
            let b = (origin + tile).min(start + length);
            (b > a).then_some((
                a,
                b,
                source + (a - origin) / scale,
                source + (b - origin) / scale,
            ))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::tiles;
    #[test]
    fn repeated_edges_center_and_crop_partial_tiles() {
        assert_eq!(
            tiles(10.0, 50.0, 20.0, 20.0, true, 1.0),
            vec![
                (10.0, 25.0, 25.0, 40.0),
                (25.0, 45.0, 20.0, 40.0),
                (45.0, 60.0, 20.0, 35.0)
            ]
        );
    }
}
