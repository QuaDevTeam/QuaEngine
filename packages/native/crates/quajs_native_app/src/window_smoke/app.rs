use std::sync::Arc;
use std::time::{Duration, Instant};
use std::{env, fs, path::Path};

use winit::dpi::{LogicalSize, PhysicalSize};
use winit::event_loop::{ActiveEventLoop, EventLoopProxy};
use winit::window::Window;

use super::config::{
    load_window_smoke_target_frame_count, native_window_dev_enabled,
    native_window_interaction_probe_enabled,
};
use super::error::NativeWindowSmokeError;
use super::frame::{frame_json_for_window, normalized_physical_size, window_frame_dimensions};
use super::input::NativeWindowSmokeInputState;
use super::metrics::{
    NativeWindowSmokeAudioMetrics, NativeWindowSmokeTextureMetrics, NativeWindowSmokeVideoMetrics,
};
use super::performance_hud::NativeWindowPerformanceHud;
#[cfg(feature = "quickjs-rquickjs")]
use super::quickjs_product::NativeWindowQuickJsProduct;
use super::report::NativeWindowSmokeReport;
use super::report_builder::{build_window_smoke_report, NativeWindowSmokeReportInput};
use super::texture_host::create_window_smoke_texture_host_from_env;
use crate::product_app_shell::{NativeProductAppShell, NativeProductAppShellAction};
use crate::product_loop::NativeProductLoopFrameResult;
use crate::product_window::{NativeProductWindowInMemoryRuntime, NativeProductWindowPhysicalSize};
use crate::product_window_loop::NativeProductWindowInMemoryLoop;
#[cfg(feature = "quickjs-rquickjs")]
use quajs_wgpu_renderer::projection_runtime::NativeRendererProjectionRuntime;
use quajs_wgpu_renderer::renderer::RealWgpuEncodedFrameCapture;

mod events;

const INTERACTION_PROBE_TIMEOUT: Duration = Duration::from_secs(5);

pub(super) struct NativeWindowSmokeApp {
    frame_source: String,
    window: Option<Arc<Window>>,
    product_shell: Option<NativeProductAppShell<NativeProductWindowInMemoryLoop>>,
    input: NativeWindowSmokeInputState,
    texture_metrics: NativeWindowSmokeTextureMetrics,
    performance_hud: NativeWindowPerformanceHud,
    #[cfg(feature = "quickjs-rquickjs")]
    quickjs_product: Option<NativeWindowQuickJsProduct>,
    #[cfg(feature = "quickjs-rquickjs")]
    quickjs_pipeline_sequence: u64,
    #[cfg(feature = "quickjs-rquickjs")]
    renderer_redraw_pending: bool,
    #[cfg(feature = "quickjs-rquickjs")]
    renderer_local_work_active: bool,
    #[cfg(feature = "quickjs-rquickjs")]
    projection_runtime: Option<NativeRendererProjectionRuntime>,
    interaction_probe_story_observed: bool,
    interaction_probe_advance_sent: bool,
    interaction_probe_advance_observed: bool,
    interaction_probe_started_at: Option<Instant>,
    event_loop_proxy: EventLoopProxy<()>,
    pub(super) report: Option<NativeWindowSmokeReport>,
    pub(super) error: Option<NativeWindowSmokeError>,
}

impl NativeWindowSmokeApp {
    pub(super) fn new(frame_source: String, event_loop_proxy: EventLoopProxy<()>) -> Self {
        Self {
            frame_source,
            window: None,
            product_shell: None,
            input: NativeWindowSmokeInputState::default(),
            texture_metrics: NativeWindowSmokeTextureMetrics::default(),
            performance_hud: NativeWindowPerformanceHud::default(),
            #[cfg(feature = "quickjs-rquickjs")]
            quickjs_product: None,
            #[cfg(feature = "quickjs-rquickjs")]
            quickjs_pipeline_sequence: 0,
            #[cfg(feature = "quickjs-rquickjs")]
            renderer_redraw_pending: false,
            #[cfg(feature = "quickjs-rquickjs")]
            renderer_local_work_active: false,
            #[cfg(feature = "quickjs-rquickjs")]
            projection_runtime: None,
            interaction_probe_story_observed: false,
            interaction_probe_advance_sent: false,
            interaction_probe_advance_observed: false,
            interaction_probe_started_at: None,
            event_loop_proxy,
            report: None,
            error: None,
        }
    }

