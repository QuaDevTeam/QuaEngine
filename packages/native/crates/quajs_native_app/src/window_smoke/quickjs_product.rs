use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, RwLock};
use std::thread::JoinHandle;
use std::time::Duration;
use winit::event_loop::EventLoopProxy;

use quajs_native_runtime::{
    NativeAssetReadRequest, NativeHostApi, NativeRendererIntent, QuickJsEvaluationRequest,
    QuickJsModuleEvaluator, QuickJsModuleExportCallRequest, QuickJsRuntimeModuleKind,
    QuickJsRuntimeModuleRecord, QuickJsSandboxLimits, RquickJsModuleEvaluator,
};

use super::error::NativeWindowSmokeError;

pub(super) const WINDOW_DEV_QUICKJS_APP_ASSET_ENV: &str =
    "QUA_NATIVE_RENDERER_WINDOW_DEV_QUICKJS_APP_ASSET";

const QUICKJS_STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const QUICKJS_FRAME_TICK_INTERVAL: Duration = Duration::from_millis(16);

pub(super) struct NativeWindowQuickJsProduct {
    sender: mpsc::Sender<QuickJsProductCommand>,
    latest: Arc<RwLock<QuickJsProductSnapshot>>,
    revision: Arc<AtomicU64>,
    worker: Option<JoinHandle<()>>,
}

enum QuickJsProductCommand {
    RendererIntent(NativeRendererIntent),
    Shutdown,
}

#[derive(Clone, Debug, Default)]
struct QuickJsProductSnapshot {
    frame_source: Option<String>,
    error: Option<String>,
}

struct QuickJsProductModule {
    evaluator: RquickJsModuleEvaluator,
    namespace_id: String,
}

struct QuickJsProductAsset {
    asset_name: String,
    bundle_name: String,
    code: String,
    bytes: Vec<u8>,
}

impl NativeWindowQuickJsProduct {
    pub(super) fn load<H>(
        host: &H,
        event_loop_proxy: EventLoopProxy<()>,
    ) -> Result<Option<Self>, NativeWindowSmokeError>
    where
        H: NativeHostApi,
    {
        let Some(asset_url) = std::env::var_os(WINDOW_DEV_QUICKJS_APP_ASSET_ENV) else {
            return Ok(None);
        };
        let asset = load_product_asset(host, asset_url.to_string_lossy().as_ref())?;
        let latest = Arc::new(RwLock::new(QuickJsProductSnapshot::default()));
        let revision = Arc::new(AtomicU64::new(0));
        let (sender, receiver) = mpsc::channel();
        let (startup_sender, startup_receiver) = mpsc::sync_channel(1);
        let worker_latest = latest.clone();
        let worker_revision = revision.clone();
        let worker = std::thread::Builder::new()
            .name("quaengine-quickjs".to_string())
            .spawn(move || {
                run_quickjs_product_worker(
                    asset,
                    receiver,
                    worker_latest,
                    worker_revision,
                    event_loop_proxy,
                    startup_sender,
                )
            })
            .map_err(|error| {
                NativeWindowSmokeError::new(format!(
                    "Failed to start the resident QuaEngine QuickJS thread: {error}."
                ))
            })?;
        startup_receiver
            .recv_timeout(QUICKJS_STARTUP_TIMEOUT)
            .map_err(|error| {
                NativeWindowSmokeError::new(format!(
                    "Resident QuaEngine QuickJS startup did not complete: {error}."
                ))
            })?
            .map_err(NativeWindowSmokeError::new)?;
        Ok(Some(Self {
            sender,
            latest,
            revision,
            worker: Some(worker),
        }))
    }

    pub(super) fn revision(&self) -> u64 {
        self.revision.load(Ordering::Acquire)
    }

    pub(super) fn render_frame_source(&self) -> Result<String, NativeWindowSmokeError> {
        let snapshot = self.latest.read().map_err(|_| {
            NativeWindowSmokeError::new("Resident QuaEngine QuickJS frame lock was poisoned.")
        })?;
        if let Some(error) = &snapshot.error {
            return Err(NativeWindowSmokeError::new(error.clone()));
        }
        snapshot.frame_source.clone().ok_or_else(|| {
            NativeWindowSmokeError::new("Resident QuaEngine QuickJS has not published a frame.")
        })
    }

    pub(super) fn dispatch_renderer_intent(
        &self,
        intent: NativeRendererIntent,
    ) -> Result<(), NativeWindowSmokeError> {
        self.sender
            .send(QuickJsProductCommand::RendererIntent(intent))
            .map_err(|error| {
                NativeWindowSmokeError::new(format!(
                    "Failed to queue renderer intent on the resident QuaEngine QuickJS thread: {error}."
                ))
            })
    }
}

