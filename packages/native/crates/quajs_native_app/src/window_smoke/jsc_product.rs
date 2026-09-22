use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, RwLock};
use std::thread::JoinHandle;
use std::time::Duration;
use winit::event_loop::EventLoopProxy;

use quajs_native_runtime::{
    JavaScriptCoreEvaluator, JscEvaluationRequest, JscModuleEvaluator, JscModuleExportCallRequest,
    JscPipelineMessage, JscRuntimeModuleKind, JscRuntimeModuleRecord, JscSandboxLimits,
    NativeAssetReadRequest, NativeHostApi, NativeRendererIntent,
};

use super::error::NativeWindowSmokeError;

pub(super) const WINDOW_DEV_JSC_APP_ASSET_ENV: &str =
    "QUA_NATIVE_RENDERER_WINDOW_DEV_JSC_APP_ASSET";

const JSC_STARTUP_TIMEOUT: Duration = Duration::from_secs(15);

pub(super) struct NativeWindowJscProduct {
    sender: mpsc::Sender<JscProductCommand>,
    latest: Arc<RwLock<JscProductSnapshot>>,
    pipeline_sequence: Arc<AtomicU64>,
    worker: Option<JoinHandle<()>>,
}

enum JscProductCommand {
    RendererIntent(NativeRendererIntent),
    Shutdown,
}

#[derive(Clone, Debug, Default)]
struct JscProductSnapshot {
    projection_source: Option<Arc<str>>,
    pending_messages: Vec<JscPipelineMessage>,
    error: Option<String>,
}

pub(super) struct JscPipelineUpdate {
    pub(super) projection_source: Arc<str>,
    pub(super) messages: Vec<JscPipelineMessage>,
}

struct JscProductModule {
    evaluator: JavaScriptCoreEvaluator,
    namespace_id: String,
}

struct JscProductAsset {
    asset_name: String,
    bundle_name: String,
    code: String,
    bytes: Vec<u8>,
}

impl NativeWindowJscProduct {
    pub(super) fn load<H>(
        host: &H,
        event_loop_proxy: EventLoopProxy<()>,
    ) -> Result<Option<Self>, NativeWindowSmokeError>
    where
        H: NativeHostApi,
    {
        let Some(asset_url) = crate::packaged_app::config().map(|app| std::ffi::OsString::from(&app.app_asset))
            .or_else(|| std::env::var_os(WINDOW_DEV_JSC_APP_ASSET_ENV)) else {
            return Ok(None);
        };
        let asset = load_product_asset(host, asset_url.to_string_lossy().as_ref())?;
        let latest = Arc::new(RwLock::new(JscProductSnapshot::default()));
        let pipeline_sequence = Arc::new(AtomicU64::new(0));
        let (sender, receiver) = mpsc::channel();
        let (startup_sender, startup_receiver) = mpsc::sync_channel(1);
        let worker_latest = latest.clone();
        let worker_pipeline_sequence = pipeline_sequence.clone();
        let worker = std::thread::Builder::new()
            .name("quaengine-jsc".to_string())
            .spawn(move || {
                run_jsc_product_worker(
                    asset,
                    receiver,
                    worker_latest,
                    worker_pipeline_sequence,
                    event_loop_proxy,
                    startup_sender,
                )
            })
            .map_err(|error| {
                NativeWindowSmokeError::new(format!(
                    "Failed to start the resident QuaEngine JavaScriptCore thread: {error}."
                ))
            })?;
        startup_receiver
            .recv_timeout(JSC_STARTUP_TIMEOUT)
            .map_err(|error| {
                NativeWindowSmokeError::new(format!(
                    "Resident QuaEngine JavaScriptCore startup did not complete: {error}."
                ))
            })?
            .map_err(NativeWindowSmokeError::new)?;
        Ok(Some(Self {
            sender,
            latest,
            pipeline_sequence,
            worker: Some(worker),
        }))
    }

    pub(super) fn pipeline_sequence(&self) -> u64 {
        self.pipeline_sequence.load(Ordering::Acquire)
    }

    pub(super) fn drain_pipeline_update(
        &self,
    ) -> Result<JscPipelineUpdate, NativeWindowSmokeError> {
        let mut snapshot = self.latest.write().map_err(|_| {
            NativeWindowSmokeError::new(
                "Resident QuaEngine JavaScriptCore pipeline lock was poisoned.",
            )
        })?;
        if let Some(error) = &snapshot.error {
            return Err(NativeWindowSmokeError::new(error.clone()));
        }
        let projection_source = snapshot.projection_source.clone().ok_or_else(|| {
            NativeWindowSmokeError::new(
                "Resident QuaEngine JavaScriptCore has not published a view projection.",
            )
        })?;
        Ok(JscPipelineUpdate {
            projection_source,
            messages: std::mem::take(&mut snapshot.pending_messages),
        })
    }

    pub(super) fn dispatch_renderer_intent(
        &self,
        intent: NativeRendererIntent,
    ) -> Result<(), NativeWindowSmokeError> {
        self.sender
            .send(JscProductCommand::RendererIntent(intent))
            .map_err(|error| {
                NativeWindowSmokeError::new(format!(
                    "Failed to queue renderer intent on the resident QuaEngine JavaScriptCore thread: {error}."
                ))
            })
    }
}

