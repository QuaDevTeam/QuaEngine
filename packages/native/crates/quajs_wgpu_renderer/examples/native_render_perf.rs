#![recursion_limit = "256"]
//! Headless real-GPU performance probe for the native renderer.
//!
//! Drives the same per-frame path the native window uses — Rust projection
//! runtime (typewriter/animation clocks) → container composition → renderer
//! JSON parse/validate/project/plan → real wgpu submission — against an
//! offscreen target, without a window, QPK, or JavaScriptCore.
//!
//! Device profiles:
//! - `desktop`: high-performance adapter, default WebGPU limits.
//! - `mobile`: low-power adapter, `Limits::downlevel_defaults()` (the GLES3 /
//!   older-Vulkan tier) with a 4096 texture cap, the practical phone floor.
//!   A scenario that fails here would fail on that class of phone regardless
//!   of raw speed.
//! - `mobile-strict`: the same with the 2048 GLES3 specification minimum.
//!
//! Resolutions model a 1080p desktop window, a modern phone in landscape
//! (844x390 @3x) and a low-end Android phone (800x360 @2x).
//!
//! Run:
//! `cargo run --release -p quajs_wgpu_renderer --features real-wgpu-native --example native_render_perf`
//! Optional args: `--frames N`, `--profile desktop|mobile|mobile-strict|all`,
//! `--only <scenario substring>`, `--resolution <name substring>`, `--json`,
//! `--capture <dir>` (raw RGBA readback of each static scenario, for pixel diffs).
//!
//! Timings are CPU wall-clock per stage. `gpuWaitMs` is the blocking wait for
//! the frame's submission to complete after CPU work; on a fast desktop GPU it
//! approximates queue latency, on a slow GPU it exposes fill-rate cost.
use std::time::{Duration, Instant};

use quajs_wgpu_renderer::projection_runtime::NativeRendererProjectionRuntime;
use quajs_wgpu_renderer::renderer::{
    parse_native_renderer_json_frame_input, InMemoryWgpuNativeRenderRuntimeExecutor,
    NativeRenderer, RealWgpuNativeRenderRuntimeDevice, RealWgpuNativeRenderRuntimeTarget,
    WgpuNativeRenderBackend, WgpuNativeRenderBackendConfig,
};
use serde_json::{json, Value};

type RealRenderer = NativeRenderer<
    WgpuNativeRenderBackend<
        InMemoryWgpuNativeRenderRuntimeExecutor<RealWgpuNativeRenderRuntimeDevice>,
    >,
>;

const FIXTURES: &[(&str, &str)] = &[
    (
        "ui-paint",
        include_str!("../../../test-fixtures/renderer/ui-paint-frame.json"),
    ),
    (
        "qui-qss-surface",
        include_str!("../../../test-fixtures/renderer/qui-qss-surface-frame.json"),
    ),
    (
        "box-shadow",
        include_str!("../../../test-fixtures/renderer/box-shadow-feather-frame.json"),
    ),
    (
        "native-controls",
        include_str!("../../../test-fixtures/renderer/native-controls-frame.json"),
    ),
];

#[derive(Clone, Copy)]
struct Resolution {
    name: &'static str,
    width: f64,
    height: f64,
    dpr: f64,
}

const RESOLUTIONS: &[Resolution] = &[
    Resolution {
        name: "desktop-1080p",
        width: 1920.0,
        height: 1080.0,
        dpr: 1.0,
    },
    Resolution {
        name: "phone-844x390@3",
        width: 844.0,
        height: 390.0,
        dpr: 3.0,
    },
    Resolution {
        name: "lowend-800x360@2",
        width: 800.0,
        height: 360.0,
        dpr: 2.0,
    },
];

#[derive(Clone, Copy, PartialEq)]
enum Profile {
    Desktop,
    Mobile,
    MobileStrict,
}

impl Profile {
    fn name(self) -> &'static str {
        match self {
            Profile::Desktop => "desktop",
            Profile::Mobile => "mobile",
            Profile::MobileStrict => "mobile-strict",
        }
    }
}

struct Args {
    frames: usize,
    only: Option<String>,
    resolution: Option<String>,
    capture_dir: Option<String>,
    profiles: Vec<Profile>,
    json: bool,
}

