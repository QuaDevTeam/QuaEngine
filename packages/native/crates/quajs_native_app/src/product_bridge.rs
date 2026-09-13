#![cfg_attr(not(feature = "image-decode"), allow(dead_code))]

use std::collections::BTreeSet;
use std::fmt::{Display, Formatter};
use std::io::{BufRead, Write};

use quajs_native_runtime::{
    InMemoryNativeHostApi, NativeHostApi, NativeHostApiError, NativeHostApiErrorInfo,
    NativeHostInfo, NativeRendererIntent,
};
use quajs_wgpu_renderer::audio::NullNativeAudioBackend;
use quajs_wgpu_renderer::fonts::NullNativeFontBackend;
use quajs_wgpu_renderer::renderer::{
    NativeRenderBackend, NativeRenderBackendResult, NativeRenderFrameRef, NativeRenderer,
    NullNativeRenderBackend,
};
use quajs_wgpu_renderer::resources::{NativeTextureUploadRequest, ResourceId};
use quajs_wgpu_renderer::video::NullNativeVideoBackend;
use serde::{Deserialize, Serialize};

use crate::product_runtime::NativeProductRuntime;
use crate::startup::{compile_time_native_app_config, create_native_startup_host_info};
use crate::target_bundle::{load_native_target_bundle_manifest, NativeTargetBundleManifest};
use crate::texture_sync::{
    NativeTextureBundleLifecycleSyncReport, NativeTextureCleanedClearResult,
    NativeTextureUploadMetadata, NativeTextureUploadSink,
};

pub const PRODUCT_BRIDGE_ENV: &str = "QUA_NATIVE_PRODUCT_BRIDGE";

type ProductBridgeRuntime = NativeProductRuntime<
    ProductBridgeBackend,
    NullNativeAudioBackend,
    InMemoryNativeHostApi,
    NullNativeVideoBackend,
    NullNativeFontBackend,
>;

#[derive(Debug)]
pub enum NativeProductBridgeError {
    Io(std::io::Error),
    Startup(String),
    Serialize(serde_json::Error),
}

impl Display for NativeProductBridgeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "Native product bridge I/O failed: {error}."),
            Self::Startup(message) => {
                write!(
                    formatter,
                    "Native product bridge startup failed: {message}."
                )
            }
            Self::Serialize(error) => write!(
                formatter,
                "Native product bridge response serialization failed: {error}."
            ),
        }
    }
}

impl std::error::Error for NativeProductBridgeError {}

