use std::collections::BTreeSet;
use std::ffi::OsString;
use std::path::Path;

use quajs_native_runtime::{InMemoryNativeHostApi, NativeMountedBundleInfo};
use serde_json::Value;

#[derive(Debug)]
pub(crate) struct NativeQpkError(String);
impl NativeQpkError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}
impl std::fmt::Display for NativeQpkError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for NativeQpkError {}
use crate::host_assets::validate_package_relative_asset_name;

const QPK_HEADER_SIZE: usize = 32;
const QPK_VERSION: u32 = 1;
const QPK_MAGIC: &[u8; 4] = b"QPK\0";
const QPK_MAX_BYTES: u64 = 1024 * 1024 * 1024;

#[derive(Debug)]
struct NativeDevQpk {
    texture_suffix: Option<&'static str>,
    bundle: NativeMountedBundleInfo,
    assets: Vec<(String, Vec<u8>)>,
}

pub(crate) fn mount_native_dev_qpk(
    host: InMemoryNativeHostApi,
    path: OsString,
) -> Result<InMemoryNativeHostApi, NativeQpkError> {
    let path = Path::new(&path);
    if path.extension().and_then(|value| value.to_str()) != Some("qpk") {
        return Err(dev_qpk_error(format!(
            "Native renderer dev asset bundle must be a .qpk file: {}.",
            path.display()
        )));
    }
    let metadata = std::fs::metadata(path).map_err(|error| {
        dev_qpk_error(format!(
            "Failed to inspect native renderer dev QPK \"{}\": {error}.",
            path.display()
        ))
    })?;
    if metadata.len() > QPK_MAX_BYTES {
        return Err(dev_qpk_error(format!(
            "Native renderer dev QPK \"{}\" exceeds the {} byte development limit.",
            path.display(),
            QPK_MAX_BYTES
        )));
    }
    let bytes = std::fs::read(path).map_err(|error| {
        dev_qpk_error(format!(
            "Failed to read native renderer dev QPK \"{}\": {error}.",
            path.display()
        ))
    })?;
    mount_qpk_bytes(host, &bytes)
}

pub(crate) fn mount_qpk_bytes(
    host: InMemoryNativeHostApi,
    bytes: &[u8],
) -> Result<InMemoryNativeHostApi, NativeQpkError> {
    let qpk = parse_native_dev_qpk(bytes)?;
    Ok(host.with_bundle_assets(qpk.bundle, qpk.assets, qpk.texture_suffix))
}

