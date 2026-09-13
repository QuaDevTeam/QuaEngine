use std::collections::{BTreeMap, BTreeSet};

use crate::render_graph::{DrawBatchPipeline, DrawCommandKind, RenderGraph, RenderPlane};
use crate::resources::{
    infer_resource_kind, is_missing_resource_kind_draw_blocking, NativeResourceKind, ResourceId,
};

use super::super::NativeRenderPassSubmission;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRenderMissingResource {
    pub resource_id: ResourceId,
    pub plane: RenderPlane,
    pub pipeline: DrawBatchPipeline,
    pub kind: DrawCommandKind,
    pub command_ids: Vec<String>,
    pub owner_package_ids: BTreeSet<String>,
    pub required_package_ids: BTreeSet<String>,
}

impl NativeRenderMissingResource {
    pub fn resource_kind(&self) -> NativeResourceKind {
        infer_resource_kind(&self.resource_id, self.kind)
    }
}

pub(in crate::renderer::backend::submission) fn collect_missing_resources(
    passes: &[NativeRenderPassSubmission],
    graph: &RenderGraph,
) -> Vec<NativeRenderMissingResource> {
    let package_provenance = MissingResourcePackageProvenance::from_graph(graph);
    passes
        .iter()
        .flat_map(|pass| {
            pass.batches.iter().flat_map(|batch| {
                batch
                    .missing_resource_ids
                    .iter()
                    .filter(|resource_id| {
                        is_missing_resource_kind_draw_blocking(infer_resource_kind(
                            resource_id,
                            batch.kind,
                        ))
                    })
                    .cloned()
                    .map(|resource_id| {
                        let provenance = package_provenance.for_command_ids(&batch.command_ids);
                        NativeRenderMissingResource {
                            resource_id,
                            plane: pass.plane,
                            pipeline: batch.pipeline,
                            kind: batch.kind,
                            command_ids: batch.command_ids.clone(),
                            owner_package_ids: provenance.owner_package_ids,
                            required_package_ids: provenance.required_package_ids,
                        }
                    })
            })
        })
        .collect()
}

#[derive(Clone, Debug, Default)]
struct MissingResourcePackageProvenance {
    by_command_id: BTreeMap<String, MissingResourcePackageIds>,
}

impl MissingResourcePackageProvenance {
    fn from_graph(graph: &RenderGraph) -> Self {
        Self {
            by_command_id: graph
                .commands()
                .iter()
                .map(|command| {
                    (
                        command.id.clone(),
                        MissingResourcePackageIds {
                            owner_package_ids: command.owner_package_id.iter().cloned().collect(),
                            required_package_ids: command.required_package_ids.clone(),
                        },
                    )
                })
                .collect(),
        }
    }

    fn for_command_ids(&self, command_ids: &[String]) -> MissingResourcePackageIds {
        let mut ids = MissingResourcePackageIds::default();
        for command_id in command_ids {
            if let Some(command_ids) = self.by_command_id.get(command_id) {
                ids.owner_package_ids
                    .extend(command_ids.owner_package_ids.iter().cloned());
                ids.required_package_ids
                    .extend(command_ids.required_package_ids.iter().cloned());
            }
        }
        ids
    }
}

#[derive(Clone, Debug, Default)]
struct MissingResourcePackageIds {
    owner_package_ids: BTreeSet<String>,
    required_package_ids: BTreeSet<String>,
}
