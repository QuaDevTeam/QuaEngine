//! Chrome DevTools Protocol (CDP) debug endpoint for the native dev window.
//!
//! When `QUA_NATIVE_RENDERER_CONTROL=<host:port>` is set, the window smoke app
//! serves a localhost CDP endpoint so external tooling can drive the live
//! window like a browser: query the draw-command tree, inject pointer input,
//! wait for commands, and capture frames.
//!
//! Exposed surfaces:
//! - `GET /json/version` and `GET /json/list` — standard CDP discovery.
//! - `WS /devtools/page/qua-native` — CDP JSON-RPC with `id` correlation.
//!
//! Implemented method subset: `Browser.getVersion`, `Target.getTargets` /
//! `attachToTarget` / `setDiscoverTargets`, `Page.enable` / `getFrameTree` /
//! `captureScreenshot`, `DOM.enable` / `getDocument` / `querySelector(All)` /
//! `getBoxModel` / `getContentQuads`, `Input.enable` / `dispatchMouseEvent`,
//! `Runtime.enable`, plus QuaEngine extensions `Qua.listCommands`,
//! `Qua.waitForCommand`, and `Qua.captureToFile`. Everything else answers with
//! CDP `-32601` ("wasn't found") instead of being silently faked.
//!
//! All coordinates follow CDP conventions: CSS pixels of the window viewport
//! (the 960x540 logical window, not 1920x1080 stage units). Requests that need
//! the live frame are executed on the event-loop thread inside the normal
//! frame closures, sharing the exact input and capture paths used by the demo
//! E2E. This is a development/diagnostic channel only; it is never enabled by
//! default and binds localhost only.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use base64::Engine;
use quajs_native_runtime::{InMemoryNativeHostApi, NativeHostApi, NativeRendererIntent};
use quajs_wgpu_renderer::input::{NativePointerButton, NativePointerEventPhase};
use quajs_wgpu_renderer::renderer::{NativeRenderBackend, NativeRenderer};
use quajs_wgpu_renderer::stage_layout::StageClientPoint;
use serde_json::{json, Map, Value};
use sha1::{Digest, Sha1};
use winit::event_loop::EventLoopProxy;

use super::editor_preview;
use super::error::NativeWindowSmokeError;
use super::input::NativeWindowSmokeInputState;

pub const WINDOW_CONTROL_ENV: &str = "QUA_NATIVE_RENDERER_CONTROL";

const CDP_TARGET_ID: &str = "qua-native-page";
const CDP_SESSION_ID: &str = "qua-native-session";
const CDP_WS_PATH: &str = "/devtools/page/qua-native";
const DEFAULT_WAIT_TIMEOUT_MS: u64 = 5_000;
const MAX_WAIT_TIMEOUT_MS: u64 = 60_000;
const MAX_HTTP_HEAD_BYTES: usize = 16 * 1024;

pub(super) fn native_window_control_addr() -> Option<String> {
    if crate::packaged_app::enabled() { return None; }
    let value = std::env::var(WINDOW_CONTROL_ENV).ok()?;
    let value = value.trim();
    (!value.is_empty() && value != "0" && !value.eq_ignore_ascii_case("false"))
        .then(|| value.to_string())
}

/// One CDP request routed to the event-loop thread. `reply` carries either the
/// CDP `result` payload or an error message that becomes a `-32000` error.
struct CdpTask {
    id: Value,
    session_id: Option<String>,
    method: String,
    params: Value,
    reply: Sender<Result<Value, String>>,
}

struct PendingWait {
    id: Value,
    session_id: Option<String>,
    command_id: String,
    deadline: Instant,
    reply: Sender<Result<Value, String>>,
}

struct PendingCapture {
    id: Value,
    session_id: Option<String>,
    file_path: Option<String>,
    reply: Sender<Result<Value, String>>,
}

pub(super) struct NativeWindowControl {
    pub(super) performance: Arc<super::performance::PerformanceMonitor>,
    rx: Receiver<CdpTask>,
    wake_count: Arc<AtomicUsize>,
    pending_waits: Vec<PendingWait>,
    pending_captures: Vec<PendingCapture>,
    inspector: super::inspector::InspectorSnapshot,
    editor_error: Option<String>,
    editor_replies: std::collections::HashMap<String, (Instant, Sender<Result<Value, String>>)>,
}

