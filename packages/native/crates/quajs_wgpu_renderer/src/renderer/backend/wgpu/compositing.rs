use super::{WgpuNativeRenderRuntimeOperation, WgpuNativeRenderRuntimePlan};
use crate::render_graph::DrawCompositeGroup;
use crate::renderer::backend::NativeRenderSubmission;
use std::collections::BTreeMap;

fn groups(submission: &NativeRenderSubmission) -> BTreeMap<&str, &[DrawCompositeGroup]> {
    submission
        .passes
        .iter()
        .flat_map(|p| &p.batches)
        .flat_map(|b| &b.commands)
        .filter(|c| !c.command.composite_groups.is_empty())
        .map(|c| (c.command.id.as_str(), c.command.composite_groups.as_slice()))
        .collect()
}

fn lookup<'a>(
    groups: &BTreeMap<&str, &'a [DrawCompositeGroup]>,
    id: &str,
) -> Option<&'a [DrawCompositeGroup]> {
    groups.get(id).copied().or_else(|| {
        groups
            .iter()
            .filter(|(key, _)| {
                id.strip_prefix(**key)
                    .is_some_and(|s| s == ":label" || s == ":border" || s.starts_with(":border:"))
            })
            .max_by_key(|(key, _)| key.len())
            .map(|(_, g)| *g)
    })
}

impl WgpuNativeRenderRuntimePlan {
    pub(super) fn attach_composite_groups(&mut self, submission: &NativeRenderSubmission) {
        let groups = groups(submission);
        let viewport = submission.passes.first().map(|p| p.viewport);
        let scale = submission
            .passes
            .first()
            .map_or(1.0, |p| p.viewport.physical_scale);
        for operation in &self.operations {
            if let WgpuNativeRenderRuntimeOperation::DrawIndexed { command_id, .. } = operation {
                if let Some(groups) = lookup(&groups, command_id) {
                    self.composite_groups.insert(
                        command_id.clone(),
                        groups
                            .iter()
                            .cloned()
                            .map(|mut g| {
                                let [a, b, c, d, tx, ty] = g.transform;
                                let ox =
                                    viewport.map_or(0.0, |v| v.viewport_x * v.device_pixel_ratio);
                                let oy =
                                    viewport.map_or(0.0, |v| v.viewport_y * v.device_pixel_ratio);
                                g.transform = [
                                    a,
                                    b,
                                    c,
                                    d,
                                    tx * scale + ox - a * ox - c * oy,
                                    ty * scale + oy - b * ox - d * oy,
                                ];
                                g.blur_radius *= scale;
                                if let Some(shadow) = &mut g.drop_shadow {
                                    shadow.sigma *= scale;
                                    shadow.offset = shadow.offset.map(|n| n * scale);
                                }
                                g.mask_scale *= scale;
                                if let Some(bounds) = &mut g.mask_bounds {
                                    bounds.x = bounds.x * scale
                                        + viewport
                                            .map_or(0.0, |v| v.viewport_x * v.device_pixel_ratio);
                                    bounds.y = bounds.y * scale
                                        + viewport
                                            .map_or(0.0, |v| v.viewport_y * v.device_pixel_ratio);
                                    bounds.width *= scale;
                                    bounds.height *= scale;
                                }
                                g
                            })
                            .collect(),
                    );
                }
            }
        }
    }
}