fn parse_args() -> Args {
    let mut args = Args {
        frames: 180,
        only: None,
        resolution: None,
        capture_dir: None,
        profiles: vec![Profile::Desktop, Profile::Mobile, Profile::MobileStrict],
        json: false,
    };
    let mut iter = std::env::args().skip(1);
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--frames" => args.frames = iter.next().and_then(|v| v.parse().ok()).unwrap_or(180),
            "--profile" => {
                args.profiles = match iter.next().as_deref() {
                    Some("desktop") => vec![Profile::Desktop],
                    Some("mobile") => vec![Profile::Mobile],
                    Some("mobile-strict") => vec![Profile::MobileStrict],
                    _ => vec![Profile::Desktop, Profile::Mobile, Profile::MobileStrict],
                }
            }
            "--json" => args.json = true,
            "--only" => args.only = iter.next(),
            "--resolution" => args.resolution = iter.next(),
            "--capture" => args.capture_dir = iter.next(),
            other => panic!("unsupported argument {other}"),
        }
    }
    args
}

struct Gpu {
    errors: std::sync::Arc<std::sync::Mutex<Vec<String>>>,
    adapter_name: String,
    backend: String,
    device: wgpu::Device,
    queue: wgpu::Queue,
}

fn create_gpu(profile: Profile) -> Result<Gpu, String> {
    let instance =
        wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle_from_env());
    let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: match profile {
            Profile::Desktop => wgpu::PowerPreference::HighPerformance,
            Profile::Mobile | Profile::MobileStrict => wgpu::PowerPreference::LowPower,
        },
        force_fallback_adapter: false,
        compatible_surface: None,
    }))
    .map_err(|error| format!("adapter: {error}"))?;
    let info = adapter.get_info();
    let required_limits = match profile {
        Profile::Desktop => wgpu::Limits::default(),
        // Downlevel (GLES3 / early Vulkan) limits with the 4096 texture floor
        // that effectively every shipping phone GPU reports. `mobile-strict`
        // keeps the 2048 GLES3 specification minimum.
        Profile::Mobile => wgpu::Limits {
            max_texture_dimension_2d: 4096,
            ..wgpu::Limits::downlevel_defaults()
        },
        Profile::MobileStrict => wgpu::Limits::downlevel_defaults(),
    };
    let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        label: Some("native-render-perf"),
        required_limits,
        ..Default::default()
    }))
    .map_err(|error| format!("device: {error}"))?;
    // Record validation errors instead of panicking so one limit violation
    // does not hide the rest of the compatibility report.
    let errors = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let sink = errors.clone();
    device.on_uncaptured_error(std::sync::Arc::new(move |error: wgpu::Error| {
        sink.lock().unwrap().push(error.to_string());
    }));
    Ok(Gpu {
        errors,
        adapter_name: info.name,
        backend: format!("{:?}", info.backend),
        device,
        queue,
    })
}

fn create_renderer(gpu: &Gpu, resolution: Resolution) -> RealRenderer {
    let target = RealWgpuNativeRenderRuntimeTarget::new(
        gpu.device.clone(),
        gpu.queue.clone(),
        wgpu::TextureFormat::Bgra8UnormSrgb,
        wgpu::Extent3d {
            width: (resolution.width * resolution.dpr).round() as u32,
            height: (resolution.height * resolution.dpr).round() as u32,
            depth_or_array_layers: 1,
        },
    );
    let executor = InMemoryWgpuNativeRenderRuntimeExecutor::with_device(
        RealWgpuNativeRenderRuntimeDevice::new(target),
    );
    NativeRenderer::new(WgpuNativeRenderBackend::with_runtime_executor(
        WgpuNativeRenderBackendConfig::default(),
        executor,
    ))
}

fn with_container(frame: &str, resolution: Resolution) -> String {
    let mut value: Value = serde_json::from_str(frame).expect("fixture JSON");
    value["container"] = json!({
        "width": resolution.width,
        "height": resolution.height,
        "devicePixelRatio": resolution.dpr,
    });
    serde_json::to_string(&value).unwrap()
}

/// A representative in-game screen: full-stage backdrop, translucent dialogue
/// panel with shadow and blur, quick-menu buttons, and a typewriter line that
/// keeps renderer-local work active every frame.
fn dialogue_scene_frame() -> String {
    dialogue_scene_frame_with(SceneEffects::ALL)
}