impl NativeWindowControl {
    pub(super) fn start(
        addr: &str,
        event_loop_proxy: EventLoopProxy<()>,
    ) -> Result<Self, NativeWindowSmokeError> {
        let listener = TcpListener::bind(addr).map_err(|error| {
            NativeWindowSmokeError::new(format!(
                "Failed to bind native window CDP endpoint at {addr}: {error}."
            ))
        })?;
        let (tx, rx) = channel::<CdpTask>();
        let wake_count = Arc::new(AtomicUsize::new(0));
        let thread_wake_count = wake_count.clone();
        let performance = Arc::new(super::performance::PerformanceMonitor::default());
        let thread_performance = performance.clone();
        let http_addr = addr.to_string();
        thread::Builder::new()
            .name("qua-native-cdp".to_string())
            .spawn(move || {
                for stream in listener.incoming() {
                    let Ok(stream) = stream else {
                        continue;
                    };
                    let tx = tx.clone();
                    let proxy = event_loop_proxy.clone();
                    let wake_count = thread_wake_count.clone();
                    let http_addr = http_addr.clone();
                    let performance = thread_performance.clone();
                    thread::spawn(move || {
                        handle_connection(
                            stream,
                            &http_addr,
                            tx,
                            proxy,
                            wake_count,
                            performance,
                        )
                    });
                }
            })
            .map_err(|error| {
                NativeWindowSmokeError::new(format!(
                    "Failed to spawn native window CDP listener thread: {error}."
                ))
            })?;
        log::info!("native window CDP endpoint listening on http://{addr}/json/version");
        Ok(Self {
            performance,
            rx,
            wake_count,
            pending_waits: Vec::new(),
            pending_captures: Vec::new(),
            inspector: Default::default(),
            editor_error: None,
            editor_replies: Default::default(),
        })
    }

    /// Whether a CDP client woke the event loop since the last redraw so
    /// `user_event` knows a frame is worth scheduling.
    pub(super) fn take_wake_pending(&self) -> bool {
        self.wake_count.swap(0, Ordering::Relaxed) > 0
    }

