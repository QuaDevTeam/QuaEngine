use super::super::super::{
    InMemoryWgpuNativeRenderRuntimeExecutor, RealWgpuDecodedTextureMetadata,
    RealWgpuDecodedTextureRgba8, RealWgpuNativeRenderRuntimeDevice, WgpuNativeRenderBackend,
    WgpuNativeRenderRuntimeError,
};
use super::super::WgpuNativeRenderDecodedTextureCleanupReport;
use crate::renderer::{
    NativeRendererFrameUpdate, NativeRendererHostCleanupRecord, NativeRendererPackageRelease,
};
use crate::resources::{NativeResourceKind, ResourceId};

impl
    WgpuNativeRenderBackend<
        InMemoryWgpuNativeRenderRuntimeExecutor<RealWgpuNativeRenderRuntimeDevice>,
    >
{
    pub fn upload_decoded_texture_rgba8(
        &mut self,
        resource_id: impl Into<String>,
        decoded: RealWgpuDecodedTextureRgba8,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        self.upload_decoded_texture_rgba8_with_metadata(
            resource_id,
            decoded,
            RealWgpuDecodedTextureMetadata::default(),
        )
    }

    pub fn upload_decoded_texture_rgba8_with_metadata(
        &mut self,
        resource_id: impl Into<String>,
        decoded: RealWgpuDecodedTextureRgba8,
        metadata: RealWgpuDecodedTextureMetadata,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        let resource_id = resource_id.into();
        self.runtime_executor_mut()
            .device_mut()
            .upload_decoded_texture_rgba8_with_metadata(resource_id.clone(), decoded, metadata)?;
        self.invalidate_texture_sampler_cache_entries_for_resource(&resource_id);
        Ok(())
    }

    #[cfg(feature = "image-decode")]
    pub fn upload_image_texture_bytes(
        &mut self,
        resource_id: impl Into<String>,
        encoded_image: impl AsRef<[u8]>,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        self.upload_image_texture_bytes_with_metadata(
            resource_id,
            encoded_image,
            RealWgpuDecodedTextureMetadata::default(),
        )
    }

    #[cfg(feature = "image-decode")]
    pub fn upload_image_texture_bytes_with_metadata(
        &mut self,
        resource_id: impl Into<String>,
        encoded_image: impl AsRef<[u8]>,
        metadata: RealWgpuDecodedTextureMetadata,
    ) -> Result<(), WgpuNativeRenderRuntimeError> {
        let resource_id = resource_id.into();
        self.runtime_executor_mut()
            .device_mut()
            .upload_image_texture_bytes_with_metadata(
                resource_id.clone(),
                encoded_image,
                metadata,
            )?;
        self.invalidate_texture_sampler_cache_entries_for_resource(&resource_id);
        Ok(())
    }

    pub fn release_decoded_texture(&mut self, resource_id: &str) -> bool {
        let released = self
            .runtime_executor_mut()
            .device_mut()
            .release_decoded_texture(resource_id);
        if released {
            self.invalidate_texture_sampler_cache_entries_for_resource(resource_id);
        }
        released
    }

    pub fn release_decoded_textures_for_package(&mut self, package_id: &str) -> usize {
        let resource_ids = self
            .runtime_executor()
            .device()
            .decoded_texture_resource_ids_for_package(package_id);
        let released = self
            .runtime_executor_mut()
            .device_mut()
            .release_decoded_textures_for_package(package_id);
        for resource_id in resource_ids {
            self.invalidate_texture_sampler_cache_entries_for_resource(&resource_id);
        }
        released
    }

    pub fn release_decoded_textures_for_host_cleanup(
        &mut self,
        cleanup: &[NativeRendererHostCleanupRecord],
    ) -> WgpuNativeRenderDecodedTextureCleanupReport {
        let mut report = WgpuNativeRenderDecodedTextureCleanupReport::default();
        for record in cleanup {
            if !is_decoded_texture_cleanup_kind(record.kind) {
                report.ignored_resource_ids.push(record.resource_id.clone());
                continue;
            }

            if self.release_decoded_texture(record.resource_id.as_str()) {
                report
                    .released_resource_ids
                    .push(record.resource_id.clone());
            } else {
                report.missing_resource_ids.push(record.resource_id.clone());
            }
        }
        report
    }

    pub fn release_decoded_textures_for_frame_update(
        &mut self,
        update: &NativeRendererFrameUpdate,
    ) -> WgpuNativeRenderDecodedTextureCleanupReport {
        self.release_decoded_textures_for_host_cleanup(&update.host_cleanup)
    }

    pub fn release_decoded_textures_for_package_release(
        &mut self,
        release: &NativeRendererPackageRelease,
    ) -> WgpuNativeRenderDecodedTextureCleanupReport {
        let mut report = self.release_decoded_textures_for_host_cleanup(&release.host_cleanup);
        if release.plan.can_unload() {
            self.release_decoded_textures_for_package_into_report(
                &release.plan.package_id,
                &mut report,
            );
        }
        report
    }

    pub fn decoded_texture_resource_count(&self) -> usize {
        self.runtime_executor()
            .device()
            .decoded_texture_resource_count()
    }

    fn release_decoded_textures_for_package_into_report(
        &mut self,
        package_id: &str,
        report: &mut WgpuNativeRenderDecodedTextureCleanupReport,
    ) {
        let resource_ids = self
            .runtime_executor()
            .device()
            .decoded_texture_resource_ids_for_package(package_id);
        for resource_id in resource_ids {
            if self.release_decoded_texture(&resource_id) {
                report
                    .released_resource_ids
                    .push(ResourceId::from(resource_id));
            } else {
                report
                    .missing_resource_ids
                    .push(ResourceId::from(resource_id));
            }
        }
    }
}

fn is_decoded_texture_cleanup_kind(kind: NativeResourceKind) -> bool {
    matches!(
        kind,
        NativeResourceKind::Texture
            | NativeResourceKind::DecodedImage
            | NativeResourceKind::VideoTextureRing
    )
}
