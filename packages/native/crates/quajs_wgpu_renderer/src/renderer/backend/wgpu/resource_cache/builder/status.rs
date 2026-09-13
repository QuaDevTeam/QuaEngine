use super::super::{
    WgpuNativeRenderCacheEntryStatus, WgpuNativeRenderCachedBindGroup,
    WgpuNativeRenderCachedBuffer, WgpuNativeRenderCachedPipeline,
};

pub(super) fn count_status<T>(entries: &[T], status: WgpuNativeRenderCacheEntryStatus) -> usize
where
    T: CacheEntryStatus,
{
    entries
        .iter()
        .filter(|entry| entry.status() == status)
        .count()
}

pub(super) trait CacheEntryStatus {
    fn status(&self) -> WgpuNativeRenderCacheEntryStatus;
}

impl CacheEntryStatus for WgpuNativeRenderCachedBuffer {
    fn status(&self) -> WgpuNativeRenderCacheEntryStatus {
        self.status
    }
}

impl CacheEntryStatus for WgpuNativeRenderCachedPipeline {
    fn status(&self) -> WgpuNativeRenderCacheEntryStatus {
        self.status
    }
}

impl CacheEntryStatus for WgpuNativeRenderCachedBindGroup {
    fn status(&self) -> WgpuNativeRenderCacheEntryStatus {
        self.status
    }
}