#[derive(Clone, Copy)]
struct SceneEffects {
    dialogue: bool,
    overlay: bool,
    backdrop_blur: bool,
    shadow: bool,
    opacity: bool,
}

impl SceneEffects {
    const ALL: Self = Self {
        dialogue: true,
        overlay: true,
        backdrop_blur: true,
        shadow: true,
        opacity: true,
    };
}

/// Static scene-effect isolation: which effect is responsible for GPU cost.
const SCENE_VARIANTS: &[(&str, SceneEffects)] = &[
    ("scene:all-effects", SceneEffects::ALL),
    (
        "scene:no-backdrop",
        SceneEffects {
            dialogue: true,
            overlay: true,
            backdrop_blur: false,
            shadow: true,
            opacity: true,
        },
    ),
    (
        "scene:no-shadow",
        SceneEffects {
            dialogue: true,
            overlay: true,
            backdrop_blur: true,
            shadow: false,
            opacity: true,
        },
    ),
    (
        "scene:no-opacity",
        SceneEffects {
            dialogue: true,
            overlay: true,
            backdrop_blur: true,
            shadow: true,
            opacity: false,
        },
    ),
    (
        "scene:plain",
        SceneEffects {
            dialogue: true,
            overlay: true,
            backdrop_blur: false,
            shadow: false,
            opacity: false,
        },
    ),
    (
        "scene:dialogue-only",
        SceneEffects {
            overlay: false,
            ..SceneEffects::ALL
        },
    ),
    (
        "scene:overlay-only",
        SceneEffects {
            dialogue: false,
            ..SceneEffects::ALL
        },
    ),
];

fn dialogue_scene_frame_with(effects: SceneEffects) -> String {
    let buttons: Vec<Value> = ["Auto", "Skip", "Log", "Save", "Load", "Config"]
        .iter()
        .enumerate()
        .map(|(index, label)| {
            json!({
                "id": format!("quick-{index}"), "kind": "Button", "visible": true,
                "bounds": { "x": 1180 + index as i32 * 112, "y": 1010, "width": 100, "height": 40 },
                "text": label,
                "style": { "backgroundColor": "rgba(255,255,255,0.12)", "borderRadius": 8, "color": "#f4f4f4", "fontSize": 20 }
            })
        })
        .collect();
    // High-frequency detail behind the translucent panels so backdrop blur
    // output is visible (blurring a flat color is a no-op) and pixel diffs
    // between blur implementations are meaningful.
    let stripes: Vec<Value> = (0..48)
        .map(|index| {
            json!({
                "id": format!("stripe-{index}"), "kind": "Box", "visible": true,
                "bounds": { "x": index * 40, "y": 640, "width": 20, "height": 440 },
                "style": { "backgroundColor": if index % 3 == 0 { "#f2c14e" } else if index % 3 == 1 { "#e2546a" } else { "#3fb6a8" } }
            })
        })
        .collect();
    let line = "朝の光が窓から差し込み、静かな部屋に柔らかな影を落としていた。The morning light slipped through the window and settled across the quiet room.";
    let frame = json!({
        "layout": { "preset": "landscape" },
        "view": {
            "dialogue": {
                "visible": true,
                "mode": "say",
                "speaker": "Mira",
                "text": line,
                "typewriter": { "enabled": true, "durationMs": 4000 }
            },
            "characters": [],
            "ui": { "visible": true, "overlays": [{
                "elementId": "scene", "visible": true, "renderMode": "render-only",
                "interactive": false, "overlayStack": "screen",
                "surface": { "key": "perf/scene", "root": {
                    "id": "stage", "kind": "Box", "visible": true,
                    "bounds": { "x": 0, "y": 0, "width": 1920, "height": 1080 },
                    "style": { "backgroundColor": "#2b3f5c" },
                    "children": [
                        { "id": "sky", "kind": "Box", "visible": true,
                          "bounds": { "x": 0, "y": 0, "width": 1920, "height": 620 },
                          "style": { "backgroundColor": "#7aa6d8", "opacity": 0.85 } },
                        { "id": "detail", "kind": "Box", "visible": true,
                          "bounds": { "x": 0, "y": 640, "width": 1920, "height": 440 },
                          "children": stripes },
                        { "id": "panel", "kind": "Box", "visible": true,
                          "bounds": { "x": 120, "y": 760, "width": 1680, "height": 300 },
                          "style": { "backgroundColor": "rgba(16,20,28,0.72)", "borderRadius": 24,
                                     "backdropFilter": { "blurRadius": 12 },
                                     "boxShadow": { "offsetX": 0, "offsetY": 8, "blurRadius": 32, "spreadRadius": 0, "inset": false, "color": "rgba(0,0,0,0.45)" } },
                          "children": buttons }
                    ]
                } }
            }] }
        }
    })
    .to_string();
    let mut value: Value = serde_json::from_str(&frame).unwrap();
    if !effects.dialogue {
        value["view"].as_object_mut().unwrap().remove("dialogue");
    }
    if !effects.overlay {
        value["view"]["ui"]["overlays"] = json!([]);
        return value.to_string();
    }
    let root = &mut value["view"]["ui"]["overlays"][0]["surface"]["root"];
    if !effects.opacity {
        root["children"][0]["style"]
            .as_object_mut()
            .unwrap()
            .remove("opacity");
    }
    let panel = root["children"][2]["style"].as_object_mut().unwrap();
    if !effects.backdrop_blur {
        panel.remove("backdropFilter");
    }
    if !effects.shadow {
        panel.remove("boxShadow");
    }
    value.to_string()
}