    /// Executes frame-dependent CDP methods and re-checks deferred ones. Runs
    /// inside the frame input closure where renderer/host access exists.
    pub(super) fn drain<B, A, V, F>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V, F>,
        host: &mut InMemoryNativeHostApi,
        input: &mut NativeWindowSmokeInputState,
        source: &str,
    ) -> Result<(), NativeWindowSmokeError>
    where
        B: NativeRenderBackend,
    {
        while let Ok(task) = self.rx.try_recv() {
            self.execute(task, renderer, host, input, source)?;
        }
        self.check_waits(renderer);
        self.editor_replies.retain(|_, (deadline, reply)| {
            if Instant::now() < *deadline {
                true
            } else {
                let _ = reply.send(Err("Editor command timed out".into()));
                false
            }
        });
        Ok(())
    }

    fn execute<B, A, V, F>(
        &mut self,
        task: CdpTask,
        renderer: &mut NativeRenderer<B, A, V, F>,
        host: &mut InMemoryNativeHostApi,
        input: &mut NativeWindowSmokeInputState,
        source: &str,
    ) -> Result<(), NativeWindowSmokeError>
    where
        B: NativeRenderBackend,
    {
        let CdpTask {
            id,
            session_id,
            method,
            params,
            reply,
        } = task;
        match method.as_str() {
            "Page.captureScreenshot" => {
                self.pending_captures.push(PendingCapture {
                    id,
                    session_id,
                    file_path: None,
                    reply,
                });
            }
            "Qua.captureToFile" => {
                let path = params
                    .get("path")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                if !path.ends_with(".png") {
                    let _ = reply.send(Err("Qua.captureToFile path must end in .png".to_string()));
                } else {
                    self.pending_captures.push(PendingCapture {
                        id,
                        session_id,
                        file_path: Some(path),
                        reply,
                    });
                }
            }
            "Qua.getDiagnostics" => {
                let _ = reply.send(Ok(json!({"error": self.editor_error})));
            }
            "Qua.getStorage" => {
                let result = authorize_editor(&params)
                    .and_then(|()| super::storage::inspect(host, &params["request"]));
                let _ = reply.send(result);
            }
            "Qua.setAudioMuted" => {
                let result = authorize_editor(&params).and_then(|()| {
                    let muted = params["muted"]
                        .as_bool()
                        .ok_or_else(|| "muted must be a boolean".to_string())?;
                    #[cfg(feature = "native-audio-rodio")]
                    crate::audio_backend::output::set_muted(muted);
                    // No output device is present in builds without native audio.
                    Ok(json!({"muted": muted}))
                });
                let _ = reply.send(result);
            }
            "Qua.listCommands" => {
                let _ = reply.send(Ok(list_commands_result(renderer)));
            }
            "DOM.getDocument" => {
                self.inspector =
                    super::inspector::InspectorSnapshot::build(renderer, source, &self.inspector);
                let _ = reply.send(Ok(json!({"root": self.inspector.root})));
            }
            "DOM.querySelector" => {
                self.inspector =
                    super::inspector::InspectorSnapshot::build(renderer, source, &self.inspector);
                let id = self
                    .inspector
                    .query(params["selector"].as_str().unwrap_or_default());
                let _ = reply.send(Ok(json!({"nodeId":id})));
            }
            "DOM.querySelectorAll" => {
                self.inspector =
                    super::inspector::InspectorSnapshot::build(renderer, source, &self.inspector);
                let id = self
                    .inspector
                    .query(params["selector"].as_str().unwrap_or_default());
                let _ = reply.send(Ok(json!({"nodeIds": if id == 0 {vec![]} else {vec![id]}})));
            }
            "DOM.getBoxModel" | "DOM.getContentQuads" | "CSS.getComputedStyleForNode" => {
                let node_id = params["nodeId"]
                    .as_i64()
                    .or_else(|| params["backendNodeId"].as_i64())
                    .unwrap_or(0);
                let _ = reply.send(self.inspector.details(node_id, &method));
            }
            "Qua.editorCommand" => {
                if self.editor_replies.len() >= 8 {
                    let _ = reply.send(Err("Too many editor commands".into()));
                } else {
                    match editor_command_intent(&params).and_then(|intent| {
                        host.emit_renderer_intent(intent)
                            .map_err(|error| format!("{error:?}"))
                    }) {
                        Ok(_) => {
                            self.editor_replies.insert(
                                params["requestId"].as_str().unwrap_or_default().into(),
                                (Instant::now() + Duration::from_secs(35), reply),
                            );
                        }
                        Err(error) => {
                            let _ = reply.send(Err(error));
                        }
                    }
                }
            }
            "Input.dispatchMouseEvent" => {
                let result = self.dispatch_mouse_event(renderer, host, input, &params);
                let _ = reply.send(result);
            }
            "Qua.waitForCommand" => {
                let command_id = params
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                if command_id.is_empty() {
                    let _ = reply.send(Err("Qua.waitForCommand requires a string id".to_string()));
                } else {
                    let timeout = params
                        .get("timeoutMs")
                        .and_then(Value::as_u64)
                        .unwrap_or(DEFAULT_WAIT_TIMEOUT_MS)
                        .min(MAX_WAIT_TIMEOUT_MS);
                    self.pending_waits.push(PendingWait {
                        id,
                        session_id,
                        command_id,
                        deadline: Instant::now() + Duration::from_millis(timeout),
                        reply,
                    });
                    self.check_waits(renderer);
                }
            }
            _ => {
                let _ = reply.send(Err(format!("'{method}' wasn't found")));
            }
        }
        Ok(())
    }

    pub(super) fn editor_error(&mut self, payload: &str) {
        if let Ok(value) = serde_json::from_str::<Value>(payload) {
            self.editor_error = Some(
                value["message"]
                    .as_str()
                    .unwrap_or(payload)
                    .chars()
                    .take(8000)
                    .collect(),
            );
        }
    }
    pub(super) fn editor_response(&mut self, payload: &str) {
        if let Ok(value) = serde_json::from_str::<Value>(payload) {
            if let Some((_, reply)) = value["id"]
                .as_str()
                .and_then(|id| self.editor_replies.remove(id))
            {
                let result = if let Some(error) = value["error"].as_str() {
                    Err(error.to_string())
                } else {
                    Ok(value["result"].clone())
                };
                let _ = reply.send(result);
            }
        }
    }

    /// Called from the frame capture closure: captures the current frame once
    /// and fulfils every queued screenshot request.
    pub(super) fn drain_captures(
        &mut self,
        capture: &quajs_wgpu_renderer::renderer::RealWgpuEncodedFrameCapture,
    ) -> Result<(), NativeWindowSmokeError> {
        if self.pending_captures.is_empty() {
            return Ok(());
        }
        let requests = std::mem::take(&mut self.pending_captures);
        let base64_png = base64::engine::general_purpose::STANDARD.encode(&capture.bytes);
        for pending in requests {
            let result = match &pending.file_path {
                Some(path) => match std::fs::write(path, &capture.bytes) {
                    Ok(()) => Ok(json!({
                        "path": path,
                        "bytes": capture.bytes.len(),
                    })),
                    Err(error) => Err(format!("failed to write capture to {path}: {error}")),
                },
                None => Ok(json!({ "data": base64_png })),
            };
            let _ = pending.reply.send(result);
        }
        Ok(())
    }

    pub(super) fn has_pending_captures(&self) -> bool {
        !self.pending_captures.is_empty()
    }

    fn dispatch_mouse_event<B, A, V, F>(
        &self,
        renderer: &mut NativeRenderer<B, A, V, F>,
        host: &mut InMemoryNativeHostApi,
        input: &mut NativeWindowSmokeInputState,
        params: &Value,
    ) -> Result<Value, String>
    where
        B: NativeRenderBackend,
    {
        let event_type = params
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let x = params.get("x").and_then(Value::as_f64).unwrap_or(f64::NAN);
        let y = params.get("y").and_then(Value::as_f64).unwrap_or(f64::NAN);
        if !x.is_finite() || !y.is_finite() {
            return Err("Input.dispatchMouseEvent requires finite x and y".to_string());
        }
        let point = StageClientPoint {
            client_x: x,
            client_y: y,
        };
        let button = match params
            .get("button")
            .and_then(Value::as_str)
            .unwrap_or("left")
        {
            "right" => NativePointerButton::Secondary,
            "middle" => NativePointerButton::Auxiliary,
            _ => NativePointerButton::Primary,
        };
        let result = match event_type {
            "mousePressed" => input.dispatch_pointer_event(
                renderer,
                host,
                NativePointerEventPhase::Press,
                point,
                button,
            ),
            "mouseReleased" => input.dispatch_pointer_event(
                renderer,
                host,
                NativePointerEventPhase::Release,
                point,
                button,
            ),
            "mouseMoved" => input.dispatch_pointer_move(renderer, host, point),
            _ => {
                return Err(format!(
                    "Input.dispatchMouseEvent type '{event_type}' is not supported"
                ))
            }
        };
        result.map(|_| json!({})).map_err(|error| error.to_string())
    }

    fn check_waits<B, A, V, F>(&mut self, renderer: &mut NativeRenderer<B, A, V, F>)
    where
        B: NativeRenderBackend,
    {
        if self.pending_waits.is_empty() {
            return;
        }
        let now = Instant::now();
        let pending = std::mem::take(&mut self.pending_waits);
        for wait in pending {
            let visible = renderer.state().frame().is_some_and(|frame| {
                frame
                    .graph
                    .commands()
                    .iter()
                    .any(|command| command.id == wait.command_id)
            });
            if visible {
                let _ = wait.reply.send(Ok(json!({ "id": wait.command_id })));
            } else if now >= wait.deadline {
                let _ = wait.reply.send(Err(format!(
                    "Qua.waitForCommand '{}' timed out",
                    wait.command_id
                )));
            } else {
                self.pending_waits.push(wait);
            }
        }
        // Keep the loop producing frames while waits are outstanding.
        if !self.pending_waits.is_empty() {
            self.wake_count.fetch_add(1, Ordering::Relaxed);
        }
    }
}

