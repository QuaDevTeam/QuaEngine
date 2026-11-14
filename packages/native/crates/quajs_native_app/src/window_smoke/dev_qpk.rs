use super::error::NativeWindowSmokeError;
use quajs_native_runtime::InMemoryNativeHostApi;
pub(super) fn mount_native_dev_qpk(
    host: InMemoryNativeHostApi,
    path: std::ffi::OsString,
) -> Result<InMemoryNativeHostApi, NativeWindowSmokeError> {
    crate::qpk::mount_native_dev_qpk(host, path)
        .map_err(|e| NativeWindowSmokeError::new(e.to_string()))
}
pub(super) fn mount_qpk_bytes(
    host: InMemoryNativeHostApi,
    bytes: &[u8],
) -> Result<InMemoryNativeHostApi, NativeWindowSmokeError> {
    crate::qpk::mount_qpk_bytes(host, bytes).map_err(|e| NativeWindowSmokeError::new(e.to_string()))
}