impl Drop for NativeWindowJscProduct {
    fn drop(&mut self) {
        let _ = self.sender.send(JscProductCommand::Shutdown);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn run_jsc_product_worker(
    asset: JscProductAsset,
    receiver: mpsc::Receiver<JscProductCommand>,
    latest: Arc<RwLock<JscProductSnapshot>>,
    pipeline_sequence: Arc<AtomicU64>,
    event_loop_proxy: EventLoopProxy<()>,
    startup: mpsc::SyncSender<Result<(), String>>,
) {
    let mut module = match JscProductModule::load(asset) {
        Ok(module) => module,
        Err(error) => {
            let message = error.to_string();
            publish_error(
                &latest,
                &pipeline_sequence,
                &event_loop_proxy,
                message.clone(),
            );
            let _ = startup.send(Err(message));
            return;
        }
    };
    match module.call_export("bootstrap") {
        Ok(_) => match module.drain_pipeline_messages() {
            Ok(messages) => {
                publish_pipeline_messages(&latest, &pipeline_sequence, &event_loop_proxy, messages);
                if latest
                    .read()
                    .ok()
                    .and_then(|snapshot| snapshot.projection_source.clone())
                    .is_none()
                {
                    let message = "Native JavaScriptCore app did not publish an initial view/update pipeline projection.".to_string();
                    publish_error(
                        &latest,
                        &pipeline_sequence,
                        &event_loop_proxy,
                        message.clone(),
                    );
                    let _ = startup.send(Err(message));
                    return;
                }
                let _ = startup.send(Ok(()));
            }
            Err(error) => {
                let message = error.to_string();
                publish_error(
                    &latest,
                    &pipeline_sequence,
                    &event_loop_proxy,
                    message.clone(),
                );
                let _ = startup.send(Err(message));
                return;
            }
        },
        Err(error) => {
            let message = error.to_string();
            publish_error(
                &latest,
                &pipeline_sequence,
                &event_loop_proxy,
                message.clone(),
            );
            let _ = startup.send(Err(message));
            return;
        }
    }

    loop {
        // Engine timers, promise jobs and committed intents drive this worker.
        // A static engine session owes no 60 Hz JavaScript polling work.
        let command = match module.evaluator.native_job_delay() {
            Ok(Some(delay)) => receiver.recv_timeout(delay),
            Ok(None) => receiver
                .recv()
                .map_err(|_| mpsc::RecvTimeoutError::Disconnected),
            Err(error) => {
                publish_error(
                    &latest,
                    &pipeline_sequence,
                    &event_loop_proxy,
                    jsc_error(error).to_string(),
                );
                break;
            }
        };
        match command {
            Ok(JscProductCommand::RendererIntent(intent)) => {
                let result = module.dispatch_renderer_intent(&intent).and_then(|()| {
                    module.pump_jobs()?;
                    module.drain_pipeline_messages()
                });
                if super::config::native_window_demo_e2e_enabled() {
                    if let Ok(Some(diagnostics)) = module.call_export("getInteractionDiagnostics") {
                        println!("Native JavaScriptCore demo E2E diagnostics: {diagnostics}");
                    }
                }
                match result {
                    Ok(messages) => publish_pipeline_messages(
                        &latest,
                        &pipeline_sequence,
                        &event_loop_proxy,
                        messages,
                    ),
                    Err(error) => publish_error(
                        &latest,
                        &pipeline_sequence,
                        &event_loop_proxy,
                        error.to_string(),
                    ),
                }
            }
            Ok(JscProductCommand::Shutdown) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let result = module
                    .pump_jobs()
                    .and_then(|()| module.drain_pipeline_messages());
                match result {
                    Ok(messages) => publish_pipeline_messages(
                        &latest,
                        &pipeline_sequence,
                        &event_loop_proxy,
                        messages,
                    ),
                    Err(error) => publish_error(
                        &latest,
                        &pipeline_sequence,
                        &event_loop_proxy,
                        error.to_string(),
                    ),
                }
            }
        }
    }
    module.destroy();
}

impl JscProductModule {
    fn load(asset: JscProductAsset) -> Result<Self, NativeWindowSmokeError> {
        let mut evaluator = JavaScriptCoreEvaluator::new().map_err(jsc_error)?;
        let response = evaluator
            .evaluate_module(&JscEvaluationRequest {
                module: JscRuntimeModuleRecord {
                    asset_name: asset.asset_name,
                    bundle_name: asset.bundle_name,
                    package_id: "demo.native.app".to_string(),
                    kind: JscRuntimeModuleKind::Script,
                    code: asset.code,
                    bytes: asset.bytes,
                },
                module_graph: Vec::new(),
                limits: JscSandboxLimits::default(),
            })
            .map_err(jsc_error)?;
        let namespace_id = response.module_namespace_id.ok_or_else(|| {
            NativeWindowSmokeError::new(
                "Native JavaScriptCore demo app did not return a namespace id.",
            )
        })?;
        Ok(Self {
            evaluator,
            namespace_id,
        })
    }

