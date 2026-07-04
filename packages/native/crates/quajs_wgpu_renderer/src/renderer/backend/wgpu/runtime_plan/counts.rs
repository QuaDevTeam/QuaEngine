use super::WgpuNativeRenderRuntimeOperation;

pub(super) fn cache_operation_count(operations: &[WgpuNativeRenderRuntimeOperation]) -> usize {
    operations
        .iter()
        .filter(|operation| {
            matches!(
                operation,
                WgpuNativeRenderRuntimeOperation::CreateBuffer { .. }
                    | WgpuNativeRenderRuntimeOperation::ReuseBuffer { .. }
                    | WgpuNativeRenderRuntimeOperation::RecreateBuffer { .. }
                    | WgpuNativeRenderRuntimeOperation::CreatePipeline { .. }
                    | WgpuNativeRenderRuntimeOperation::ReusePipeline { .. }
                    | WgpuNativeRenderRuntimeOperation::RecreatePipeline { .. }
                    | WgpuNativeRenderRuntimeOperation::CreateBindGroup { .. }
                    | WgpuNativeRenderRuntimeOperation::ReuseBindGroup { .. }
                    | WgpuNativeRenderRuntimeOperation::RecreateBindGroup { .. }
            )
        })
        .count()
}

pub(super) fn release_operation_count(operations: &[WgpuNativeRenderRuntimeOperation]) -> usize {
    operations
        .iter()
        .filter(|operation| {
            matches!(
                operation,
                WgpuNativeRenderRuntimeOperation::ReleaseBuffer { .. }
                    | WgpuNativeRenderRuntimeOperation::ReleasePipeline { .. }
                    | WgpuNativeRenderRuntimeOperation::ReleaseBindGroup { .. }
            )
        })
        .count()
}