impl From<std::io::Error> for NativeProductBridgeError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for NativeProductBridgeError {
    fn from(error: serde_json::Error) -> Self {
        Self::Serialize(error)
    }
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(tag = "method", content = "params", rename_all = "camelCase")]
pub enum NativeProductBridgeRequest {
    GetHostInfo,
    RenderProjectionFrame(NativeProductBridgeProjectionFrameRequest),
    TickLifecycle,
    DrainRendererIntents,
    Shutdown,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeProductBridgeProjectionFrameRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frame_json: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frame: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeProductBridgeResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload: Option<NativeProductBridgeResponsePayload>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<NativeHostApiErrorInfo>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum NativeProductBridgeResponsePayload {
    HostInfo(NativeHostInfo),
    ProjectionFrame(NativeProductBridgeProjectionFrameSummary),
    LifecycleTick(NativeProductBridgeLifecycleSummary),
    RendererIntents(Vec<NativeRendererIntent>),
    Shutdown(NativeProductBridgeShutdownSummary),
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeProductBridgeProjectionFrameSummary {
    pub frame_number: usize,
    pub rendered_frame_count: usize,
    pub revision: u64,
    pub pass_count: usize,
    pub batch_count: usize,
    pub command_count: usize,
    pub resource_count: usize,
    pub missing_resource_count: usize,
    pub texture_upload_pending_request_count: usize,
    pub texture_upload_uploaded_count: usize,
    pub texture_upload_error_count: usize,
    pub texture_upload_resubmit_count: usize,
    pub resubmitted_after_texture_upload: bool,
    pub texture_lifecycle_initial_sync: bool,
    pub texture_lifecycle_tracked_package_count: usize,
    pub texture_lifecycle_released_package_count: usize,
    pub renderer_intents: Vec<NativeRendererIntent>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeProductBridgeLifecycleSummary {
    pub rendered_frame_count: usize,
    pub initial_sync: bool,
    pub observed_bundle_count: usize,
    pub current_package_ids: Vec<String>,
    pub removed_package_ids: Vec<String>,
    pub released_package_ids: Vec<String>,
    pub tracked_package_ids: Vec<String>,
    pub release_attempt_count: usize,
    pub released_resource_count: usize,
    pub texture_cleanup_error_count: usize,
    pub renderer_intents: Vec<NativeRendererIntent>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeProductBridgeShutdownSummary {
    pub rendered_frame_count: usize,
    pub released_resource_count: usize,
    pub host_cleanup_count: usize,
    pub texture_cleanup_released_count: usize,
    pub texture_cleanup_error_count: usize,
    pub renderer_intents: Vec<NativeRendererIntent>,
}

impl NativeProductBridgeResponse {
    fn success(payload: NativeProductBridgeResponsePayload) -> Self {
        Self {
            ok: true,
            payload: Some(payload),
            error: None,
        }
    }

    fn error(error: NativeHostApiErrorInfo) -> Self {
        Self {
            ok: false,
            payload: None,
            error: Some(error),
        }
    }
}

pub fn is_product_bridge_requested() -> bool {
    match std::env::var_os(PRODUCT_BRIDGE_ENV) {
        Some(value) => {
            let value = value.to_string_lossy();
            value != "0" && !value.is_empty()
        }
        None => false,
    }
}

pub fn run_product_bridge_from_stdio() -> Result<(), NativeProductBridgeError> {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let target_bundle_manifest = load_product_bridge_target_bundle_manifest_from_env()?;
    run_product_bridge_with_target_bundle_manifest(
        stdin.lock(),
        stdout.lock(),
        target_bundle_manifest.as_ref(),
    )
}

#[cfg(test)]
pub fn run_product_bridge<R, W>(reader: R, writer: W) -> Result<(), NativeProductBridgeError>
where
    R: BufRead,
    W: Write,
{
    run_product_bridge_with_target_bundle_manifest(reader, writer, None)
}

fn run_product_bridge_with_target_bundle_manifest<R, W>(
    reader: R,
    writer: W,
    target_bundle_manifest: Option<&NativeTargetBundleManifest>,
) -> Result<(), NativeProductBridgeError>
where
    R: BufRead,
    W: Write,
{
    let host_info =
        create_native_startup_host_info(compile_time_native_app_config(), target_bundle_manifest)
            .map_err(|error| NativeProductBridgeError::Startup(error.to_string()))?;
    let mut runtime = create_product_bridge_runtime(host_info);

    run_product_bridge_with_runtime(reader, writer, &mut runtime)
}

fn load_product_bridge_target_bundle_manifest_from_env(
) -> Result<Option<NativeTargetBundleManifest>, NativeProductBridgeError> {
    std::env::var_os("QUA_NATIVE_TARGET_BUNDLE_MANIFEST")
        .map(load_native_target_bundle_manifest)
        .transpose()
        .map_err(|error| NativeProductBridgeError::Startup(error.to_string()))
}

fn create_product_bridge_runtime(host_info: NativeHostInfo) -> ProductBridgeRuntime {
    let host = InMemoryNativeHostApi::new(host_info);
    let renderer = NativeRenderer::with_null_renderer_backends(ProductBridgeBackend::default());
    NativeProductRuntime::new(renderer, host)
}

fn run_product_bridge_with_runtime<R, W>(
    reader: R,
    mut writer: W,
    runtime: &mut ProductBridgeRuntime,
) -> Result<(), NativeProductBridgeError>
where
    R: BufRead,
    W: Write,
{
    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<NativeProductBridgeRequest>(&line) {
            Ok(request) => dispatch_product_bridge_request(runtime, request),
            Err(error) => invalid_request_response(format!(
                "Native product bridge request must be valid JSON: {error}"
            )),
        };
        serde_json::to_writer(&mut writer, &response)?;
        writer.write_all(b"\n")?;
        writer.flush()?;
    }

    Ok(())
}

fn dispatch_product_bridge_request(
    runtime: &mut ProductBridgeRuntime,
    request: NativeProductBridgeRequest,
) -> NativeProductBridgeResponse {
    match request {
        NativeProductBridgeRequest::GetHostInfo => NativeProductBridgeResponse::success(
            NativeProductBridgeResponsePayload::HostInfo(runtime.host().host_info()),
        ),
        NativeProductBridgeRequest::RenderProjectionFrame(request) => {
            let frame_json = match request.into_frame_json() {
                Ok(frame_json) => frame_json,
                Err(response) => return response,
            };
            match runtime.render_projection_json_with_media_teardown(&frame_json) {
                Ok(result) => {
                    let renderer_intents = drain_renderer_intents(runtime);
                    NativeProductBridgeResponse::success(
                        NativeProductBridgeResponsePayload::ProjectionFrame(
                            NativeProductBridgeProjectionFrameSummary::from_frame_result(
                                result,
                                runtime.rendered_frame_count(),
                                renderer_intents,
                            ),
                        ),
                    )
                }
                Err(error) => invalid_request_response(format!(
                    "Native product bridge projection frame failed: {error}"
                )),
            }
        }
        NativeProductBridgeRequest::TickLifecycle => {
            match runtime.tick_host_lifecycle_with_media_teardown() {
                Ok(report) => {
                    let renderer_intents = drain_renderer_intents(runtime);
                    NativeProductBridgeResponse::success(
                        NativeProductBridgeResponsePayload::LifecycleTick(
                            NativeProductBridgeLifecycleSummary::from_lifecycle_report(
                                report,
                                runtime.rendered_frame_count(),
                                renderer_intents,
                            ),
                        ),
                    )
                }
                Err(error) => invalid_request_response(format!(
                    "Native product bridge lifecycle tick failed: {error}"
                )),
            }
        }
        NativeProductBridgeRequest::DrainRendererIntents => {
            let renderer_intents = drain_renderer_intents(runtime);
            NativeProductBridgeResponse::success(
                NativeProductBridgeResponsePayload::RendererIntents(renderer_intents),
            )
        }
        NativeProductBridgeRequest::Shutdown => match runtime.shutdown_with_media_teardown() {
            Ok(result) => {
                let renderer_intents = drain_renderer_intents(runtime);
                NativeProductBridgeResponse::success(NativeProductBridgeResponsePayload::Shutdown(
                    NativeProductBridgeShutdownSummary::from_shutdown_result(
                        result,
                        runtime.rendered_frame_count(),
                        renderer_intents,
                    ),
                ))
            }
            Err(error) => {
                invalid_request_response(format!("Native product bridge shutdown failed: {error}"))
            }
        },
    }
}

impl NativeProductBridgeProjectionFrameRequest {
    fn into_frame_json(self) -> Result<String, NativeProductBridgeResponse> {
        if let Some(frame_json) = self.frame_json {
            if frame_json.trim().is_empty() {
                return Err(invalid_request_response(
                    "Native product bridge frameJson must not be empty.".to_string(),
                ));
            }
            return Ok(frame_json);
        }

        if let Some(frame) = self.frame {
            return serde_json::to_string(&frame).map_err(|error| {
                invalid_request_response(format!(
                    "Native product bridge frame could not be serialized: {error}"
                ))
            });
        }

        Err(invalid_request_response(
            "Native product bridge renderProjectionFrame requires frameJson or frame.".to_string(),
        ))
    }
}

impl NativeProductBridgeProjectionFrameSummary {
    fn from_frame_result(
        result: crate::product_loop::NativeProductLoopFrameResult,
        rendered_frame_count: usize,
        renderer_intents: Vec<NativeRendererIntent>,
    ) -> Self {
        let frame = &result.synced_frame.frame.frame;
        let texture_upload_report = &result.synced_frame.frame.texture_upload_report;
        let bundle_lifecycle_report = &result.synced_frame.bundle_lifecycle_report;

        Self {
            frame_number: result.frame_number,
            rendered_frame_count,
            revision: frame.update.revision,
            pass_count: frame.submission.pass_count,
            batch_count: frame.submission.batch_count,
            command_count: frame.submission.command_count,
            resource_count: frame.submission.resource_count,
            missing_resource_count: frame.submission.missing_resource_count,
            texture_upload_pending_request_count: texture_upload_report.pending_request_count,
            texture_upload_uploaded_count: texture_upload_report.uploaded_count,
            texture_upload_error_count: texture_upload_report.upload_error_count
                + texture_upload_report.host_error_count
                + texture_upload_report.release_error_count,
            texture_upload_resubmit_count: usize::from(
                result.synced_frame.frame.resubmitted_after_texture_upload,
            ),
            resubmitted_after_texture_upload: result
                .synced_frame
                .frame
                .resubmitted_after_texture_upload,
            texture_lifecycle_initial_sync: bundle_lifecycle_report.initial_sync,
            texture_lifecycle_tracked_package_count: bundle_lifecycle_report
                .tracked_package_ids
                .len(),
            texture_lifecycle_released_package_count: bundle_lifecycle_report
                .released_package_ids
                .len(),
            renderer_intents,
        }
    }
}

impl NativeProductBridgeLifecycleSummary {
    fn from_lifecycle_report(
        report: NativeTextureBundleLifecycleSyncReport,
        rendered_frame_count: usize,
        renderer_intents: Vec<NativeRendererIntent>,
    ) -> Self {
        Self {
            rendered_frame_count,
            initial_sync: report.initial_sync,
            observed_bundle_count: report.observed_bundle_count,
            current_package_ids: report.current_package_ids,
            removed_package_ids: report.removed_package_ids,
            released_package_ids: report.released_package_ids,
            tracked_package_ids: report.tracked_package_ids,
            release_attempt_count: report.release_attempt_count,
            released_resource_count: report.released_resource_count,
            texture_cleanup_error_count: report.texture_cleanup_error_count,
            renderer_intents,
        }
    }
}

impl NativeProductBridgeShutdownSummary {
    fn from_shutdown_result(
        result: NativeTextureCleanedClearResult,
        rendered_frame_count: usize,
        renderer_intents: Vec<NativeRendererIntent>,
    ) -> Self {
        Self {
            rendered_frame_count,
            released_resource_count: result.released_resources.len(),
            host_cleanup_count: result.host_cleanup.len(),
            texture_cleanup_released_count: result.texture_cleanup_report.released_count,
            texture_cleanup_error_count: result.texture_cleanup_report.release_error_count,
            renderer_intents,
        }
    }
}

fn drain_renderer_intents(runtime: &mut ProductBridgeRuntime) -> Vec<NativeRendererIntent> {
    runtime
        .host_mut()
        .drain_renderer_intents()
        .unwrap_or_default()
}

fn invalid_request_response(message: String) -> NativeProductBridgeResponse {
    NativeProductBridgeResponse::error(NativeHostApiError::InvalidRequest(message).to_info())
}

#[derive(Debug, Default)]
struct ProductBridgeBackend {
    inner: NullNativeRenderBackend,
    resident_texture_resource_ids: BTreeSet<String>,
}

impl NativeRenderBackend for ProductBridgeBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
        self.inner.submit_frame(frame)
    }

    fn resident_texture_resource_ids(&self) -> Vec<String> {
        self.resident_texture_resource_ids.iter().cloned().collect()
    }
}

impl NativeTextureUploadSink for ProductBridgeBackend {
    type Error = String;

