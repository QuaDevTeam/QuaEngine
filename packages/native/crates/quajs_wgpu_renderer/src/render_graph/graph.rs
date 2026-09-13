use crate::resources::{NativeResourceKind, ResourceId, ResourceMemory};
use crate::stage_layout::ResolvedStageLayout;

use super::command::{DrawCommand, RenderPlane};
use super::summary::{add_package_command, RenderGraphResourceSummary, RenderGraphSummary};

#[derive(Clone, Debug, PartialEq)]
pub struct RenderGraph {
    pub layout: ResolvedStageLayout,
    commands: Vec<DrawCommand>,
}

impl RenderGraph {
    pub fn new(layout: ResolvedStageLayout) -> Self {
        Self {
            layout,
            commands: Vec::new(),
        }
    }

    pub fn push(&mut self, command: DrawCommand) {
        self.commands.push(command);
        self.sort_commands();
    }

    pub fn extend<I>(&mut self, commands: I)
    where
        I: IntoIterator<Item = DrawCommand>,
    {
        self.commands.extend(commands);
        self.sort_commands();
    }

    pub fn commands(&self) -> &[DrawCommand] {
        &self.commands
    }

    pub(crate) fn commands_mut(&mut self) -> &mut [DrawCommand] {
        &mut self.commands
    }

    pub fn commands_for_plane(&self, plane: RenderPlane) -> impl Iterator<Item = &DrawCommand> {
        self.commands
            .iter()
            .filter(move |command| command.plane == plane)
    }

    pub fn hit_test(&self, x: f64, y: f64) -> Option<&DrawCommand> {
        let mut hit = None;

        for command in &self.commands {
            let (mut x, mut y) = (x, y);
            let mut visible = true;
            for group in &command.composite_groups {
                let [a, b, c, d, tx, ty] = group.transform;
                let det = a * d - b * c;
                if group.opacity <= 0.0 || det.abs() < 1e-12 {
                    visible = false;
                    break;
                }
                let (px, py) = (x - tx, y - ty);
                x = (d * px - c * py) / det;
                y = (-b * px + a * py) / det;
            }
            if visible
                && command.interactive
                && (super::command::RoundedClip {
                    bounds: command.bounds,
                    corner_radii: None,
                    radius: match &command.params {
                        super::style::DrawCommandParams::Panel(p) => p.corner_radius,
                        super::style::DrawCommandParams::UiButton(p) => p.corner_radius,
                        _ => 0.0,
                    },
                })
                .contains(x, y)
                && command.rounded_clips.iter().all(|clip| clip.contains(x, y))
                && command
                    .clip_bounds
                    .iter()
                    .all(|clip_bounds| rect_contains(*clip_bounds, x, y))
            {
                hit = Some(command);
            }
        }

        hit
    }

    pub fn summary(&self) -> RenderGraphSummary {
        let mut summary = RenderGraphSummary {
            command_count: self.commands.len(),
            ..Default::default()
        };

        for plane in RenderPlane::ORDERED {
            summary.by_plane.entry(plane).or_default();
        }

        for command in &self.commands {
            if command.interactive {
                summary.interactive_count += 1;
            }

            let plane_summary = summary.by_plane.entry(command.plane).or_default();
            plane_summary.command_count += 1;
            plane_summary.resource_ref_count += command.resource_ids.len();
            if command.interactive {
                plane_summary.interactive_count += 1;
            }

            if let Some(owner_package_id) = &command.owner_package_id {
                add_package_command(
                    summary
                        .by_package
                        .entry(owner_package_id.clone())
                        .or_default(),
                    command,
                );
            }
            for package_id in &command.required_package_ids {
                add_package_command(
                    summary.by_package.entry(package_id.clone()).or_default(),
                    command,
                );
            }

            summary
                .resources
                .referenced_resource_ids
                .extend(command.resource_ids.iter().cloned());
        }

        summary
    }

    pub fn estimate_resource_use<I>(&self, resources: I) -> RenderGraphResourceSummary
    where
        I: IntoIterator<Item = (ResourceId, NativeResourceKind, ResourceMemory)>,
    {
        let referenced = self.summary().resources.referenced_resource_ids;
        let mut summary = RenderGraphResourceSummary {
            referenced_resource_ids: referenced.clone(),
            ..Default::default()
        };

        for (id, kind, memory) in resources {
            if !referenced.contains(&id) {
                continue;
            }

            *summary.by_kind.entry(kind).or_default() += 1;
            summary.estimated_memory.cpu_bytes = summary
                .estimated_memory
                .cpu_bytes
                .saturating_add(memory.cpu_bytes);
            summary.estimated_memory.gpu_bytes = summary
                .estimated_memory
                .gpu_bytes
                .saturating_add(memory.gpu_bytes);
        }

        summary
    }

    pub(crate) fn sort_commands(&mut self) {
        // A stacking context paints atomically at its parent's z position.
        // Within it, preserve ordinary z ordering and insertion order.
        let mut order = std::collections::BTreeMap::new();
        for (index, command) in self.commands.iter().enumerate() {
            for group in &command.composite_groups {
                order.entry(group.id.clone()).or_insert(index);
            }
            order.entry(command.id.clone()).or_insert(index);
        }
        self.commands.sort_by_cached_key(|command| {
            let mut path = command
                .composite_groups
                .iter()
                .map(|g| (g.z_index, order[&g.id]))
                .collect::<Vec<_>>();
            path.push((command.z_index, order[&command.id]));
            (
                command.plane.z_base().saturating_add(path[0].0),
                command.plane,
                path,
            )
        });
    }
}

fn rect_contains(rect: super::command::LogicalRect, x: f64, y: f64) -> bool {
    x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height
}