// ─── Frame-inspection results ────────────────────────────────────────────────

fn authorize_editor(params: &Value) -> Result<(), String> {
    let expected = std::env::var("QUA_NATIVE_EDITOR_TOKEN")
        .ok()
        .filter(|token| !token.is_empty());
    if !editor_preview::enabled()
        || expected.is_none()
        || params.get("token").and_then(Value::as_str) != expected.as_deref()
    {
        return Err("Editor preview is not authorized".into());
    }
    Ok(())
}

fn editor_command_intent(params: &Value) -> Result<NativeRendererIntent, String> {
    authorize_editor(params)?;
    let id = params
        .get("requestId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let command = params.get("command").unwrap_or(&Value::Null);
    if id.is_empty() || id.len() > 80 || !valid_editor_command(command) {
        return Err("Invalid editor preview command".into());
    }
    Ok(NativeRendererIntent {
        r#type: "editor/preview/request".into(),
        payload_json: Some(json!({ "id": id, "command": command }).to_string()),
    })
}

fn valid_editor_command(command: &Value) -> bool {
    match command.get("action").and_then(Value::as_str) {
        Some("status" | "step") => true,
        Some("storage") => {
            let request = &command["request"];
            let action = request["action"].as_str().unwrap_or_default();
            ["catalog", "page", "detail"].contains(&action)
                && (action == "catalog"
                    || request["source"].as_str().is_some_and(|source| {
                        ["engine:snapshots", "engine:slots", "engine:payloads"].contains(&source)
                    }))
                && (action != "detail"
                    || request["key"].as_str().is_some_and(|key| key.len() <= 4096))
                && request
                    .get("offset")
                    .is_none_or(|offset| offset.as_u64().is_some_and(|offset| offset <= 100000))
                && request
                    .get("filter")
                    .is_none_or(|filter| filter.as_str().is_some_and(|filter| filter.len() <= 1024))
        }
        Some("seek") => {
            command
                .get("path")
                .and_then(Value::as_str)
                .is_some_and(|path| !path.is_empty() && path.len() <= 4096)
                && command
                    .get("stepIndex")
                    .and_then(Value::as_u64)
                    .is_some_and(|index| index <= 100000)
        }
        _ => false,
    }
}

#[cfg(test)]
mod editor_command_tests {
    use super::*;
    #[test]
    fn rejects_arbitrary_native_editor_commands() {
        assert!(valid_editor_command(
            &json!({"action":"storage","request":{"action":"catalog"}})
        ));
        assert!(!valid_editor_command(
            &json!({"action":"storage","request":{"action":"delete","source":"engine:snapshots"}})
        ));
        assert!(!valid_editor_command(
            &json!({"action":"storage","request":{"action":"page","source":"/etc/passwd"}})
        ));
        assert!(valid_editor_command(&json!({ "action": "step" })));
        assert!(valid_editor_command(
            &json!({ "action": "seek", "path": "scene.qs", "stepIndex": 2 })
        ));
        assert!(!valid_editor_command(
            &json!({ "action": "evaluate", "code": "bad" })
        ));
        assert!(!valid_editor_command(
            &json!({ "action": "seek", "path": "scene.qs", "stepIndex": -1 })
        ));
        assert!(!valid_editor_command(
            &json!({ "action": "seek", "stepIndex": 0 })
        ));
    }
}

fn list_commands_result<B, A, V, F>(renderer: &NativeRenderer<B, A, V, F>) -> Value
where
    B: NativeRenderBackend,
{
    let Some(frame) = renderer.state().frame() else {
        return json!({ "commands": [], "frameReady": false });
    };
    let commands = frame
        .graph
        .commands()
        .iter()
        .map(|command| {
            let text = command_text(command);
            json!({
                "id": command.id,
                "kind": format!("{:?}", command.kind),
                "bounds": {
                    "x": command.bounds.x,
                    "y": command.bounds.y,
                    "width": command.bounds.width,
                    "height": command.bounds.height,
                },
                "zIndex": command.z_index,
                "interactive": command.interactive,
                "text": text,
            })
        })
        .collect::<Vec<_>>();
    json!({ "commands": commands, "frameReady": true })
}

pub(super) fn command_text(
    command: &quajs_wgpu_renderer::render_graph::DrawCommand,
) -> Option<String> {
    match &command.params {
        quajs_wgpu_renderer::render_graph::DrawCommandParams::Text(params) => {
            Some(params.text.clone())
        }
        quajs_wgpu_renderer::render_graph::DrawCommandParams::UiButton(params) => {
            Some(params.label.clone())
        }
        _ => None,
    }
}

pub(super) fn box_model_json(x: f64, y: f64, width: f64, height: f64) -> Value {
    let border = [x, y, x + width, y, x + width, y + height, x, y + height];
    json!({
        "content": border,
        "padding": border,
        "border": border,
        "margin": border,
        "width": width.round() as i64,
        "height": height.round() as i64,
    })
}

// ─── Connection handling ─────────────────────────────────────────────────────

fn handle_connection(
    stream: TcpStream,
    addr: &str,
    tx: Sender<CdpTask>,
    proxy: EventLoopProxy<()>,
    wake_count: Arc<AtomicUsize>,
    performance: Arc<super::performance::PerformanceMonitor>,
) {
    let Some(head) = read_http_head(&stream) else {
        return;
    };
    let request_line = head.lines().next().unwrap_or_default().to_string();
    let path = request_line
        .split_whitespace()
        .nth(1)
        .unwrap_or_default()
        .to_string();
    if path.starts_with("/qua/preview") {
        editor_preview::serve(stream, &head, &path);
        return;
    }
    if path.starts_with("/json") {
        serve_cdp_discovery(stream, addr, &path);
        return;
    }
    let (route, _query) = path.split_once('?').unwrap_or((&path, ""));
    if route != CDP_WS_PATH {
        let mut stream = stream;
        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
        return;
    }
    serve_cdp_websocket(stream, &head, tx, proxy, wake_count, performance);
}

fn read_http_head(stream: &TcpStream) -> Option<String> {
    let mut reader = BufReader::new(stream);
    let mut head = String::new();
    loop {
        let mut line = String::new();
        let read = reader.read_line(&mut line).ok()?;
        if read == 0 || head.len() + read > MAX_HTTP_HEAD_BYTES {
            return None;
        }
        head.push_str(&line);
        if line == "\r\n" {
            return Some(head);
        }
    }
}

fn serve_cdp_discovery(mut stream: TcpStream, addr: &str, path: &str) {
    let ws_url = format!("ws://{addr}{CDP_WS_PATH}");
    let body = if path.starts_with("/json/version") {
        json!({
            "Browser": "QuaEngine Native Renderer",
            "Protocol-Version": "1.3",
            "webSocketDebuggerUrl": ws_url,
        })
    } else {
        json!([{
            "id": CDP_TARGET_ID,
            "type": "page",
            "title": "QuaEngine Native Window",
            "url": "qua://native-window",
            "webSocketDebuggerUrl": ws_url,
            "devtoolsFrontendUrl": String::new(),
        }])
    };
    let body = body.to_string();
    let _ = stream.write_all(
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .as_bytes(),
    );
}

fn serve_cdp_websocket(
    mut stream: TcpStream,
    head: &str,
    tx: Sender<CdpTask>,
    proxy: EventLoopProxy<()>,
    wake_count: Arc<AtomicUsize>,
    performance: Arc<super::performance::PerformanceMonitor>,
) {
    // Complete the upgrade manually: the request head was already consumed by
    // `read_http_head`, so `tungstenite::accept` would block re-reading it.
    let Some(key) = head.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.eq_ignore_ascii_case("sec-websocket-key")
            .then(|| value.trim().to_string())
    }) else {
        return;
    };
    let mut hasher = Sha1::new();
    hasher.update(key.as_bytes());
    hasher.update(b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    let accept = base64::engine::general_purpose::STANDARD.encode(hasher.finalize());
    if stream
        .write_all(
            format!(
                "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n"
            )
            .as_bytes(),
        )
        .is_err()
    {
        return;
    }
    let mut socket =
        tungstenite::WebSocket::from_raw_socket(stream, tungstenite::protocol::Role::Server, None);
    loop {
        let message = match socket.read() {
            Ok(message) => message,
            Err(_) => break,
        };
        let tungstenite::Message::Text(text) = message else {
            continue;
        };
        let parsed = serde_json::from_str::<Value>(&text);
        let response = match parsed {
            Ok(request) => handle_cdp_request(request, &tx, &proxy, &wake_count, &performance),
            Err(error) => Some(json!({
                "id": Value::Null,
                "error": { "code": -32700, "message": format!("Parse error: {error}") },
            })),
        };
        let Some(response) = response else {
            continue;
        };
        if socket
            .send(tungstenite::Message::Text(response.to_string().into()))
            .is_err()
        {
            break;
        }
    }
}