    fn upload_texture_bytes(
        &mut self,
        request: &NativeTextureUploadRequest,
        _bytes: &[u8],
        _metadata: NativeTextureUploadMetadata,
    ) -> Result<(), Self::Error> {
        self.resident_texture_resource_ids
            .insert(request.resource_id.as_str().to_string());
        Ok(())
    }

    fn upload_decoded_texture_rgba8(
        &mut self,
        resource_id: &ResourceId,
        _width: u32,
        _height: u32,
        _rgba: &[u8],
        _metadata: NativeTextureUploadMetadata,
    ) -> Result<(), Self::Error> {
        self.resident_texture_resource_ids
            .insert(resource_id.as_str().to_string());
        Ok(())
    }

    fn release_texture_resource(&mut self, resource_id: &ResourceId) -> Result<bool, Self::Error> {
        Ok(self
            .resident_texture_resource_ids
            .remove(resource_id.as_str()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EMPTY_FRAME_JSON: &str = r#"{
      "layout": { "preset": "landscape" },
      "container": { "width": 1600, "height": 1000 },
      "view": {}
    }"#;

    fn native_manifest_for_compile_time_config() -> NativeTargetBundleManifest {
        let mut manifest = crate::target_bundle::tests::native_manifest();
        let config = compile_time_native_app_config();
        let app = manifest.app.as_mut().expect("native app metadata exists");
        app.bundle_id = Some(config.bundle_id);
        app.version = Some(config.version);
        app.build_number = Some(config.build_number);
        manifest
    }

    fn response_lines(output: &[u8]) -> Vec<serde_json::Value> {
        String::from_utf8(output.to_vec())
            .expect("bridge output is utf-8")
            .lines()
            .map(|line| serde_json::from_str(line).expect("bridge response parses"))
            .collect()
    }

    #[test]
    fn product_bridge_dispatches_host_info() {
        let mut output = Vec::new();

        run_product_bridge(
            std::io::Cursor::new(b"{\"method\":\"getHostInfo\"}\n"),
            &mut output,
        )
        .expect("product bridge should dispatch host info");

        let responses = response_lines(&output);
        assert_eq!(responses.len(), 1);
        assert_eq!(responses[0]["ok"], true);
        assert_eq!(responses[0]["payload"]["type"], "hostInfo");
        assert_eq!(
            responses[0]["payload"]["value"]["runtime"]["nativeRuntimeVersion"],
            env!("CARGO_PKG_VERSION")
        );
    }

    #[test]
    fn product_bridge_keeps_runtime_across_projection_frames() {
        let mut output = Vec::new();
        let requests = format!(
            "{}\n{}\n",
            serde_json::json!({
                "method": "renderProjectionFrame",
                "params": { "frameJson": EMPTY_FRAME_JSON },
            }),
            serde_json::json!({
                "method": "renderProjectionFrame",
                "params": { "frame": serde_json::from_str::<serde_json::Value>(EMPTY_FRAME_JSON).unwrap() },
            }),
        );

        run_product_bridge(std::io::Cursor::new(requests), &mut output)
            .expect("product bridge should render projection frames");

        let responses = response_lines(&output);
        assert_eq!(responses.len(), 2);
        assert_eq!(responses[0]["ok"], true);
        assert_eq!(responses[0]["payload"]["type"], "projectionFrame");
        assert_eq!(responses[0]["payload"]["value"]["frameNumber"], 1);
        assert_eq!(responses[0]["payload"]["value"]["renderedFrameCount"], 1);
        assert_eq!(responses[1]["payload"]["value"]["frameNumber"], 2);
        assert_eq!(responses[1]["payload"]["value"]["renderedFrameCount"], 2);
        assert_eq!(
            responses[1]["payload"]["value"]["textureLifecycleInitialSync"],
            false
        );
    }

    #[test]
    fn product_bridge_rejects_invalid_frame_without_incrementing_counter() {
        let mut output = Vec::new();
        let requests = format!(
            "{}\n{}\n",
            serde_json::json!({
                "method": "renderProjectionFrame",
                "params": { "frameJson": "{}" },
            }),
            serde_json::json!({
                "method": "renderProjectionFrame",
                "params": { "frameJson": EMPTY_FRAME_JSON },
            }),
        );

        run_product_bridge(std::io::Cursor::new(requests), &mut output)
            .expect("product bridge should keep serving after invalid frames");

        let responses = response_lines(&output);
        assert_eq!(responses.len(), 2);
        assert_eq!(responses[0]["ok"], false);
        assert!(responses[0]["error"]["message"]
            .as_str()
            .unwrap()
            .contains("projection frame failed"));
        assert_eq!(responses[1]["ok"], true);
        assert_eq!(responses[1]["payload"]["value"]["frameNumber"], 1);
        assert_eq!(responses[1]["payload"]["value"]["renderedFrameCount"], 1);
    }

    #[test]
    fn product_bridge_drains_renderer_intents_from_runtime_host() {
        let host_info = create_native_startup_host_info(compile_time_native_app_config(), None)
            .expect("host info should build");
        let mut runtime = create_product_bridge_runtime(host_info);
        runtime
            .host_mut()
            .emit_renderer_intent(NativeRendererIntent {
                r#type: "ui/intent".to_string(),
                payload_json: Some("{\"action\":\"open\"}".to_string()),
            })
            .expect("intent should seed host ledger");
        let mut output = Vec::new();

        run_product_bridge_with_runtime(
            std::io::Cursor::new(
                b"{\"method\":\"drainRendererIntents\"}\n{\"method\":\"drainRendererIntents\"}\n",
            ),
            &mut output,
            &mut runtime,
        )
        .expect("product bridge should drain renderer intents");

        let responses = response_lines(&output);
        assert_eq!(responses.len(), 2);
        assert_eq!(responses[0]["ok"], true);
        assert_eq!(responses[0]["payload"]["type"], "rendererIntents");
        assert_eq!(responses[0]["payload"]["value"][0]["type"], "ui/intent");
        assert_eq!(
            responses[0]["payload"]["value"][0]["payloadJson"],
            "{\"action\":\"open\"}"
        );
        assert_eq!(
            responses[1]["payload"]["value"]
                .as_array()
                .expect("renderer intents array")
                .len(),
            0
        );
    }

    #[test]
    fn product_bridge_validates_target_bundle_manifest_before_serving() {
        let mut output = Vec::new();
        let mut manifest = native_manifest_for_compile_time_config();
        manifest
            .native_runtime
            .as_mut()
            .expect("native runtime metadata exists")
            .native_runtime_version = Some("stale-native-runtime".to_string());

        let error = run_product_bridge_with_target_bundle_manifest(
            std::io::Cursor::new(b"{\"method\":\"getHostInfo\"}\n"),
            &mut output,
            Some(&manifest),
        )
        .expect_err("stale target bundle manifest should block product bridge startup");

        assert!(output.is_empty());
        assert!(error
            .to_string()
            .contains("nativeRuntime.nativeRuntimeVersion \"stale-native-runtime\""));
    }

    #[test]
    fn product_bridge_shutdown_returns_cleanup_summary() {
        let mut output = Vec::new();
        let requests = format!(
            "{}\n{}\n",
            serde_json::json!({
                "method": "renderProjectionFrame",
                "params": { "frameJson": EMPTY_FRAME_JSON },
            }),
            serde_json::json!({ "method": "shutdown" }),
        );

        run_product_bridge(std::io::Cursor::new(requests), &mut output)
            .expect("product bridge should shutdown runtime");

        let responses = response_lines(&output);
        assert_eq!(responses.len(), 2);
        assert_eq!(responses[1]["ok"], true);
        assert_eq!(responses[1]["payload"]["type"], "shutdown");
        assert_eq!(responses[1]["payload"]["value"]["renderedFrameCount"], 1);
        assert_eq!(
            responses[1]["payload"]["value"]["rendererIntents"]
                .as_array()
                .expect("renderer intents array")
                .len(),
            0
        );
    }
}