#[derive(Default)]
struct Samples(Vec<f64>);

impl Samples {
    fn push(&mut self, duration: Duration) {
        self.0.push(duration.as_secs_f64() * 1000.0);
    }

    fn stats(&self) -> Value {
        if self.0.is_empty() {
            return Value::Null;
        }
        let mut sorted = self.0.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let pick = |p: f64| sorted[((sorted.len() - 1) as f64 * p).round() as usize];
        let mean = sorted.iter().sum::<f64>() / sorted.len() as f64;
        json!({
            "mean": round3(mean), "p50": round3(pick(0.5)),
            "p95": round3(pick(0.95)), "max": round3(*sorted.last().unwrap()),
        })
    }

    fn mean(&self) -> f64 {
        self.0.iter().sum::<f64>() / self.0.len().max(1) as f64
    }

    fn p95(&self) -> f64 {
        let mut sorted = self.0.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        sorted
            .get(((sorted.len().max(1) - 1) as f64 * 0.95).round() as usize)
            .copied()
            .unwrap_or(0.0)
    }
}

fn round3(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

/// Distinct GPU validation errors raised since the last call.
fn take_gpu_errors(gpu: &Gpu) -> Vec<String> {
    let mut errors = std::mem::take(&mut *gpu.errors.lock().unwrap());
    errors.sort();
    errors.dedup();
    errors
}

fn wait_gpu(gpu: &Gpu) -> Duration {
    let start = Instant::now();
    gpu.device
        .poll(wgpu::PollType::wait_indefinitely())
        .expect("GPU wait");
    start.elapsed()
}

/// Resident GPU memory and per-frame pass/upload pressure after a scenario.
/// Fill-rate and memory, not CPU, are what limit phones, so these numbers
/// matter more than desktop GPU wait times.
fn gpu_footprint(renderer: &RealRenderer) -> (Value, String) {
    let snapshot = renderer.backend().runtime_snapshot();
    let report = renderer.backend().last_runtime_report();
    let allocated = renderer
        .backend()
        .runtime_executor()
        .device()
        .allocated_gpu_bytes();
    if std::env::var_os("QUA_PERF_DEBUG").is_some() {
        if let Some(report) = report {
            eprintln!("debug report: encoders {} submits {} passes {} draws {} skipped {:?} missing {:?} ops {}",
                report.encoder_count, report.submit_count, report.render_pass_count, report.draw_indexed_count,
                report.skipped_draws_by_reason, report.missing_resource_references_by_resource_id, report.operation_count);
        }
    }
    let mib = |bytes: usize| bytes as f64 / (1024.0 * 1024.0);
    let passes = report.map(|r| r.render_pass_count).unwrap_or_default();
    let draws = report.map(|r| r.draw_indexed_count).unwrap_or_default();
    let upload = report.map(|r| r.queue_write_byte_len).unwrap_or_default();
    let summary = format!(
        "      gpu: textures {:.1}MiB (compositor {:.1}MiB) buffers {:.2}MiB metal-alloc {} | passes {} draws {} last-frame-upload {}B",
        mib(snapshot.resident_texture_byte_len),
        mib(snapshot.resident_compositor_texture_byte_len),
        mib(snapshot.resident_buffer_byte_len),
        allocated
            .map(|bytes| format!("{:.1}MiB", bytes as f64 / (1024.0 * 1024.0)))
            .unwrap_or_else(|| "n/a".to_string()),
        passes,
        draws,
        upload,
    );
    (
        json!({
            "residentTextureBytes": snapshot.resident_texture_byte_len,
            "compositorTextureBytes": snapshot.resident_compositor_texture_byte_len,
            "residentBufferBytes": snapshot.resident_buffer_byte_len,
            "residentTextures": snapshot.resident_texture_resource_ids,
            "allocatedGpuBytes": allocated,
            "renderPasses": passes, "drawCalls": draws, "lastFrameUploadBytes": upload,
        }),
        summary,
    )
}

/// Wall time per frame for `frames` back-to-back submissions, after a short
/// warm-up so GPU clocks and pooled resources settle.
fn sustained_ms(
    gpu: &Gpu,
    frames: usize,
    mut frame: impl FnMut() -> Result<(), String>,
) -> Result<f64, String> {
    for _ in 0..frames.min(30) {
        frame()?;
    }
    wait_gpu(gpu);
    let start = Instant::now();
    for _ in 0..frames {
        frame()?;
    }
    wait_gpu(gpu);
    Ok(start.elapsed().as_secs_f64() * 1000.0 / frames.max(1) as f64)
}

struct ScenarioResult {
    report: Value,
    summary: String,
}

/// Same JSON every frame: what an idle menu/settings screen costs.
fn run_static(
    gpu: &Gpu,
    resolution: Resolution,
    name: &str,
    fixture: &str,
    frames: usize,
    capture: Option<std::path::PathBuf>,
) -> Result<ScenarioResult, String> {
    let mut renderer = create_renderer(gpu, resolution);
    let frame = with_container(fixture, resolution);
    let cold_start = Instant::now();
    renderer
        .prepare_and_render_json_str(&frame)
        .map_err(|error| format!("cold frame: {error}"))?;
    let cold_cpu = cold_start.elapsed();
    let cold_gpu = wait_gpu(gpu);
    if let Some(path) = capture {
        // Raw dump: u32 LE width, u32 LE height, then premultiplied RGBA8.
        let frame = renderer
            .backend()
            .runtime_executor()
            .device()
            .capture_frame_rgba8()
            .map_err(|error| format!("capture: {error}"))?;
        let mut bytes = Vec::with_capacity(8 + frame.rgba8.len());
        bytes.extend_from_slice(&frame.width.to_le_bytes());
        bytes.extend_from_slice(&frame.height.to_le_bytes());
        bytes.extend_from_slice(&frame.rgba8);
        std::fs::write(&path, bytes).map_err(|error| format!("capture write: {error}"))?;
    }

    // Re-submitting the identical JSON exercises parse + validate + projection
    // + stable-plan reuse, i.e. what an un-cached caller pays per frame.
    let mut json_frame = Samples::default();
    let mut gpu_wait = Samples::default();
    for _ in 0..frames {
        let start = Instant::now();
        renderer
            .prepare_and_render_json_str(&frame)
            .map_err(|error| format!("json frame: {error}"))?;
        json_frame.push(start.elapsed());
        gpu_wait.push(wait_gpu(gpu));
    }
    // Pure resubmission: what the product loop pays once its JSON cache hits.
    let mut resubmit = Samples::default();
    for _ in 0..frames {
        let start = Instant::now();
        renderer
            .render_frame()
            .map_err(|error| format!("resubmit: {error}"))?;
        resubmit.push(start.elapsed());
        wait_gpu(gpu);
    }
    // Sustained: back-to-back submissions with only the renderer's own
    // two-frames-in-flight back-pressure. Equals max(CPU, GPU) per frame, the
    // number that bounds FPS, and is far less noisy than per-frame waits.
    let sustained = sustained_ms(gpu, frames, || {
        renderer
            .render_frame()
            .map(|_| ())
            .map_err(|error| format!("sustained: {error}"))
    })?;
    let metrics = renderer.metrics();
    let (footprint, footprint_summary) = gpu_footprint(&renderer);
    let summary = format!(
        "{:<18} {:<18} sustained {:>6.3}ms | cold {:>7.2}ms | json-frame mean {:>6.3} p95 {:>6.3} | resubmit mean {:>6.3} | gpu-wait mean {:>6.3} | cmds {}",
        name,
        resolution.name,
        sustained,
        cold_cpu.as_secs_f64() * 1000.0,
        json_frame.mean(),
        json_frame.p95(),
        resubmit.mean(),
        gpu_wait.mean(),
        metrics.frame.command_count,
    ) + "\n" + &footprint_summary;
    Ok(ScenarioResult {
        report: json!({
            "sustainedFrameMs": round3(sustained),
            "gpu": footprint,
            "scenario": name, "kind": "static", "resolution": resolution.name,
            "coldCpuMs": round3(cold_cpu.as_secs_f64() * 1000.0),
            "coldGpuWaitMs": round3(cold_gpu.as_secs_f64() * 1000.0),
            "jsonFrameMs": json_frame.stats(), "resubmitMs": resubmit.stats(),
            "gpuWaitMs": gpu_wait.stats(), "commands": metrics.frame.command_count,
        }),
        summary,
    })
}

/// Rust-owned clocks active every frame (typewriter): the per-frame path while
/// a dialogue line is being revealed.
fn run_animated(
    gpu: &Gpu,
    resolution: Resolution,
    name: &str,
    base_frame: &str,
    frames: usize,
) -> Result<ScenarioResult, String> {
    let mut renderer = create_renderer(gpu, resolution);
    let mut runtime = NativeRendererProjectionRuntime::from_frame_json(base_frame)
        .map_err(|error| format!("projection runtime: {error}"))?;
    // The runtime anchors its clocks at creation time; start just after it.
    let start_epoch_ms = current_epoch_ms();

    let mut project = Samples::default();
    let mut compose = Samples::default();
    let mut parse = Samples::default();
    let mut render = Samples::default();
    let mut total = Samples::default();
    let mut gpu_wait = Samples::default();
    let mut active_frames = 0usize;
    // Advance the clock like a 60 FPS window, independent of how long each
    // iteration actually takes.
    for index in 0..frames {
        let frame_start = Instant::now();
        let stage = Instant::now();
        let projected = runtime
            .project_at_epoch_ms(start_epoch_ms + index as f64 * 1000.0 / 60.0)
            .map_err(|error| format!("projection: {error}"))?;
        project.push(stage.elapsed());
        if projected.local_work_active {
            active_frames += 1;
        }

        let stage = Instant::now();
        let composed = with_container(&projected.json, resolution);
        compose.push(stage.elapsed());

        let stage = Instant::now();
        let input = parse_native_renderer_json_frame_input(&composed)
            .map_err(|error| format!("parse: {error}"))?;
        parse.push(stage.elapsed());

        let stage = Instant::now();
        renderer
            .prepare_and_render(input.resolved_layout(), &input.view)
            .map_err(|error| format!("render: {error}"))?;
        render.push(stage.elapsed());
        total.push(frame_start.elapsed());
        gpu_wait.push(wait_gpu(gpu));
    }
    let mut sustained_index = frames;
    let sustained = sustained_ms(gpu, frames, || {
        let projected = runtime
            .project_at_epoch_ms(start_epoch_ms + sustained_index as f64 * 1000.0 / 60.0)
            .map_err(|error| format!("projection: {error}"))?;
        sustained_index += 1;
        let composed = with_container(&projected.json, resolution);
        renderer
            .prepare_and_render_json_str(&composed)
            .map(|_| ())
            .map_err(|error| format!("sustained: {error}"))
    })?;
    let metrics = renderer.metrics();
    let (footprint, footprint_summary) = gpu_footprint(&renderer);
    let summary = format!(
        "{:<18} {:<18} sustained {:>6.3}ms | total mean {:>6.3} p95 {:>6.3} | project {:>6.3} compose {:>6.3} parse {:>6.3} render {:>6.3} | gpu-wait {:>6.3} | active {}/{} cmds {}",
        name,
        resolution.name,
        sustained,
        total.mean(),
        total.p95(),
        project.mean(),
        compose.mean(),
        parse.mean(),
        render.mean(),
        gpu_wait.mean(),
        active_frames,
        frames,
        metrics.frame.command_count,
    ) + "\n" + &footprint_summary;
    Ok(ScenarioResult {
        report: json!({
            "sustainedFrameMs": round3(sustained),
            "gpu": footprint,
            "scenario": name, "kind": "animated", "resolution": resolution.name,
            "totalCpuMs": total.stats(), "projectMs": project.stats(), "composeMs": compose.stats(),
            "parseMs": parse.stats(), "renderMs": render.stats(), "gpuWaitMs": gpu_wait.stats(),
            "activeFrames": active_frames, "frames": frames, "commands": metrics.frame.command_count,
        }),
        summary,
    })
}

fn current_epoch_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs_f64()
        * 1000.0
}