    fn initialize(&mut self, event_loop: &ActiveEventLoop) -> Result<(), NativeWindowSmokeError> {
        if self.window.is_some() {
            return Ok(());
        }

        let window = Arc::new(
            event_loop
                .create_window(
                    Window::default_attributes()
                        .with_title(if native_window_dev_enabled() {
                            "Qua Native Renderer Dev"
                        } else {
                            "Qua Native Renderer Smoke"
                        })
                        .with_inner_size(LogicalSize::new(960.0, 540.0)),
                )
                .map_err(|error| {
                    NativeWindowSmokeError::new(format!(
                        "Failed to create native renderer smoke window: {error}."
                    ))
                })?,
        );
        let physical_size = normalized_physical_size(window.inner_size());
        let texture_host = create_window_smoke_texture_host_from_env()?;
        #[cfg(feature = "quickjs-rquickjs")]
        let quickjs_product =
            NativeWindowQuickJsProduct::load(&texture_host, self.event_loop_proxy.clone())?;
        let instance =
            wgpu::Instance::new(wgpu::InstanceDescriptor::new_with_display_handle_from_env(
                Box::new(event_loop.owned_display_handle()),
            ));
        let surface = instance.create_surface(window.clone()).map_err(|error| {
            NativeWindowSmokeError::new(format!(
                "Failed to create native renderer smoke wgpu surface: {error}."
            ))
        })?;
        let runtime = NativeProductWindowInMemoryRuntime::bootstrap(
            &instance,
            surface,
            NativeProductWindowPhysicalSize::new(physical_size.width, physical_size.height),
            texture_host,
        )
        .map_err(|error| {
            NativeWindowSmokeError::new(format!(
                "Failed to bootstrap native renderer smoke product window: {error}."
            ))
        })?;

        let window_loop =
            NativeProductWindowInMemoryLoop::new(runtime, load_window_smoke_target_frame_count());
        self.product_shell = Some(NativeProductAppShell::new(window_loop));
        #[cfg(feature = "quickjs-rquickjs")]
        {
            self.quickjs_product = quickjs_product;
            if let Some(product) = self.quickjs_product.as_ref() {
                let update = product.drain_pipeline_update()?;
                let mut projection_runtime =
                    NativeRendererProjectionRuntime::from_frame_json(&update.projection_source)
                        .map_err(|error| {
                            NativeWindowSmokeError::new(format!(
                                "Failed to initialize the Rust native projection runtime: {error}."
                            ))
                        })?;
                for message in update.messages {
                    projection_runtime
                        .apply_pipeline_event(&message.event, &message.payload_json)
                        .map_err(|error| {
                            NativeWindowSmokeError::new(format!(
                                "Failed to apply initial native pipeline event {}: {error}.",
                                message.event
                            ))
                        })?;
                }
                self.quickjs_pipeline_sequence = product.pipeline_sequence();
                self.projection_runtime = Some(projection_runtime);
                self.renderer_redraw_pending = true;
                window.request_redraw();
            }
        }
        self.window = Some(window.clone());

        Ok(())
    }