    fn dispatch_renderer_intent(
        &mut self,
        intent: &NativeRendererIntent,
    ) -> Result<(), NativeWindowSmokeError> {
        match self
            .evaluator
            .dispatch_renderer_intent(intent)
            .map_err(jsc_error)?
        {
            true => Ok(()),
            false => Err(NativeWindowSmokeError::new(
                "Native JavaScriptCore demo app did not subscribe to renderer intents.",
            )),
        }
    }

    fn pump_jobs(&mut self) -> Result<(), NativeWindowSmokeError> {
        self.evaluator.pump_native_jobs().map_err(jsc_error)
    }

    fn drain_pipeline_messages(
        &mut self,
    ) -> Result<Vec<JscPipelineMessage>, NativeWindowSmokeError> {
        self.evaluator
            .drain_native_pipeline_messages()
            .map_err(jsc_error)
    }

    fn call_export(&mut self, export_name: &str) -> Result<Option<String>, NativeWindowSmokeError> {
        Ok(self
            .evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id: self.namespace_id.clone(),
                export_name: export_name.to_string(),
                args_json: Some("[]".to_string()),
            })
            .map_err(jsc_error)?
            .value_json)
    }

    fn destroy(&mut self) {
        let _ = self
            .evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id: self.namespace_id.clone(),
                export_name: "destroy".to_string(),
                args_json: Some("[]".to_string()),
            });
    }
}

fn load_product_asset<H>(
    host: &H,
    asset_url: &str,
) -> Result<JscProductAsset, NativeWindowSmokeError>
where
    H: NativeHostApi,
{
    let mounted_bundle = host
        .list_mounted_bundles()
        .map_err(host_error)?
        .into_iter()
        .next();
    let bytes = host
        .read_asset_bytes(&NativeAssetReadRequest {
            url: asset_url.to_string(),
            bundle_name: mounted_bundle.as_ref().map(|bundle| bundle.name.clone()),
            asset_id: None,
        })
        .map_err(host_error)?;
    let code = String::from_utf8(bytes.clone()).map_err(|error| {
        NativeWindowSmokeError::new(format!(
            "Native JavaScriptCore demo app asset {asset_url} is not UTF-8: {error}."
        ))
    })?;
    Ok(JscProductAsset {
        asset_name: asset_url
            .strip_prefix("assets/")
            .unwrap_or(asset_url)
            .to_string(),
        bundle_name: mounted_bundle
            .map(|bundle| bundle.name)
            .unwrap_or_else(|| "native-app".to_string()),
        code,
        bytes,
    })
}

fn publish_pipeline_messages(
    latest: &RwLock<JscProductSnapshot>,
    pipeline_sequence: &AtomicU64,
    event_loop_proxy: &EventLoopProxy<()>,
    messages: Vec<JscPipelineMessage>,
) {
    if messages.is_empty() {
        return;
    }
    let projection = messages
        .iter()
        .rev()
        .find(|message| message.event == "view/update")
        .and_then(|message| native_frame_from_view_update(&message.payload_json).ok());
    if let Ok(mut snapshot) = latest.write() {
        let projection_changed = projection.as_ref().is_some_and(|projection| {
            snapshot.projection_source.as_deref() != Some(projection.as_str())
        });
        if let Some(projection) = projection {
            snapshot.projection_source = Some(Arc::<str>::from(projection));
        }
        snapshot.pending_messages.extend(messages);
        snapshot.error = None;
        if projection_changed || !snapshot.pending_messages.is_empty() {
            pipeline_sequence.fetch_add(1, Ordering::Release);
            let _ = event_loop_proxy.send_event(());
        }
    }
}

fn native_frame_from_view_update(payload_json: &str) -> Result<String, serde_json::Error> {
    let payload: serde_json::Value = serde_json::from_str(payload_json)?;
    let view = payload
        .get("view")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let layout = view
        .get("layout")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    serde_json::to_string(&serde_json::json!({
        "layout": layout,
        "view": view,
    }))
}

fn publish_error(
    latest: &RwLock<JscProductSnapshot>,
    pipeline_sequence: &AtomicU64,
    event_loop_proxy: &EventLoopProxy<()>,
    error: String,
) {
    log::error!(target: "quajs_native_app::jsc", "{error}");
    if let Ok(mut snapshot) = latest.write() {
        snapshot.error = Some(error);
        pipeline_sequence.fetch_add(1, Ordering::Release);
        let _ = event_loop_proxy.send_event(());
    }
}

fn host_error(error: quajs_native_runtime::NativeHostApiError) -> NativeWindowSmokeError {
    NativeWindowSmokeError::new(format!(
        "Native JavaScriptCore demo host asset read failed: {}.",
        error.message()
    ))
}

fn jsc_error(error: quajs_native_runtime::JscEvaluationError) -> NativeWindowSmokeError {
    NativeWindowSmokeError::new(format!(
        "Native JavaScriptCore demo app failed: {}.",
        error.message
    ))
}
