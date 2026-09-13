use std::collections::BTreeMap;

use crate::render_graph::{RenderViewport, RoundedClip};
use crate::renderer::backend::NativeRenderSubmission;

use super::{WgpuNativeRenderBufferPlan, WgpuNativeRenderBufferVertex as Vertex};

impl WgpuNativeRenderBufferPlan {
    /// Clip the final geometry so images, glyphs, borders and fills obey the
    /// same ancestor shape. UVs and effect payloads survive edge interpolation.
    /// No extra render passes, textures or draw calls are introduced.
    pub(crate) fn apply_rounded_clips(&mut self, submission: &NativeRenderSubmission) {
        for pass in &mut self.passes {
            let Some(source) = submission
                .passes
                .iter()
                .find(|p| Some(p.plane) == pass.plane)
            else {
                continue;
            };
            let clips: BTreeMap<_, _> = source
                .batches
                .iter()
                .flat_map(|b| &b.commands)
                .filter(|c| !c.command.rounded_clips.is_empty())
                .map(|c| {
                    (
                        c.command.id.as_str(),
                        c.command
                            .rounded_clips
                            .iter()
                            .map(|clip| polygon(*clip, source.viewport))
                            .collect::<Vec<_>>(),
                    )
                })
                .collect();
            if clips.is_empty() {
                continue;
            }
            let old_vertices = std::mem::take(&mut pass.vertices);
            let old_indices = std::mem::take(&mut pass.indices);
            for draw in &mut pass.draw_calls {
                let vertices =
                    &old_vertices[draw.first_vertex as usize..][..draw.vertex_count as usize];
                let indices =
                    &old_indices[draw.first_index as usize..][..draw.index_count as usize];
                draw.first_vertex = pass.vertices.len() as u32;
                draw.first_index = pass.indices.len() as u32;
                if let Some(boundaries) = clips
                    .get(draw.command_id.as_str())
                    .or_else(|| {
                        clips
                            .iter()
                            .filter(|(id, _)| {
                                draw.command_id.strip_prefix(**id).is_some_and(|suffix| {
                                    suffix == ":label"
                                        || suffix == ":border"
                                        || suffix.starts_with(":border:")
                                })
                            })
                            .max_by_key(|(id, _)| id.len())
                            .map(|(_, clips)| clips)
                    })
                    .filter(|boundaries| {
                        !vertices
                            .iter()
                            .all(|v| boundaries.iter().all(|b| contains(b, v.position)))
                    })
                {
                    for triangle in indices.chunks_exact(3) {
                        let mut points = triangle
                            .iter()
                            .map(|i| vertices[*i as usize])
                            .collect::<Vec<_>>();
                        for boundary in boundaries {
                            points = intersect(points, boundary);
                            if points.len() < 3 {
                                break;
                            }
                        }
                        if points.len() < 3 {
                            continue;
                        }
                        let base = pass.vertices.len() as u32 - draw.first_vertex;
                        for i in 1..points.len() - 1 {
                            pass.indices
                                .extend([base, base + i as u32, base + i as u32 + 1]);
                        }
                        pass.vertices.extend(points);
                    }
                } else {
                    pass.vertices.extend_from_slice(vertices);
                    pass.indices.extend_from_slice(indices);
                }
                draw.vertex_count = pass.vertices.len() as u32 - draw.first_vertex;
                draw.index_count = pass.indices.len() as u32 - draw.first_index;
            }
            pass.vertex_count = pass.vertices.len();
            pass.index_count = pass.indices.len();
        }
        self.vertex_count = self.passes.iter().map(|p| p.vertex_count).sum();
        self.index_count = self.passes.iter().map(|p| p.index_count).sum();
    }
}