    fn render_once(&mut self) -> Result<NativeWindowSmokeReport, NativeWindowSmokeError> {
        let frame_started_at = std::time::Instant::now();
        let window = self.window.as_ref().ok_or_else(|| {
            NativeWindowSmokeError::new("Native renderer smoke window is not initialized.")
        })?;
        let dimensions = window_frame_dimensions(window.inner_size(), window.scale_factor());
        #[cfg(feature = "quickjs-rquickjs")]
        let frame_source: Arc<str> = match self.projection_runtime.as_mut() {
            Some(runtime) => {
                let projection = runtime.project_now().map_err(|error| {
                    NativeWindowSmokeError::new(format!(
                        "Rust native projection runtime failed to project a frame: {error}."
                    ))
                })?;
                self.renderer_local_work_active = projection.local_work_active;
                Arc::from(projection.json)
            }
            None => self.frame_source.clone().into(),
        };
        #[cfg(not(feature = "quickjs-rquickjs"))]
        let frame_source = self.frame_source.clone();
        let mut frame_json = frame_json_for_window(
            &frame_source,
            dimensions.logical_width,
            dimensions.logical_height,
            dimensions.device_pixel_ratio,
        )?;
        if native_window_dev_enabled() {
            frame_json = self.performance_hud.inject(&frame_json, dimensions)?;
        }
        if native_window_interaction_probe_enabled()
            && !self.interaction_probe_story_observed
            && native_demo_story_frame_visible(&frame_json)
        {
            self.interaction_probe_story_observed = true;
            println!("Native interaction probe observed the first story dialogue frame.");
        }
        let should_run_advance_probe = native_window_interaction_probe_enabled()
            && self.interaction_probe_story_observed
            && !self.interaction_probe_advance_sent;
        if native_window_interaction_probe_enabled()
            && self.interaction_probe_advance_sent
            && !self.interaction_probe_advance_observed
            && native_demo_advanced_story_frame_visible(&frame_json)
        {
            self.interaction_probe_advance_observed = true;
            println!("Native interaction probe observed dialogue advance to the next line.");
        }
        let Some(mut product_shell) = self.product_shell.take() else {
            return Err(NativeWindowSmokeError::new(
                "Native renderer smoke runtime is not initialized.",
            ));
        };

        let target_frame_count = product_shell.window_loop().target_frame_count();
        let should_shutdown_after_next_frame = self.interaction_probe_advance_observed;
        if should_shutdown_after_next_frame {
            product_shell
                .window_loop_mut()
                .request_shutdown_after_next_frame();
        }
        let mut frame_capture = None;
        let product_frame_result = product_shell
            .window_loop_mut()
            .render_projection_json_frame(
                &frame_json,
                |renderer, host| {
                    if native_window_interaction_probe_enabled() {
                        if self.input.metrics().pointer_probe_count == 0 {
                            self.input
                                .run_native_demo_start_probe(renderer, host, &frame_json)?;
                            self.interaction_probe_started_at = Some(Instant::now());
                            Ok(())
                        } else if should_run_advance_probe {
                            self.interaction_probe_advance_sent = true;
                            self.input
                                .run_native_demo_advance_probe(renderer, host, &frame_json)
                        } else {
                            Ok(())
                        }
                    } else if native_window_dev_enabled() {
                        Ok(())
                    } else {
                        self.input
                            .run_open_settings_probe(renderer, host, &frame_json)
                    }
                },
                |runtime| {
                    if runtime.rendered_frame_count() >= target_frame_count
                        || (native_window_interaction_probe_enabled()
                            && self.interaction_probe_advance_observed)
                    {
                        let capture = runtime.capture_frame_png().map_err(|error| {
                            NativeWindowSmokeError::new(format!(
                                "Failed to capture native renderer smoke frame: {error}."
                            ))
                        })?;
                        persist_frame_capture_artifact(&capture)?;
                        frame_capture = Some(capture);
                    }
                    Ok::<(), NativeWindowSmokeError>(())
                },
            );
        self.product_shell = Some(product_shell);
        if should_shutdown_after_next_frame {
            self.request_redraw();
        }
        self.flush_dev_renderer_intents()?;

        let loop_frame =
            product_frame_result.map_err(NativeWindowSmokeError::from_window_loop_error)?;
        let product_frame = loop_frame.product_frame;
        self.record_product_frame_texture_metrics(&product_frame);
        let synced_frame = product_frame.synced_frame;
        let synced_frame = synced_frame.frame;
        let frame_result = synced_frame.frame;
        #[cfg(feature = "quickjs-rquickjs")]
        if self.quickjs_product.is_some() {
            self.renderer_redraw_pending = false;
        }
        let input_metrics = self.input.metrics();
        if let Some(shutdown) = loop_frame.shutdown {
            self.texture_metrics.record_shutdown_cleanup(&shutdown);
        }
        let product_shell = self.product_shell.as_ref().ok_or_else(|| {
            NativeWindowSmokeError::new("Native renderer smoke runtime is not initialized.")
        })?;
        let window_loop = product_shell.window_loop();
        let runtime = window_loop.runtime();
        let (
            font_atlas_text_draw_count,
            shaped_text_draw_count,
            bitmap_text_draw_count,
            font_atlas_resource_ids,
        ) = runtime
            .renderer()
            .backend()
            .last_buffer_plan()
            .map(|plan| {
                (
                    plan.font_atlas_text_draw_count(),
                    plan.shaped_text_draw_count,
                    plan.bitmap_text_draw_count(),
                    plan.font_atlas_resource_ids(),
                )
            })
            .unwrap_or_default();
        let font_atlas_uploaded_count = runtime.renderer().backend().font_atlas_upload_count();
        let texture_sampler_diagnostics = runtime
            .renderer()
            .backend()
            .last_runtime_report()
            .map(|report| &report.texture_sampler_diagnostics);
        let rendered_frame_count = runtime.rendered_frame_count();
        let audio_metrics =
            NativeWindowSmokeAudioMetrics::from_product_backend(runtime.renderer().audio_backend());
        let video_metrics =
            NativeWindowSmokeVideoMetrics::from_product_backend(runtime.renderer().video_backend());
        let recovery_metrics = window_loop.recovery_metrics();

        let presentation = runtime.presentation();
        let report = build_window_smoke_report(NativeWindowSmokeReportInput {
            adapter_name: &presentation.adapter_name,
            surface_format: &presentation.surface_format,
            present_mode: &presentation.present_mode,
            present_status: loop_frame.present_outcome.present_status,
            presented: loop_frame.present_outcome.presented,
            present_attempt_count: window_loop.present_attempt_count(),
            target_frame_count: window_loop.target_frame_count(),
            rendered_frame_count,
            resize_count: window_loop.resize_count(),
            surface_recovery_count: window_loop.surface_recovery_count(),
            device_recovery_count: window_loop.device_recovery_count(),
            recovery_metrics,
            last_present_failure_kind: window_loop.last_present_failure_kind(),
            texture_metrics: &self.texture_metrics,
            audio_metrics: &audio_metrics,
            video_metrics: &video_metrics,
            input_metrics,
            app_loop: product_shell.app_loop().snapshot(),
            last_resize_physical_size: window_loop.last_resize_physical_size(),
            dimensions,
            revision: frame_result.update.revision,
            pass_count: frame_result.submission.pass_count,
            batch_count: frame_result.submission.batch_count,
            command_count: frame_result.submission.command_count,
            submitted_command_buffer_count: loop_frame
                .present_outcome
                .submitted_command_buffer_count,
            font_atlas_uploaded_count,
            font_atlas_text_draw_count,
            shaped_text_draw_count,
            bitmap_text_draw_count,
            font_atlas_resource_ids,
            linear_sampled_texture_bind_group_count: texture_sampler_diagnostics
                .map(|diagnostics| diagnostics.linear_filter_bind_group_count)
                .unwrap_or_default(),
            nearest_sampled_texture_bind_group_count: texture_sampler_diagnostics
                .map(|diagnostics| diagnostics.nearest_filter_bind_group_count)
                .unwrap_or_default(),
            frame_capture: frame_capture.as_ref(),
        });
        if native_window_dev_enabled() {
            self.performance_hud.record_frame(
                frame_started_at.elapsed(),
                frame_result.submission.command_count,
                frame_result.submission.pass_count,
                frame_result.submission.batch_count,
            );
        }
        Ok(report)
    }