fn parse_native_dev_qpk(bytes: &[u8]) -> Result<NativeDevQpk, NativeQpkError> {
    if bytes.len() < QPK_HEADER_SIZE || &bytes[0..4] != QPK_MAGIC {
        return Err(dev_qpk_error(
            "Native renderer dev QPK has an invalid header.",
        ));
    }
    if read_u32(bytes, 4)? != QPK_VERSION {
        return Err(dev_qpk_error(
            "Native renderer dev QPK uses an unsupported version.",
        ));
    }
    let flags = read_u32(bytes, 8)?;
    if flags != 0 {
        return Err(dev_qpk_error(
            "Native renderer dev QPK must use uncompressed, unencrypted development assets.",
        ));
    }
    if read_u32(bytes, 12)? as usize != QPK_HEADER_SIZE {
        return Err(dev_qpk_error(
            "Native renderer dev QPK has an invalid header size.",
        ));
    }
    let manifest_offset = usize::try_from(read_u64(bytes, 16)?)
        .map_err(|_| dev_qpk_error("Native renderer dev QPK manifest offset is too large."))?;
    let manifest_size = usize::try_from(read_u64(bytes, 24)?)
        .map_err(|_| dev_qpk_error("Native renderer dev QPK manifest size is too large."))?;
    let manifest_end = manifest_offset
        .checked_add(manifest_size)
        .filter(|end| *end <= bytes.len())
        .ok_or_else(|| dev_qpk_error("Native renderer dev QPK manifest is out of bounds."))?;

    let mut offset = QPK_HEADER_SIZE;
    let mut names = BTreeSet::new();
    let mut assets = Vec::new();
    while offset < manifest_offset {
        let path_len = read_u32(bytes, offset)? as usize;
        offset = offset
            .checked_add(4)
            .ok_or_else(|| dev_qpk_error("Native renderer dev QPK asset offset overflowed."))?;
        let path_end = offset
            .checked_add(path_len)
            .filter(|end| *end <= manifest_offset)
            .ok_or_else(|| dev_qpk_error("Native renderer dev QPK asset path is out of bounds."))?;
        let asset_name = std::str::from_utf8(&bytes[offset..path_end])
            .map_err(|_| dev_qpk_error("Native renderer dev QPK asset path is not UTF-8."))?
            .to_string();
        validate_package_relative_asset_name("QPK", &asset_name).map_err(dev_qpk_error)?;
        if !names.insert(asset_name.clone()) {
            return Err(dev_qpk_error(format!(
                "Native renderer dev QPK contains duplicate asset \"{asset_name}\"."
            )));
        }
        offset = path_end;
        let data_len = read_u32(bytes, offset)? as usize;
        offset = offset
            .checked_add(4)
            .ok_or_else(|| dev_qpk_error("Native renderer dev QPK data offset overflowed."))?;
        let data_end = offset
            .checked_add(data_len)
            .filter(|end| *end <= manifest_offset)
            .ok_or_else(|| dev_qpk_error("Native renderer dev QPK asset data is out of bounds."))?;
        assets.push((asset_name, bytes[offset..data_end].to_vec()));
        offset = data_end;
    }
    if offset != manifest_offset {
        return Err(dev_qpk_error(
            "Native renderer dev QPK asset section is malformed.",
        ));
    }

    let manifest: Value =
        serde_json::from_slice(&bytes[manifest_offset..manifest_end]).map_err(|error| {
            dev_qpk_error(format!(
                "Native renderer dev QPK manifest is invalid: {error}."
            ))
        })?;
    let name = manifest
        .pointer("/workspaceBundle/name")
        .or_else(|| manifest.get("name"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("native-dev")
        .to_string();
    let runtime_package_id = manifest
        .pointer("/runtimePackage/id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let version = manifest
        .get("bundleVersion")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok());
    let hash = manifest
        .get("merkleRoot")
        .and_then(Value::as_str)
        .map(str::to_string);

    let texture_suffix = match (
        manifest
            .pointer("/assetTarget/platform")
            .and_then(Value::as_str),
        manifest
            .pointer("/assetTarget/nativeTextureFormat")
            .and_then(Value::as_str),
    ) {
        (Some("native"), Some("astc")) => Some(".qua-astc"),
        (Some("native"), Some("bc7")) => Some(".qua-bc7"),
        _ => None,
    };
    Ok(NativeDevQpk {
        texture_suffix,
        bundle: NativeMountedBundleInfo {
            name: format!("{name}-native-dev"),
            logical_name: Some(name),
            version,
            hash,
            runtime_package_id,
        },
        assets,
    })
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, NativeQpkError> {
    let end = offset
        .checked_add(4)
        .filter(|end| *end <= bytes.len())
        .ok_or_else(|| dev_qpk_error("Native renderer dev QPK ended unexpectedly."))?;
    Ok(u32::from_le_bytes(bytes[offset..end].try_into().unwrap()))
}

fn read_u64(bytes: &[u8], offset: usize) -> Result<u64, NativeQpkError> {
    let end = offset
        .checked_add(8)
        .filter(|end| *end <= bytes.len())
        .ok_or_else(|| dev_qpk_error("Native renderer dev QPK ended unexpectedly."))?;
    Ok(u64::from_le_bytes(bytes[offset..end].try_into().unwrap()))
}

fn dev_qpk_error(message: impl Into<String>) -> NativeQpkError {
    NativeQpkError::new(message.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_uncompressed_qpk_assets_for_native_dev() {
        let qpk = qpk_bytes(
            &[("images/backgrounds/city.png", &[1, 2, 3, 4])],
            serde_json::json!({
                "name": "demo",
                "bundleVersion": 7,
                "format": "qpk"
            }),
        );

        let parsed = parse_native_dev_qpk(&qpk).expect("development QPK should parse");

        assert_eq!(parsed.bundle.name, "demo-native-dev");
        assert_eq!(parsed.bundle.logical_name.as_deref(), Some("demo"));
        assert_eq!(parsed.bundle.version, Some(7));
        assert_eq!(parsed.assets[0].0, "images/backgrounds/city.png");
        assert_eq!(parsed.assets[0].1, vec![1, 2, 3, 4]);
    }

    #[test]
    fn rejects_compressed_or_unsafe_native_dev_qpk_assets() {
        let mut compressed = qpk_bytes(&[], serde_json::json!({ "name": "demo" }));
        compressed[8..12].copy_from_slice(&1u32.to_le_bytes());
        assert!(parse_native_dev_qpk(&compressed)
            .unwrap_err()
            .to_string()
            .contains("uncompressed"));

        let traversal = qpk_bytes(
            &[("../native.dylib", &[1])],
            serde_json::json!({ "name": "demo" }),
        );
        assert!(parse_native_dev_qpk(&traversal)
            .unwrap_err()
            .to_string()
            .contains("traversal"));
    }

    fn qpk_bytes(assets: &[(&str, &[u8])], manifest: Value) -> Vec<u8> {
        let mut data = Vec::new();
        for (path, bytes) in assets {
            data.extend_from_slice(&(path.len() as u32).to_le_bytes());
            data.extend_from_slice(path.as_bytes());
            data.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
            data.extend_from_slice(bytes);
        }
        let manifest = serde_json::to_vec(&manifest).unwrap();
        let manifest_offset = QPK_HEADER_SIZE + data.len();
        let mut qpk = vec![0; QPK_HEADER_SIZE];
        qpk[0..4].copy_from_slice(QPK_MAGIC);
        qpk[4..8].copy_from_slice(&QPK_VERSION.to_le_bytes());
        qpk[12..16].copy_from_slice(&(QPK_HEADER_SIZE as u32).to_le_bytes());
        qpk[16..24].copy_from_slice(&(manifest_offset as u64).to_le_bytes());
        qpk[24..32].copy_from_slice(&(manifest.len() as u64).to_le_bytes());
        qpk.extend_from_slice(&data);
        qpk.extend_from_slice(&manifest);
        qpk
    }
}

/// Exercise the same package lookup, upload, mesh, shader and capture path as the
/// native window. The fixture is supplied by Quack, so CI without a GPU/encoder
/// still runs the format and lifecycle regression tests.
#[cfg(all(test, feature = "native-window"))]
#[test]
#[ignore = "requires a real GPU, QUA_TEXTURE_QPK and QUA_TEXTURE_FRAME"]
fn capture_native_texture_qpk_frame() {
    use quajs_wgpu_renderer::renderer::{
        InMemoryWgpuNativeRenderRuntimeExecutor, NativeRenderer, RealWgpuNativeRenderRuntimeDevice,
        RealWgpuNativeRenderRuntimeTarget, WgpuNativeRenderBackend, WgpuNativeRenderBackendConfig,
    };
    let host_info = crate::startup::create_native_startup_host_info(
        crate::startup::compile_time_native_app_config(),
        None,
    )
    .unwrap();
    let host = mount_native_dev_qpk(
        InMemoryNativeHostApi::new(host_info),
        std::env::var_os("QUA_TEXTURE_QPK").unwrap(),
    )
    .unwrap();
    let frame = std::fs::read_to_string(std::env::var_os("QUA_TEXTURE_FRAME").unwrap()).unwrap();
    let json: Value = serde_json::from_str(&frame).unwrap();
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());
    let adapter = pollster::block_on(instance.request_adapter(&Default::default())).unwrap();
    let features = if std::env::var_os("QUA_TEXTURE_RGBA").is_some() {
        wgpu::Features::empty()
    } else {
        adapter.features()
            & (wgpu::Features::TEXTURE_COMPRESSION_ASTC | wgpu::Features::TEXTURE_COMPRESSION_BC)
    };
    let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        required_features: features,
        required_limits: quajs_wgpu_renderer::renderer::native_renderer_required_limits(
            adapter.limits(),
        ),
        ..Default::default()
    }))
    .unwrap();
    let extent = wgpu::Extent3d {
        width: json["container"]["width"].as_u64().unwrap() as u32,
        height: json["container"]["height"].as_u64().unwrap() as u32,
        depth_or_array_layers: 1,
    };
    let target = RealWgpuNativeRenderRuntimeTarget::new(
        device,
        queue,
        wgpu::TextureFormat::Bgra8UnormSrgb,
        extent,
    );
    let mut runtime_device = RealWgpuNativeRenderRuntimeDevice::new(target.clone());
    if std::env::var_os("QUA_TEXTURE_ASYNC").is_some() {
        runtime_device.enable_async_image_uploads().unwrap();
    }
    let executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(runtime_device);
    let mut renderer = NativeRenderer::new(WgpuNativeRenderBackend::with_runtime_executor(
        WgpuNativeRenderBackendConfig::default(),
        executor,
    ));
    let start = std::time::Instant::now();
    let mut uploads = 0;
    loop {
        let result = crate::texture_sync::render_json_frame_with_host_texture_sync(
            &mut renderer,
            &host,
            &frame,
        )
        .unwrap();
        assert!(
            result.texture_upload_report.failures.is_empty(),
            "{:?}",
            result.texture_upload_report
        );
        uploads += result.texture_upload_report.uploaded_count;
        if result.frame.texture_upload_sync.pending_requests.is_empty() {
            break;
        }
        assert!(
            start.elapsed() < std::time::Duration::from_secs(10),
            "pending image uploads"
        );
        std::thread::sleep(std::time::Duration::from_millis(2));
    }
    assert!(uploads > 0);
    target
        .device()
        .poll(wgpu::PollType::wait_indefinitely())
        .unwrap();
    let elapsed = start.elapsed();
    let snapshot = renderer.backend().runtime_snapshot();
    let capture = renderer
        .backend()
        .runtime_executor()
        .device()
        .capture_frame_png()
        .unwrap();
    assert!(capture.colored_pixel_count > 0);
    if let Some(path) = std::env::var_os("QUA_TEXTURE_CAPTURE") {
        std::fs::write(path, capture.bytes).unwrap();
    }
    println!(
        "cold_frame_ms={:.2} resident_bytes={} textures={} colored_pixels={}",
        elapsed.as_secs_f64() * 1000.,
        snapshot.resident_texture_byte_len,
        uploads,
        capture.colored_pixel_count
    );
}