fn polygon(clip: RoundedClip, viewport: RenderViewport) -> Vec<[f32; 2]> {
    let b = clip.bounds;
    let radii = clip.resolved_radii();
    let r = radii.into_iter().fold(0.0, f64::max);
    // At most 64 segments per quarter, with <= 0.25 physical px chord error
    // for normal UI radii. This matches the bounded native rounded geometry.
    let physical_radius = r * viewport.physical_scale;
    let steps = if physical_radius <= 0.25 {
        1
    } else {
        (std::f64::consts::FRAC_PI_2 / (2.0 * (1.0 - 0.25 / physical_radius).acos()))
            .ceil()
            .clamp(1.0, 64.0) as usize
    };
    let mut points = Vec::new();
    for (cx, cy, start, r) in [
        (
            b.x + b.width - radii[1],
            b.y + radii[1],
            -std::f64::consts::FRAC_PI_2,
            radii[1],
        ),
        (
            b.x + b.width - radii[2],
            b.y + b.height - radii[2],
            0.0,
            radii[2],
        ),
        (
            b.x + radii[3],
            b.y + b.height - radii[3],
            std::f64::consts::FRAC_PI_2,
            radii[3],
        ),
        (
            b.x + radii[0],
            b.y + radii[0],
            std::f64::consts::PI,
            radii[0],
        ),
    ] {
        for step in 0..=steps {
            let a = start + std::f64::consts::FRAC_PI_2 * step as f64 / steps as f64;
            points.push([
                ((cx + r * a.cos()) * viewport.physical_scale
                    + viewport.viewport_x * viewport.device_pixel_ratio) as f32,
                ((cy + r * a.sin()) * viewport.physical_scale
                    + viewport.viewport_y * viewport.device_pixel_ratio) as f32,
            ]);
        }
    }
    points
}

fn contains(boundary: &[[f32; 2]], p: [f32; 2]) -> bool {
    (0..boundary.len()).all(|i| {
        let a = boundary[i];
        let b = boundary[(i + 1) % boundary.len()];
        (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0.0
    })
}

pub(super) fn intersect(mut points: Vec<Vertex>, boundary: &[[f32; 2]]) -> Vec<Vertex> {
    for i in 0..boundary.len() {
        if points.is_empty() {
            break;
        }
        let a = boundary[i];
        let b = boundary[(i + 1) % boundary.len()];
        let distance = |v: Vertex| {
            (b[0] - a[0]) * (v.position[1] - a[1]) - (b[1] - a[1]) * (v.position[0] - a[0])
        };
        let mut output = Vec::new();
        let mut previous = *points.last().unwrap();
        let mut previous_distance = distance(previous);
        for current in points {
            let current_distance = distance(current);
            if (previous_distance >= 0.0) != (current_distance >= 0.0) {
                let t = previous_distance / (previous_distance - current_distance);
                output.push(interpolate(previous, current, t));
            }
            if current_distance >= 0.0 {
                output.push(current);
            }
            previous = current;
            previous_distance = current_distance;
        }
        points = output;
    }
    points
}

fn interpolate(a: Vertex, b: Vertex, t: f32) -> Vertex {
    fn mix<const N: usize>(a: [f32; N], b: [f32; N], t: f32) -> [f32; N] {
        std::array::from_fn(|i| a[i] + (b[i] - a[i]) * t)
    }
    Vertex {
        position: mix(a.position, b.position, t),
        uv: mix(a.uv, b.uv, t),
        color: mix(a.color, b.color, t),
        effect0: mix(a.effect0, b.effect0, t),
        effect1: mix(a.effect1, b.effect1, t),
        effect2: mix(a.effect2, b.effect2, t),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clipped_vertices_preserve_texture_coordinates_and_effect_interpolation() {
        let vertices = vec![
            Vertex {
                position: [0.0, 0.0],
                uv: [0.0, 0.0],
                effect0: [0.0; 4],
                ..Default::default()
            },
            Vertex {
                position: [100.0, 0.0],
                uv: [1.0, 0.0],
                effect0: [1.0; 4],
                ..Default::default()
            },
            Vertex {
                position: [0.0, 100.0],
                uv: [0.0, 1.0],
                effect0: [0.0; 4],
                ..Default::default()
            },
        ];
        let clipped = intersect(
            vertices,
            &[[20.0, 20.0], [80.0, 20.0], [80.0, 80.0], [20.0, 80.0]],
        );
        assert!(clipped.len() >= 3);
        for vertex in clipped {
            assert!((vertex.uv[0] - vertex.position[0] / 100.0).abs() < 0.00001);
            assert!((vertex.uv[1] - vertex.position[1] / 100.0).abs() < 0.00001);
            assert!((vertex.effect0[0] - vertex.uv[0]).abs() < 0.00001);
        }
    }
}