impl Drop for NativeWindowQuickJsProduct {
    fn drop(&mut self) {
        let _ = self.sender.send(QuickJsProductCommand::Shutdown);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn run_quickjs_product_worker(
    asset: QuickJsProductAsset,
    receiver: mpsc::Receiver<QuickJsProductCommand>,
    latest: Arc<RwLock<QuickJsProductSnapshot>>,
    revision: Arc<AtomicU64>,
    event_loop_proxy: EventLoopProxy<()>,
    startup: mpsc::SyncSender<Result<(), String>>,
) {
    let mut module = match QuickJsProductModule::load(asset) {
        Ok(module) => module,
        Err(error) => {
            let message = error.to_string();
            publish_error(&latest, &revision, &event_loop_proxy, message.clone());
            let _ = startup.send(Err(message));
            return;
        }
    };
    match module.call_frame_export("bootstrap") {
        Ok(frame) => {
            publish_frame(&latest, &revision, &event_loop_proxy, frame);
            let _ = startup.send(Ok(()));
        }
        Err(error) => {
            let message = error.to_string();
            publish_error(&latest, &revision, &event_loop_proxy, message.clone());
            let _ = startup.send(Err(message));
            return;
        }
    }

    loop {
        match receiver.recv_timeout(QUICKJS_FRAME_TICK_INTERVAL) {
            Ok(QuickJsProductCommand::RendererIntent(intent)) => {
                let result = module.dispatch_renderer_intent(&intent);
                if super::config::native_window_interaction_probe_enabled() {
                    if let Ok(Some(diagnostics)) = module.call_export("getInteractionDiagnostics") {
                        println!("Native QuickJS interaction diagnostics: {diagnostics}");
                    }
                }
                let result = result.and_then(|()| module.call_frame_export("renderFrame"));
                match result {
                    Ok(frame) => publish_frame(&latest, &revision, &event_loop_proxy, frame),
                    Err(error) => {
                        publish_error(&latest, &revision, &event_loop_proxy, error.to_string())
                    }
                }
            }
            Ok(QuickJsProductCommand::Shutdown) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                break
            }
            Err(mpsc::RecvTimeoutError::Timeout) => match module.call_frame_export("renderFrame") {
                Ok(frame) => publish_frame(&latest, &revision, &event_loop_proxy, frame),
                Err(error) => {
                    publish_error(&latest, &revision, &event_loop_proxy, error.to_string())
                }
            },
        }
    }
    module.destroy();
}

impl QuickJsProductModule {
    fn load(asset: QuickJsProductAsset) -> Result<Self, NativeWindowSmokeError> {
        let mut evaluator = RquickJsModuleEvaluator::new().map_err(quickjs_error)?;
        let response = evaluator
            .evaluate_module(&QuickJsEvaluationRequest {
                module: QuickJsRuntimeModuleRecord {
                    asset_name: asset.asset_name,
                    bundle_name: asset.bundle_name,
                    package_id: "demo.native.app".to_string(),
                    kind: QuickJsRuntimeModuleKind::Script,
                    code: asset.code,
                    bytes: asset.bytes,
                },
                module_graph: Vec::new(),
                limits: QuickJsSandboxLimits::default(),
            })
            .map_err(quickjs_error)?;
        let namespace_id = response.module_namespace_id.ok_or_else(|| {
            NativeWindowSmokeError::new("Native QuickJS demo app did not return a namespace id.")
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
            .map_err(quickjs_error)?
        {
            true => Ok(()),
            false => Err(NativeWindowSmokeError::new(
                "Native QuickJS demo app did not subscribe to renderer intents.",
            )),
        }
    }

    fn call_frame_export(&mut self, export_name: &str) -> Result<String, NativeWindowSmokeError> {
        self.call_export(export_name)?.ok_or_else(|| {
            NativeWindowSmokeError::new(format!(
                "Native QuickJS demo app export {export_name} did not return a frame."
            ))
        })
    }

    fn call_export(&mut self, export_name: &str) -> Result<Option<String>, NativeWindowSmokeError> {
        Ok(self.evaluator
            .call_module_export(&QuickJsModuleExportCallRequest {
                module_namespace_id: self.namespace_id.clone(),
                export_name: export_name.to_string(),
                args_json: Some("[]".to_string()),
            })
            .map_err(quickjs_error)?
            .value_json)
    }

    fn destroy(&mut self) {
        let _ = self
            .evaluator
            .call_module_export(&QuickJsModuleExportCallRequest {
                module_namespace_id: self.namespace_id.clone(),
                export_name: "destroy".to_string(),
                args_json: Some("[]".to_string()),
            });
    }
}

fn load_product_asset<H>(
    host: &H,
    asset_url: &str,
) -> Result<QuickJsProductAsset, NativeWindowSmokeError>
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
            "Native QuickJS demo app asset {asset_url} is not UTF-8: {error}."
        ))
    })?;
    Ok(QuickJsProductAsset {
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

fn publish_frame(
    latest: &RwLock<QuickJsProductSnapshot>,
    revision: &AtomicU64,
    event_loop_proxy: &EventLoopProxy<()>,
    frame: String,
) {
    if let Ok(mut snapshot) = latest.write() {
        if snapshot.frame_source.as_deref() == Some(frame.as_str()) && snapshot.error.is_none() {
            return;
        }
        snapshot.frame_source = Some(frame);
        snapshot.error = None;
        revision.fetch_add(1, Ordering::Release);
        let _ = event_loop_proxy.send_event(());
    }
}

fn publish_error(
    latest: &RwLock<QuickJsProductSnapshot>,
    revision: &AtomicU64,
    event_loop_proxy: &EventLoopProxy<()>,
    error: String,
) {
    if let Ok(mut snapshot) = latest.write() {
        snapshot.error = Some(error);
        revision.fetch_add(1, Ordering::Release);
        let _ = event_loop_proxy.send_event(());
    }
}

fn host_error(error: quajs_native_runtime::NativeHostApiError) -> NativeWindowSmokeError {
    NativeWindowSmokeError::new(format!(
        "Native QuickJS demo host asset read failed: {}.",
        error.message()
    ))
}

fn quickjs_error(error: quajs_native_runtime::QuickJsEvaluationError) -> NativeWindowSmokeError {
    NativeWindowSmokeError::new(format!(
        "Native QuickJS demo app failed: {}.",
        error.message
    ))
}
