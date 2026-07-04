use super::*;
use crate::resources::{
    NativeResourceKind, NativeResourceLedger, NativeResourceRecord, ResourceId,
};

#[test]
fn summarizes_resolved_submission_resource_memory() {
    let frame = frame_with_background();
    let mut resources = NativeResourceLedger::new();
    resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("images:bg/school.png"),
            NativeResourceKind::Texture,
        )
        .owned_by("base")
        .require_package("runtime.ui")
        .memory(512, 4096),
    );
    resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("images:unused.png"),
            NativeResourceKind::Texture,
        )
        .memory(1024, 8192),
    );
    let submission = NativeRenderFrameRef {
        revision: 9,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    assert_eq!(submission.resource_count, 2);
    assert_eq!(submission.missing_resource_count, 0);
    assert!(submission.missing_resources.is_empty());
    assert_eq!(submission.resolved_resource_memory.total.cpu_bytes, 512);
    assert_eq!(submission.resolved_resource_memory.total.gpu_bytes, 4096);
    assert_eq!(
        submission.resolved_resource_memory.by_kind[&NativeResourceKind::Texture].gpu_bytes,
        4096
    );
    assert_eq!(
        submission.resolved_resource_memory.by_owner_package["base"].cpu_bytes,
        512
    );
    assert_eq!(
        submission.resolved_resource_memory.by_required_package["runtime.ui"].gpu_bytes,
        4096
    );
    assert_ne!(submission.resolved_resource_memory.total.cpu_bytes, 1536);
    assert_ne!(submission.resolved_resource_memory.total.gpu_bytes, 12288);
    assert_eq!(submission.passes[0].resolved_resource_count, 1);
    assert_eq!(submission.passes[0].missing_resource_count, 0);
    assert_eq!(
        submission.passes[0]
            .resolved_resource_memory
            .total
            .cpu_bytes,
        512
    );
    assert_eq!(
        submission.passes[0]
            .resolved_resource_memory
            .total
            .gpu_bytes,
        4096
    );
    assert_eq!(
        submission.passes[0]
            .resolved_resource_memory
            .by_owner_package["base"]
            .gpu_bytes,
        4096
    );
    assert_eq!(
        submission.passes[0].batches[0].resolved_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(
        submission.passes[0].batches[0]
            .resolved_resource_memory
            .total
            .cpu_bytes,
        512
    );
    assert_eq!(
        submission.passes[0].batches[0]
            .resolved_resource_memory
            .total
            .gpu_bytes,
        4096
    );
    assert_eq!(
        submission.passes[0].batches[0]
            .resolved_resource_memory
            .by_required_package["runtime.ui"]
            .cpu_bytes,
        512
    );
}