/// Handles one CDP request. Immediate (frame-independent) methods are answered
/// inline; frame-dependent ones are routed to the event loop and block until
/// the reply arrives. Returns `None` for notifications (requests without id).
fn handle_cdp_request(
    request: Value,
    tx: &Sender<CdpTask>,
    proxy: &EventLoopProxy<()>,
    wake_count: &Arc<AtomicUsize>,
    performance: &super::performance::PerformanceMonitor,
) -> Option<Value> {
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let session_id = request
        .get("sessionId")
        .and_then(Value::as_str)
        .map(str::to_string);
    let params = request.get("params").cloned().unwrap_or(Value::Null);
    let id = request.get("id").cloned();
    let Some(id) = id else {
        // CDP notification — no response expected.
        return None;
    };
    let attach_session = |mut response: Map<String, Value>| {
        if let Some(session_id) = &session_id {
            response.insert("sessionId".to_string(), json!(session_id));
        }
        Value::Object(response)
    };
    let immediate: Option<Result<Value, String>> = match method.as_str() {
        "Qua.getPerformance" => Some(authorize_editor(&params).map(|_| {
            performance.sample(
                params
                    .get("enabled")
                    .and_then(Value::as_bool)
                    .unwrap_or(true),
            )
        })),
        "Browser.getVersion" => Some(Ok(json!({
            "protocolVersion": "1.3",
            "product": "QuaEngine Native Renderer",
            "revision": "0",
            "userAgent": "QuaEngine Native CDP",
            "jsVersion": "JavaScriptCore",
        }))),
        "Target.getTargets" => Some(Ok(json!({
            "targetInfos": [target_info_json()],
        }))),
        "Target.getTargetInfo" => Some(Ok(json!({
            "targetInfo": target_info_json(),
        }))),
        "Target.setDiscoverTargets" | "Target.setAutoAttach" => Some(Ok(json!({}))),
        "Target.attachToTarget" => Some(Ok(json!({
            "sessionId": CDP_SESSION_ID,
        }))),
        "Target.detachFromTarget" => Some(Ok(json!({}))),
        "CSS.enable" | "Page.enable" | "DOM.enable" | "Runtime.enable" | "Input.enable"
        | "Network.enable" | "Log.enable" => Some(Ok(json!({}))),
        "Page.getFrameTree" => Some(Ok(json!({
            "frameTree": {
                "frame": {
                    "id": CDP_TARGET_ID,
                    "loaderId": "qua-native-loader",
                    "url": "qua://native-window",
                    "securityOrigin": "qua://native-window",
                    "mimeType": "application/x-qua-stage",
                },
            },
        }))),
        "Page.getLayoutMetrics" => Some(Ok(json!({
            "cssLayoutViewport": { "clientWidth": 960, "clientHeight": 540 },
            "cssVisualViewport": {
                "offsetX": 0, "offsetY": 0, "pageX": 0, "pageY": 0,
                "clientWidth": 960, "clientHeight": 540,
                "scale": 1, "zoom": 1,
            },
            "cssContentSize": { "x": 0, "y": 0, "width": 960, "height": 540 },
        }))),
        _ => None,
    };
    if let Some(result) = immediate {
        return Some(match result {
            Ok(result) => attach_session(Map::from_iter([
                ("id".to_string(), id),
                ("result".to_string(), result),
            ])),
            Err(message) => attach_session(Map::from_iter([
                ("id".to_string(), id),
                (
                    "error".to_string(),
                    json!({ "code": -32000, "message": message }),
                ),
            ])),
        });
    }

    let (reply_tx, reply_rx) = channel::<Result<Value, String>>();
    if tx
        .send(CdpTask {
            id: id.clone(),
            session_id: session_id.clone(),
            method: method.clone(),
            params,
            reply: reply_tx,
        })
        .is_err()
    {
        return None;
    }
    wake_count.fetch_add(1, Ordering::Relaxed);
    let _ = proxy.send_event(());
    match reply_rx.recv() {
        Ok(Ok(result)) => Some(attach_session(Map::from_iter([
            ("id".to_string(), id),
            ("result".to_string(), result),
        ]))),
        Ok(Err(message)) => {
            let code = if message.ends_with("wasn't found") {
                -32601
            } else {
                -32000
            };
            Some(attach_session(Map::from_iter([
                ("id".to_string(), id),
                (
                    "error".to_string(),
                    json!({ "code": code, "message": message }),
                ),
            ])))
        }
        Err(_) => None,
    }
}

fn target_info_json() -> Value {
    json!({
        "targetId": CDP_TARGET_ID,
        "type": "page",
        "title": "QuaEngine Native Window",
        "url": "qua://native-window",
        "attached": true,
        "canAccessOpener": false,
    })
}
