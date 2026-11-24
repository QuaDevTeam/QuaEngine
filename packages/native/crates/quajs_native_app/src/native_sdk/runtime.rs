use crate::{
    product_input::NativeProductInputController,
    product_window::{NativeProductWindowInMemoryRuntime, NativeProductWindowPhysicalSize},
    startup::{create_native_startup_host_info, NativeAppConfig},
};
use quajs_native_runtime::{
    dispatch_native_host_api_request, InMemoryNativeHostApi, JavaScriptCoreEvaluator,
    JscEvaluationRequest, JscModuleEvaluator, JscModuleExportCallRequest, JscRuntimeModuleKind,
    JscRuntimeModuleRecord, JscSandboxLimits, NativeHostApi, NativeHostApiRequest,
    NativeRendererIntent,
};
use quajs_wgpu_renderer::{
    input::{NativePointerButton, NativePointerEventPhase},
    projection_runtime::NativeRendererProjectionRuntime,
    stage_layout::StageClientPoint,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, VecDeque},
    ffi::c_void,
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

fn err(error: impl std::fmt::Debug) -> String {
    format!("{error:?}")
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Config {
    module_directory: PathBuf,
    module_manifest_sha256: String,
    storage_directory: PathBuf,
}

pub(super) struct Session {
    evaluator: JavaScriptCoreEvaluator,
    namespace: String,
    host: Option<InMemoryNativeHostApi>,
    window: Option<NativeProductWindowInMemoryRuntime>,
    projection: NativeRendererProjectionRuntime,
    input: NativeProductInputController,
    storage_root: PathBuf,
    storage_file: Option<PathBuf>,
    storage_lock: Option<PathBuf>,
    module_id: String,
    active_id: Option<String>,
    pub events: VecDeque<String>,
    pub opened: bool,
    pub closed: bool,
    closing: bool,
    width: u32,
    height: u32,
    scale: f64,
    hashes: BTreeMap<u64, Sha256>,
    next_hash: u64,
}
impl Session {
    pub fn create(config: &str) -> Result<Self, String> {
        let config: Config = serde_json::from_str(config).map_err(err)?;
        if !config.module_directory.is_absolute() || !config.storage_directory.is_absolute() {
            return Err("Module and storage directories must be absolute paths".into());
        }
        let root = config.module_directory.canonicalize().map_err(err)?;
        if fs::metadata(root.join("module.json")).map_err(err)?.len() > 4 * 1024 * 1024 {
            return Err("Module inventory exceeds 4 MiB".into());
        }
        let manifest_bytes = fs::read(root.join("module.json")).map_err(err)?;
        if hash(&manifest_bytes) != config.module_manifest_sha256 {
            return Err("module.json hash does not match the parent pin".into());
        }
        let module: Value = serde_json::from_slice(&manifest_bytes).map_err(err)?;
        if module["schemaVersion"] != 1
            || module["kind"] != "qua-embedded-module"
            || module["target"] != "native"
            || module["protocol"]["name"] != "qua-embedded"
            || module["protocol"]["version"] != 1
        {
            return Err("Unsupported Native module manifest".into());
        }
        let files = module["files"]
            .as_array()
            .ok_or("Missing module inventory")?;
        if files.len() > 4096 {
            return Err("Too many Native module files".into());
        }
        let mut verified = BTreeMap::new();
        let mut names = std::collections::BTreeSet::new();
        for record in files {
            let name = record["path"].as_str().ok_or("Missing file path")?;
            let path = Path::new(name);
            if path
                .components()
                .any(|c| !matches!(c, Component::Normal(_)))
                || name.contains('\\')
            {
                return Err("Unsafe module file path".into());
            }
            let path = root.join(path);
            if fs::symlink_metadata(&path)
                .map_err(err)?
                .file_type()
                .is_symlink()
                || !path.canonicalize().map_err(err)?.starts_with(&root)
            {
                return Err("Module file escapes its root".into());
            }
            let size = fs::metadata(&path).map_err(err)?.len();
            if size > 1024 * 1024 * 1024 || Some(size) != record["size"].as_u64() {
                return Err(format!("Invalid module file size: {name}"));
            }
            let needed = name == "runtime.mjs"
                || name == "native-module.json"
                || name == "target-bundle-manifest.json"
                || name.starts_with("qua/");
            let bytes = if needed {
                fs::read(&path).map_err(err)?
            } else {
                vec![]
            };
            let digest = if needed {
                hash(&bytes)
            } else {
                let mut source = fs::File::open(&path).map_err(err)?;
                let mut digest = Sha256::new();
                let mut buffer = [0u8; 65536];
                loop {
                    let size = source.read(&mut buffer).map_err(err)?;
                    if size == 0 {
                        break;
                    }
                    digest.update(&buffer[..size]);
                }
                format!("{:x}", digest.finalize())
            };
            if record["sha256"].as_str() != Some(&digest) {
                return Err(format!("Module hash mismatch: {name}"));
            }
            if !names.insert(name.to_string()) {
                return Err("Duplicate module inventory path".into());
            }
            if needed {
                verified.insert(name.to_string(), bytes);
            }
        }
        let native: Value = serde_json::from_slice(
            verified
                .get("native-module.json")
                .ok_or("Missing native-module.json")?,
        )
        .map_err(err)?;
        if native["schemaVersion"] != 1 {
            return Err("Unsupported Native module schema".into());
        }
        let app = &module;
        let module_id = app["moduleId"]
            .as_str()
            .ok_or("Missing moduleId")?
            .to_string();
        let version = app["version"].as_str().ok_or("Missing version")?;
        let target_bytes = verified
            .get("target-bundle-manifest.json")
            .ok_or("Missing target manifest")?;
        let target: crate::target_bundle::NativeTargetBundleManifest =
            serde_json::from_slice(target_bytes).map_err(err)?;
        let build = native["buildNumber"]
            .as_str()
            .ok_or("Missing buildNumber")?;
        let info = create_native_startup_host_info(
            NativeAppConfig::new(&module_id, &module_id, version, build),
            Some(&target),
        )
        .map_err(err)?;
        let mut host = InMemoryNativeHostApi::new(info)
            .with_asset("target-bundle-manifest.json", target_bytes.clone());
        for file in native["bundles"].as_array().ok_or("Missing bundles")? {
            let file = file.as_str().ok_or("Invalid bundle path")?;
            let bytes = verified.get(file).ok_or("Missing verified bundle")?;
            host = crate::qpk::mount_qpk_bytes(host, bytes)
                .map_err(err)?
                .with_asset(file, bytes.clone());
        }
        let runtime = verified
            .get("runtime.mjs")
            .ok_or("Missing runtime.mjs")?
            .clone();
        let mut evaluator = JavaScriptCoreEvaluator::new().map_err(err)?;
        let response = evaluator
            .evaluate_module(&JscEvaluationRequest {
                module: JscRuntimeModuleRecord {
                    asset_name: "runtime.mjs".into(),
                    bundle_name: module_id.clone(),
                    package_id: module_id.clone(),
                    kind: JscRuntimeModuleKind::Script,
                    code: String::from_utf8(runtime.clone()).map_err(err)?,
                    bytes: runtime,
                },
                module_graph: vec![],
                limits: JscSandboxLimits::default(),
            })
            .map_err(err)?;
        let namespace = response
            .module_namespace_id
            .ok_or("Missing JSC namespace")?;
        Ok(Self {
            evaluator,
            namespace,
            host: Some(host),
            window: None,
            projection: NativeRendererProjectionRuntime::from_frame_json("{\"view\":{}}")
                .map_err(err)?,
            input: NativeProductInputController::new(),
            storage_root: config.storage_directory.join(hash(module_id.as_bytes())),
            storage_file: None,
            storage_lock: None,
            module_id,
            active_id: None,
            events: VecDeque::new(),
            opened: false,
            closed: false,
            closing: false,
            width: 640,
            height: 360,
            scale: 1.0,
            hashes: BTreeMap::new(),
            next_hash: 0,
        })
    }
    fn call(&mut self, export: &str, args: Value) -> Result<Option<String>, String> {
        self.evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id: self.namespace.clone(),
                export_name: export.into(),
                args_json: Some(args.to_string()),
            })
            .map(|r| r.value_json)
            .map_err(err)
    }
    fn host_mut(&mut self) -> &mut InMemoryNativeHostApi {
        match self.window.as_mut() {
            Some(window) => window.host_mut(),
            None => self.host.as_mut().unwrap(),
        }
    }
    pub fn open(&mut self, request: &str) -> Result<(), String> {
        if self.opened || self.closed || self.closing {
            return Err("A handle owns one session; create a fresh handle after closed".into());
        }
        if self.host.is_none() && self.window.is_none() {
            return Err(
                "Surface initialization failed; destroy this handle and create a fresh one".into(),
            );
        }
        // Shared protocol validation occurs before deriving or opening a storage path.
        let validated = self
            .call(
                "validateOpen",
                json!([serde_json::from_str::<Value>(request).map_err(err)?]),
            )?
            .ok_or("Missing validated request")?;
        let request: Value = serde_json::from_str(&validated).map_err(err)?;
        let namespace = request["storageNamespace"]
            .as_str()
            .ok_or("Missing storage namespace")?;
        let directory = self.storage_root.join(hash(namespace.as_bytes()));
        fs::create_dir_all(&directory).map_err(err)?;
        let lock = directory.join("session.lock");
        let mut lock_file=OpenOptions::new().write(true).create_new(true).open(&lock).map_err(|e| format!("Storage namespace is locked (close its owner; recover stale lock only after a crashed process): {e}"))?;
        self.storage_lock = Some(lock);
        let owner = json!({"schemaVersion":1,"pid":std::process::id(),"moduleId":self.module_id,"sessionId":request["sessionId"],"createdAtUnixMs":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(err)?.as_millis()});
        lock_file
            .write_all(owner.to_string().as_bytes())
            .map_err(err)?;
        lock_file.sync_all().map_err(err)?;
        let file = directory.join("records.json");
        let records: BTreeMap<String, Vec<u8>> = if file.exists() {
            if fs::metadata(&file).map_err(err)?.len() > 64 * 1024 * 1024 {
                return Err("Storage exceeds 64 MiB".into());
            }
            serde_json::from_slice(&fs::read(&file).map_err(err)?).map_err(err)?
        } else {
            BTreeMap::new()
        };
        for (key, bytes) in records {
            self.host_mut().write_storage(&key, bytes).map_err(err)?;
        }
        self.storage_file = Some(file);
        self.opened = true;
        self.active_id = request["sessionId"].as_str().map(str::to_owned);
        self.call("open", json!([request]))?;
        Ok(())
    }
    pub fn cancel(&mut self, request: &str) -> Result<(), String> {
        if !self.opened || self.closed {
            return Err("Session is not open".into());
        }
        self.call(
            "cancel",
            json!([serde_json::from_str::<Value>(request).map_err(err)?]),
        )?;
        Ok(())
    }
    pub fn close(&mut self) -> Result<(), String> {
        if self.closed || self.closing {
            return Ok(());
        }
        if !self.opened {
            self.closed = true;
            return Ok(());
        }
        self.closing = true;
        self.call("close", json!([]))?;
        Ok(())
    }
    pub fn tick(&mut self) -> Result<(), String> {
        if self.closed {
            return Ok(());
        }
        for _ in 0..32 {
            self.evaluator.pump_native_jobs().map_err(err)?;
            let messages = self
                .evaluator
                .drain_native_pipeline_messages()
                .map_err(err)?;
            if messages.is_empty() {
                break;
            }
            for message in messages {
                if message.payload_json.len() > 16 * 1024 * 1024 {
                    return Err("Native message exceeds 16 MiB".into());
                }
                match message.event.as_str() {
                    "native-sdk/request" => {
                        let value: Value =
                            serde_json::from_str(&message.payload_json).map_err(err)?;
                        if let Some(response) = self.bulk_request(&value["request"])? {
                            self.call("respond", json!([value["id"], response]))?;
                            continue;
                        }
                        let request: NativeHostApiRequest =
                            serde_json::from_value(value["request"].clone()).map_err(err)?;
                        // Static-only SDK: never route arbitrary JSC execution/namespace requests.
                        if !matches!(
                            request,
                            NativeHostApiRequest::GetHostInfo
                                | NativeHostApiRequest::ReadAssetBytes(_)
                                | NativeHostApiRequest::ListMountedBundles
                                | NativeHostApiRequest::ReadStorage(_)
                                | NativeHostApiRequest::WriteStorage(_)
                                | NativeHostApiRequest::DeleteStorage(_)
                                | NativeHostApiRequest::ListStorageKeys(_)
                                | NativeHostApiRequest::HashBytes(_)
                                | NativeHostApiRequest::VerifySignature(_)
                        ) {
                            return Err("Unsupported static Native host request".into());
                        }
                        let response = match self.persist(&request) {
                            Ok(()) => match request {
                                NativeHostApiRequest::HashBytes(value)
                                    if value.algorithm == "sha256" =>
                                {
                                    json!({"ok":true,"payload":{"type":"hash","value":hash(&value.bytes)}})
                                }
                                other => serde_json::to_value(dispatch_native_host_api_request(
                                    self.host_mut(),
                                    other,
                                ))
                                .map_err(err)?,
                            },
                            Err(error) => {
                                json!({"ok":false,"error":{"code":"storageError","message":error}})
                            }
                        };
                        self.call("respond", json!([value["id"], response]))?;
                    }
                    "native-sdk/event" => {
                        let event: Value =
                            serde_json::from_str(&message.payload_json).map_err(err)?;
                        if message.payload_json.len() > 65536
                            || event["sessionId"].as_str() != self.active_id.as_deref()
                        {
                            return Err("Invalid embedded event".into());
                        }
                        if self.events.len() >= 256 {
                            return Err("Parent must drain Native events".into());
                        }
                        if event["type"] == "closed" {
                            self.release_renderer()?;
                            self.closed = true;
                            if let Some(lock) = self.storage_lock.take() {
                                fs::remove_file(lock).map_err(err)?;
                            }
                        }
                        self.events.push_back(message.payload_json);
                    }
                    _ => {
                        self.projection
                            .apply_pipeline_event(&message.event, &message.payload_json)
                            .map_err(err)?;
                    }
                }
            }
        }
        if !self.closed {
            self.render()?;
        }
        Ok(())
    }
    fn bulk_request(&mut self, request: &Value) -> Result<Option<Value>, String> {
        let params = &request["params"];
        let payload = match request["method"].as_str() {
            Some("readAssetChunk") => {
                let url = params["url"].as_str().ok_or("Invalid asset chunk URL")?;
                let offset = params["offset"]
                    .as_u64()
                    .and_then(|v| usize::try_from(v).ok())
                    .ok_or("Invalid asset chunk offset")?;
                let bytes = self
                    .host_mut()
                    .inspect_assets()
                    .find(|(name, _)| *name == url)
                    .map(|(_, bytes)| bytes);
                let Some(bytes) = bytes else {
                    return Ok(Some(
                        json!({"ok":false,"error":{"code":"assetNotFound","message":"Native asset not found"}}),
                    ));
                };
                if offset > bytes.len() {
                    return Err("Asset chunk is out of bounds".into());
                }
                json!({"type":"assetChunk","value":{"size":bytes.len(),"bytes":&bytes[offset..(offset+65536).min(bytes.len())]}})
            }
            Some("hashStart") => {
                if self.hashes.len() >= 16 {
                    return Err("Too many native hash streams".into());
                }
                self.next_hash += 1;
                self.hashes.insert(self.next_hash, Sha256::new());
                json!({"type":"hashStream","value":self.next_hash})
            }
            Some("hashChunk") => {
                let id = params["id"].as_u64().ok_or("Invalid hash ID")?;
                let bytes: Vec<u8> =
                    serde_json::from_value(params["bytes"].clone()).map_err(err)?;
                if bytes.len() > 65536 {
                    return Err("Hash chunk exceeds limit".into());
                }
                self.hashes
                    .get_mut(&id)
                    .ok_or("Unknown hash stream")?
                    .update(bytes);
                return Ok(Some(json!({"ok":true})));
            }
            Some("hashFinish") => {
                let id = params["id"].as_u64().ok_or("Invalid hash ID")?;
                let digest = self
                    .hashes
                    .remove(&id)
                    .ok_or("Unknown hash stream")?
                    .finalize();
                json!({"type":"hash","value":format!("{digest:x}")})
            }
            _ => return Ok(None),
        };
        Ok(Some(json!({"ok":true,"payload":payload})))
    }
    fn persist(&mut self, request: &NativeHostApiRequest) -> Result<(), String> {
        if !matches!(
            request,
            NativeHostApiRequest::WriteStorage(_) | NativeHostApiRequest::DeleteStorage(_)
        ) {
            return Ok(());
        }
        let file = self
            .storage_file
            .as_ref()
            .ok_or("Storage session is not open")?
            .clone();
        let mut records: BTreeMap<String, Vec<u8>> = self
            .host_mut()
            .inspect_storage()
            .map(|(k, v)| (k.to_string(), v.to_vec()))
            .collect();
        match request {
            NativeHostApiRequest::WriteStorage(value) => {
                records.insert(value.key.clone(), value.value.clone());
            }
            NativeHostApiRequest::DeleteStorage(value) => {
                records.remove(&value.key);
            }
            _ => {}
        }
        super::storage::write_records(&file, &records)
    }
    pub unsafe fn attach(
        &mut self,
        layer: *mut c_void,
        width: u32,
        height: u32,
        scale: f64,
    ) -> Result<(), String> {
        extern "C" {
            fn pthread_main_np() -> i32;
        }
        if pthread_main_np() != 1 {
            return Err("Metal attachment requires the macOS main thread".into());
        }
        if layer.is_null()
            || self.window.is_some()
            || self.opened
            || self.closed
            || self.closing
            || self.host.is_none()
        {
            return Err("Attach one parent-owned CAMetalLayer before open".into());
        }
        self.dimensions(width, height, scale)?;
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());
        let surface = instance
            .create_surface_unsafe(wgpu::SurfaceTargetUnsafe::CoreAnimationLayer(layer))
            .map_err(err)?;
        self.window = Some(
            NativeProductWindowInMemoryRuntime::bootstrap_embedded(
                &instance,
                surface,
                NativeProductWindowPhysicalSize::new(width, height),
                self.host.take().unwrap(),
            )
            .map_err(err)?,
        );
        Ok(())
    }
    fn dimensions(&mut self, width: u32, height: u32, scale: f64) -> Result<(), String> {
        if width == 0
            || height == 0
            || width > 16384
            || height > 16384
            || !scale.is_finite()
            || scale <= 0.0
            || scale > 8.0
        {
            return Err("Invalid physical surface size or scale".into());
        }
        self.width = width;
        self.height = height;
        self.scale = scale;
        Ok(())
    }
    pub fn resize(&mut self, width: u32, height: u32, scale: f64) -> Result<(), String> {
        self.dimensions(width, height, scale)?;
        self.window
            .as_mut()
            .ok_or("No surface attached")?
            .resize_to_physical_size(NativeProductWindowPhysicalSize::new(width, height))
            .map_err(err)?;
        Ok(())
    }
    fn dispatch_intent(&mut self, intent: &NativeRendererIntent) -> Result<(), String> {
        if intent.r#type == "user/input_command" {
            let payload: Value =
                serde_json::from_str(intent.payload_json.as_deref().unwrap_or("{}"))
                    .map_err(err)?;
            if payload["command"] == "advance"
                && payload["pressed"] != false
                && self.projection.reveal_dialogue_on_advance()
            {
                return Ok(());
            }
        }
        self.evaluator
            .dispatch_renderer_intent(intent)
            .map_err(err)?;
        Ok(())
    }
    fn render(&mut self) -> Result<(), String> {
        let frame = self.projection.project_now().map_err(err)?;
        for intent in self.projection.drain_intents() {
            self.dispatch_intent(&intent)?;
        }
        if let Some(window) = self.window.as_mut() {
            let mut frame: Value = serde_json::from_str(&frame.json).map_err(err)?;
            frame["container"] = json!({"width":self.width as f64/self.scale,"height":self.height as f64/self.scale,"devicePixelRatio":self.scale});
            let rendered = window
                .render_projection_json_with_media_teardown(&frame.to_string())
                .map_err(err)?;
            if rendered
                .synced_frame
                .frame
                .frame
                .texture_upload_sync
                .pending_requests
                .is_empty()
            {
                let outcome = window.present_frame(true).map_err(err)?;
                if outcome.surface_refresh_recommended {
                    window
                        .resize_to_physical_size(NativeProductWindowPhysicalSize::new(
                            self.width,
                            self.height,
                        ))
                        .map_err(err)?;
                }
            }
            let intents = window.host_mut().drain_renderer_intents().map_err(err)?;
            for intent in intents {
                self.dispatch_intent(&intent)?;
            }
        }
        Ok(())
    }
    pub fn input(&mut self, input: &str) -> Result<(), String> {
        if !self.opened || self.closed || self.closing {
            return Err("Session is not active".into());
        }
        let input: Value = serde_json::from_str(input).map_err(err)?;
        match input["type"].as_str() {
            Some(kind @ ("pointer" | "touch")) => {
                let x = input["x"]
                    .as_f64()
                    .filter(|x| x.is_finite())
                    .ok_or("Invalid pointer x")?;
                let y = input["y"]
                    .as_f64()
                    .filter(|y| y.is_finite())
                    .ok_or("Invalid pointer y")?;
                let window = self
                    .window
                    .as_mut()
                    .ok_or("Pointer input requires a surface")?;
                let (renderer, host) = window.renderer_and_host_mut();
                let point = StageClientPoint {
                    client_x: x,
                    client_y: y,
                };
                if kind == "touch" {
                    let id = input["id"].as_u64().ok_or("Invalid touch id")?;
                    let phase = match input["phase"].as_str() {
                        Some("press") => winit::event::TouchPhase::Started,
                        Some("move") => winit::event::TouchPhase::Moved,
                        Some("release") => winit::event::TouchPhase::Ended,
                        Some("cancel") => winit::event::TouchPhase::Cancelled,
                        _ => return Err("Invalid touch phase".into()),
                    };
                    if let Some(delta) = self
                        .input
                        .dispatch_touch(renderer, host, id, phase, point)
                        .map_err(err)?
                    {
                        if let Some(frame) = renderer.state().frame() {
                            let layout = &frame.graph.layout;
                            let logical =
                                quajs_wgpu_renderer::stage_layout::client_point_to_stage_logical(
                                    layout,
                                    delta.anchor,
                                    Default::default(),
                                );
                            if logical.inside_stage {
                                self.projection.scroll_at_logical_with_layout(
                                    logical.x,
                                    logical.y,
                                    delta.dx / layout.scale,
                                    delta.dy / layout.scale,
                                    Some(layout),
                                );
                            }
                        }
                    }
                    return Ok(());
                }
                match input["phase"].as_str() {
                    Some("move") => {
                        self.input
                            .dispatch_pointer_move(renderer, host, point)
                            .map_err(err)?;
                    }
                    Some(phase @ ("press" | "release")) => {
                        self.input
                            .dispatch_pointer_event(
                                renderer,
                                host,
                                if phase == "press" {
                                    NativePointerEventPhase::Press
                                } else {
                                    NativePointerEventPhase::Release
                                },
                                point,
                                NativePointerButton::Primary,
                            )
                            .map_err(err)?;
                    }
                    _ => return Err("Invalid pointer phase".into()),
                }
            }
            Some("gamepad") => {
                let pad = input["gamepad"]
                    .as_u64()
                    .filter(|n| *n <= u32::MAX as u64)
                    .ok_or("Invalid gamepad id")?;
                let button = input["button"]
                    .as_u64()
                    .and_then(|n| u8::try_from(n).ok())
                    .ok_or("Invalid gamepad button")?;
                let pressed = input["pressed"]
                    .as_bool()
                    .ok_or("Invalid gamepad pressed flag")?;
                let window = self
                    .window
                    .as_mut()
                    .ok_or("Gamepad input requires a surface")?;
                let (renderer, host) = window.renderer_and_host_mut();
                self.input
                    .dispatch_gamepad(renderer, host, pad, button, pressed)
                    .map_err(err)?;
            }
            Some("gamepadDisconnect") => {
                let pad = input["gamepad"]
                    .as_u64()
                    .filter(|n| *n <= u32::MAX as u64)
                    .ok_or("Invalid gamepad id")?;
                let mut controller = std::mem::take(&mut self.input);
                let result = controller
                    .release_gamepad_buttons(self.host_mut(), Some(pad))
                    .map_err(err);
                self.input = controller;
                result?;
            }
            Some("advance") => {
                self.dispatch_intent(&NativeRendererIntent {
                            r#type: "user/input_command".into(),
                            payload_json: Some(
                                json!({"command":"advance","pressed":true,"source":"native-sdk","device":"keyboard","timestamp":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(err)?.as_millis() as u64})
                                    .to_string(),
                            ),
                        })?;
            }
            Some("focus") => {
                let focused = input["focused"].as_bool().ok_or("Invalid focus")?;
                if let Some(window) = self.window.as_mut() {
                    if !focused {
                        self.input.cancel_pointer_interaction(window.renderer_mut());
                        self.input.cancel_touch(window.renderer_mut());
                    }
                }
                let mut controller = std::mem::take(&mut self.input);
                let result = controller
                    .dispatch_focus_event(self.host_mut(), focused)
                    .map_err(err);
                self.input = controller;
                result?;
            }
            _ => return Err("Unsupported Native input type".into()),
        }
        Ok(())
    }
    fn release_renderer(&mut self) -> Result<(), String> {
        if let Some(mut window) = self.window.take() {
            window.shutdown_with_media_teardown().map_err(err)?;
        }
        Ok(())
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.release_renderer();
        if let Some(lock) = self.storage_lock.take() {
            let _ = fs::remove_file(lock);
        }
    }
}