fn report_gpu_errors(gpu: &Gpu, report: &mut Value) {
    let errors = take_gpu_errors(gpu);
    for error in &errors {
        let first_lines: Vec<&str> = error.lines().filter(|l| !l.trim().is_empty()).collect();
        println!("    GPU VALIDATION ERROR: {}", first_lines.join(" | "));
    }
    report["gpuErrors"] = json!(errors);
}

fn main() {
    let args = parse_args();
    let dialogue = dialogue_scene_frame();
    let mut reports = Vec::new();
    for profile in &args.profiles {
        let gpu = match create_gpu(*profile) {
            Ok(gpu) => gpu,
            Err(error) => {
                println!("[{}] device unavailable: {error}", profile.name());
                reports.push(json!({ "profile": profile.name(), "error": error }));
                continue;
            }
        };
        println!(
            "\n== profile {} | adapter {} ({}) | frames {}",
            profile.name(),
            gpu.adapter_name,
            gpu.backend,
            args.frames
        );
        let selected = |name: &str| args.only.as_deref().is_none_or(|only| name.contains(only));
        for resolution in RESOLUTIONS.iter().filter(|resolution| {
            args.resolution
                .as_deref()
                .is_none_or(|wanted| resolution.name.contains(wanted))
        }) {
            let scene_frames: Vec<(&str, String)> = SCENE_VARIANTS
                .iter()
                .map(|(name, effects)| (*name, dialogue_scene_frame_with(*effects)))
                .collect();
            let all_static = FIXTURES
                .iter()
                .map(|(name, fixture)| (*name, fixture.to_string()))
                .chain(scene_frames);
            for (name, fixture) in all_static.filter(|(name, _)| selected(name)) {
                let fixture = fixture.as_str();
                let capture = args.capture_dir.as_ref().map(|dir| {
                    std::path::Path::new(dir).join(format!(
                        "{}-{}-{}.rgba",
                        profile.name(),
                        name.replace(':', "_"),
                        resolution.name.replace('@', "_")
                    ))
                });
                match run_static(&gpu, *resolution, name, fixture, args.frames, capture) {
                    Ok(result) => {
                        println!("{}", result.summary);
                        let mut report = result.report;
                        report["profile"] = json!(profile.name());
                        report_gpu_errors(&gpu, &mut report);
                        reports.push(report);
                    }
                    Err(error) => {
                        println!("{name:<18} {:<18} FAILED: {error}", resolution.name);
                        reports.push(json!({ "profile": profile.name(), "scenario": name,
                            "resolution": resolution.name, "error": error }));
                    }
                }
            }
            if !selected("dialogue-typewriter") {
                continue;
            }
            match run_animated(
                &gpu,
                *resolution,
                "dialogue-typewriter",
                &dialogue,
                args.frames,
            ) {
                Ok(result) => {
                    println!("{}", result.summary);
                    let mut report = result.report;
                    report["profile"] = json!(profile.name());
                    report_gpu_errors(&gpu, &mut report);
                    reports.push(report);
                }
                Err(error) => {
                    println!(
                        "dialogue-typewriter {:<18} FAILED: {error}",
                        resolution.name
                    );
                    reports.push(
                        json!({ "profile": profile.name(), "scenario": "dialogue-typewriter",
                        "resolution": resolution.name, "error": error }),
                    );
                }
            }
        }
    }
    if args.json {
        println!("{}", serde_json::to_string_pretty(&reports).unwrap());
    }
}