    fn resize_surface(&mut self, size: PhysicalSize<u32>) -> Result<(), NativeWindowSmokeError> {
        let Some(product_shell) = self.product_shell.as_mut() else {
            return Ok(());
        };
        let physical_size = normalized_physical_size(size);
        product_shell
            .window_loop_mut()
            .resize_to_physical_size(NativeProductWindowPhysicalSize::new(
                physical_size.width,
                physical_size.height,
            ))
            .map_err(|error| {
                NativeWindowSmokeError::new(format!(
                    "Failed to resize native renderer smoke product window: {error}."
                ))
            })?;
        Ok(())
    }

    fn dispatch_window_pointer_input(
        &mut self,
        phase: quajs_wgpu_renderer::input::NativePointerEventPhase,
        button: quajs_wgpu_renderer::input::NativePointerButton,
    ) -> Result<bool, NativeWindowSmokeError> {
        let Some(point) = self.input.cursor_client_point() else {
            return Ok(false);
        };
        let Some(product_shell) = self.product_shell.as_mut() else {
            return Ok(false);
        };

        let (renderer, host) = product_shell
            .window_loop_mut()
            .runtime_mut()
            .renderer_and_host_mut();
        let result = self
            .input
            .dispatch_pointer_event(renderer, host, phase, point, button);
        self.flush_dev_renderer_intents()?;
        result
    }

    fn dispatch_window_pointer_move(
        &mut self,
        point: quajs_wgpu_renderer::stage_layout::StageClientPoint,
    ) -> Result<bool, NativeWindowSmokeError> {
        let Some(product_shell) = self.product_shell.as_mut() else {
            return Ok(false);
        };
        let (renderer, host) = product_shell
            .window_loop_mut()
            .runtime_mut()
            .renderer_and_host_mut();
        self.input.dispatch_pointer_move(renderer, host, point)
    }

    fn cancel_window_pointer_interaction(&mut self) -> bool {
        if let Some(product_shell) = self.product_shell.as_mut() {
            return self.input.cancel_pointer_interaction(
                product_shell.window_loop_mut().runtime_mut().renderer_mut(),
            );
        }
        false
    }

    fn dispatch_window_focus_event(&mut self, focused: bool) -> Result<(), NativeWindowSmokeError> {
        let Some(product_shell) = self.product_shell.as_mut() else {
            self.input.record_focus_event(focused);
            return Ok(());
        };

        let result = self.input.dispatch_focus_event(
            product_shell.window_loop_mut().runtime_mut().host_mut(),
            focused,
        );
        self.flush_dev_renderer_intents()?;
        result
    }

    fn dispatch_window_keyboard_event(
        &mut self,
        event: &winit::event::KeyEvent,
    ) -> Result<(), NativeWindowSmokeError> {
        let Some(product_shell) = self.product_shell.as_mut() else {
            self.input.record_keyboard_event(event);
            return Ok(());
        };

        let result = self.input.dispatch_keyboard_event(
            product_shell.window_loop_mut().runtime_mut().host_mut(),
            event,
        );
        self.flush_dev_renderer_intents()?;
        result
    }

    fn dispatch_window_ime_event(
        &mut self,
        event: &winit::event::Ime,
    ) -> Result<(), NativeWindowSmokeError> {
        let Some(product_shell) = self.product_shell.as_mut() else {
            self.input.record_ime_event(event);
            return Ok(());
        };

        let result = self.input.dispatch_ime_event(
            product_shell.window_loop_mut().runtime_mut().host_mut(),
            event,
        );
        self.flush_dev_renderer_intents()?;
        result
    }

    fn cancel_window_ime_composition(&mut self) -> Result<(), NativeWindowSmokeError> {
        let Some(product_shell) = self.product_shell.as_mut() else {
            self.input.record_ime_composition_cancelled();
            return Ok(());
        };

        self.input
            .cancel_ime_composition(product_shell.window_loop_mut().runtime_mut().host_mut())
    }

    fn request_redraw(&mut self) {
        #[cfg(feature = "quickjs-rquickjs")]
        if self.quickjs_product.is_some() {
            self.renderer_redraw_pending = true;
        }
        if let Some(window) = &self.window {
            window.request_redraw();
        }
    }

    fn record_product_frame_texture_metrics(
        &mut self,
        product_frame: &NativeProductLoopFrameResult,
    ) {
        let synced_frame = &product_frame.synced_frame;
        self.texture_metrics.record_texture_sync(
            &synced_frame.frame.texture_upload_report,
            &synced_frame.frame.texture_host_cleanup_report,
            synced_frame.frame.resubmitted_after_texture_upload,
            synced_frame.frame.font_atlas_report.as_ref(),
            &synced_frame.bundle_lifecycle_report,
        );
    }

    fn flush_dev_renderer_intents(&mut self) -> Result<(), NativeWindowSmokeError> {
        #[cfg(feature = "quickjs-rquickjs")]
        if self.quickjs_product.is_some() {
            let renderer_intents = {
                let Some(product_shell) = self.product_shell.as_mut() else {
                    return Ok(());
                };
                let host = product_shell.window_loop_mut().runtime_mut().host_mut();
                let intents = host.renderer_intents();
                if self.input.dispatched_intent_count > intents.len() {
                    self.input.dispatched_intent_count = 0;
                }
                intents[self.input.dispatched_intent_count..].to_vec()
            };
            let mut intents = self
                .projection_runtime
                .as_mut()
                .map(NativeRendererProjectionRuntime::drain_intents)
                .unwrap_or_default();
            let mut forwarded_renderer_intent_count = 0usize;
            for intent in renderer_intents {
                if is_advance_intent(&intent)
                    && self
                        .projection_runtime
                        .as_mut()
                        .is_some_and(NativeRendererProjectionRuntime::reveal_dialogue_on_advance)
                {
                    self.request_redraw();
                    forwarded_renderer_intent_count =
                        forwarded_renderer_intent_count.saturating_add(1);
                    continue;
                }
                intents.push(intent);
                forwarded_renderer_intent_count = forwarded_renderer_intent_count.saturating_add(1);
            }
            let Some(product) = self.quickjs_product.as_mut() else {
                return Ok(());
            };
            for intent in intents {
                product.dispatch_renderer_intent(intent)?;
            }
            self.input.dispatched_intent_count = self
                .input
                .dispatched_intent_count
                .saturating_add(forwarded_renderer_intent_count);
            return Ok(());
        }

        Ok(())
    }

    #[cfg(feature = "quickjs-rquickjs")]
    fn ingest_quickjs_pipeline_updates(&mut self) {
        let Some(product) = self.quickjs_product.as_ref() else {
            return;
        };
        let sequence = product.pipeline_sequence();
        if sequence == self.quickjs_pipeline_sequence {
            return;
        }
        let update = match product.drain_pipeline_update() {
            Ok(update) => update,
            Err(error) => {
                self.error = Some(error);
                return;
            }
        };
        let Some(runtime) = self.projection_runtime.as_mut() else {
            return;
        };
        for message in update.messages {
            if let Err(error) = runtime.apply_pipeline_event(&message.event, &message.payload_json)
            {
                self.error = Some(NativeWindowSmokeError::new(format!(
                    "Failed to apply native pipeline event {}: {error}.",
                    message.event
                )));
                return;
            }
        }
        self.quickjs_pipeline_sequence = sequence;
        self.renderer_redraw_pending = true;
        self.request_redraw();
    }

    fn apply_product_shell_action(
        &mut self,
        _event_loop: &ActiveEventLoop,
        action: NativeProductAppShellAction,
    ) -> bool {
        if let Some(lifecycle_report) = action.lifecycle_report {
            self.texture_metrics
                .record_lifecycle_sync(&lifecycle_report);
        }
        #[cfg(feature = "quickjs-rquickjs")]
        let request_redraw = action.request_redraw && self.quickjs_product.is_none();
        #[cfg(not(feature = "quickjs-rquickjs"))]
        let request_redraw = action.request_redraw;
        if request_redraw {
            self.request_redraw();
        }
        true
    }

    fn fail_and_exit(&mut self, event_loop: &ActiveEventLoop, error: NativeWindowSmokeError) {
        self.error = Some(error);
        event_loop.exit();
    }
}

#[cfg(feature = "quickjs-rquickjs")]
fn is_advance_intent(intent: &quajs_native_runtime::NativeRendererIntent) -> bool {
    if intent.r#type != "user/input_command" {
        return false;
    }
    intent
        .payload_json
        .as_deref()
        .and_then(|payload| serde_json::from_str::<serde_json::Value>(payload).ok())
        .is_some_and(|payload| {
            payload.get("command").and_then(serde_json::Value::as_str) == Some("advance")
                && payload.get("pressed").and_then(serde_json::Value::as_bool) != Some(false)
        })
}

fn native_demo_story_frame_visible(frame_json: &str) -> bool {
    let Ok(frame) = serde_json::from_str::<serde_json::Value>(frame_json) else {
        return false;
    };
    frame
        .pointer("/view/dialogue/text")
        .and_then(serde_json::Value::as_str)
        .map(|text| !text.is_empty())
        .unwrap_or(false)
}

fn native_demo_advanced_story_frame_visible(frame_json: &str) -> bool {
    let Ok(frame) = serde_json::from_str::<serde_json::Value>(frame_json) else {
        return false;
    };
    frame
        .pointer("/view/dialogue/text")
        .and_then(serde_json::Value::as_str)
        .map(|text| text.starts_with('和'))
        .unwrap_or(false)
}

fn persist_frame_capture_artifact(
    capture: &RealWgpuEncodedFrameCapture,
) -> Result<(), NativeWindowSmokeError> {
    let Some(path) = env::var_os("QUA_NATIVE_RENDERER_WINDOW_CAPTURE_PATH") else {
        return Ok(());
    };
    let path = Path::new(&path);
    if path.extension().and_then(|extension| extension.to_str()) != Some("png") {
        return Err(NativeWindowSmokeError::new(
            "Native renderer capture artifact path must end in .png.",
        ));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            NativeWindowSmokeError::new(format!(
                "Failed to create native renderer capture artifact directory: {error}."
            ))
        })?;
    }
    fs::write(path, &capture.bytes).map_err(|error| {
        NativeWindowSmokeError::new(format!(
            "Failed to write native renderer capture artifact: {error}."
        ))
    })
}
