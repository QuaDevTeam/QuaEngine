use std::sync::Arc;

use winit::dpi::{LogicalSize, PhysicalSize};
use winit::event_loop::ActiveEventLoop;
use winit::window::Window;

use super::config::load_window_smoke_target_frame_count;
use super::error::NativeWindowSmokeError;
use super::frame::{frame_json_for_window, normalized_physical_size, window_frame_dimensions};
use super::input::NativeWindowSmokeInputState;
use super::metrics::{NativeWindowSmokeAudioMetrics, NativeWindowSmokeTextureMetrics};
use super::report::NativeWindowSmokeReport;
use super::report_builder::{build_window_smoke_report, NativeWindowSmokeReportInput};
use super::texture_host::create_window_smoke_texture_host;
use crate::product_app_loop::{NativeProductAppLoop, NativeProductAppLoopAction};
use crate::product_window::{NativeProductWindowInMemoryRuntime, NativeProductWindowPhysicalSize};
use crate::product_window_loop::NativeProductWindowInMemoryLoop;

mod events;

pub(super) struct NativeWindowSmokeApp {
    frame_source: String,
    window: Option<Arc<Window>>,
    window_loop: Option<NativeProductWindowInMemoryLoop>,
    app_loop: NativeProductAppLoop,
    input: NativeWindowSmokeInputState,
    texture_metrics: NativeWindowSmokeTextureMetrics,
    pub(super) report: Option<NativeWindowSmokeReport>,
    pub(super) error: Option<NativeWindowSmokeError>,
}

impl NativeWindowSmokeApp {
    pub(super) fn new(frame_source: String) -> Self {
        Self {
            frame_source,
            window: None,
            window_loop: None,
            app_loop: NativeProductAppLoop::new(),
            input: NativeWindowSmokeInputState::default(),
            texture_metrics: NativeWindowSmokeTextureMetrics::default(),
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
                        .with_title("Qua Native Renderer Smoke")
                        .with_inner_size(LogicalSize::new(960.0, 540.0)),
                )
                .map_err(|error| {
                    NativeWindowSmokeError::new(format!(
                        "Failed to create native renderer smoke window: {error}."
                    ))
                })?,
        );
        let physical_size = normalized_physical_size(window.inner_size());
        let texture_host = create_window_smoke_texture_host();
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

        self.window_loop = Some(NativeProductWindowInMemoryLoop::new(
            runtime,
            load_window_smoke_target_frame_count(),
        ));
        self.window = Some(window.clone());

        Ok(())
    }

    fn render_once(&mut self) -> Result<NativeWindowSmokeReport, NativeWindowSmokeError> {
        let window = self.window.as_ref().ok_or_else(|| {
            NativeWindowSmokeError::new("Native renderer smoke window is not initialized.")
        })?;
        let dimensions = window_frame_dimensions(window.inner_size(), window.scale_factor());
        let frame_json = frame_json_for_window(
            &self.frame_source,
            dimensions.logical_width,
            dimensions.logical_height,
            dimensions.device_pixel_ratio,
        )?;
        let Some(mut window_loop) = self.window_loop.take() else {
            return Err(NativeWindowSmokeError::new(
                "Native renderer smoke runtime is not initialized.",
            ));
        };

        let product_frame_result =
            window_loop.render_projection_json_frame(&frame_json, |renderer, host| {
                self.input
                    .run_open_settings_probe(renderer, host, &frame_json)
            });
        self.window_loop = Some(window_loop);

        let window_loop = self.window_loop.as_ref().ok_or_else(|| {
            NativeWindowSmokeError::new("Native renderer smoke runtime is not initialized.")
        })?;
        let loop_frame = product_frame_result.map_err(|error| {
            NativeWindowSmokeError::new(format!("Native renderer smoke frame failed: {error}."))
        })?;
        let product_frame = loop_frame.product_frame;
        let synced_frame = product_frame.synced_frame;
        self.texture_metrics.record_texture_sync(
            &synced_frame.frame.texture_upload_report,
            &synced_frame.frame.texture_host_cleanup_report,
            synced_frame.frame.resubmitted_after_texture_upload,
            &synced_frame.bundle_lifecycle_report,
        );
        let synced_frame = synced_frame.frame;
        let frame_result = synced_frame.frame;
        let input_metrics = self.input.metrics();
        if let Some(shutdown) = loop_frame.shutdown {
            self.texture_metrics.record_shutdown_cleanup(&shutdown);
        }
        let runtime = window_loop.runtime();
        let rendered_frame_count = runtime.rendered_frame_count();
        let audio_metrics =
            NativeWindowSmokeAudioMetrics::from_null_backend(runtime.renderer().audio_backend());

        let presentation = runtime.presentation();
        Ok(build_window_smoke_report(NativeWindowSmokeReportInput {
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
            texture_metrics: &self.texture_metrics,
            audio_metrics: &audio_metrics,
            input_metrics,
            app_loop: self.app_loop.snapshot(),
            last_resize_physical_size: window_loop.last_resize_physical_size(),
            dimensions,
            revision: frame_result.update.revision,
            pass_count: frame_result.submission.pass_count,
            batch_count: frame_result.submission.batch_count,
            command_count: frame_result.submission.command_count,
            submitted_command_buffer_count: loop_frame
                .present_outcome
                .submitted_command_buffer_count,
        }))
    }

    fn resize_surface(&mut self, size: PhysicalSize<u32>) -> Result<(), NativeWindowSmokeError> {
        let Some(window_loop) = self.window_loop.as_mut() else {
            return Ok(());
        };
        let physical_size = normalized_physical_size(size);
        window_loop
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
    ) -> Result<(), NativeWindowSmokeError> {
        let Some(point) = self.input.cursor_client_point() else {
            return Ok(());
        };
        let Some(window_loop) = self.window_loop.as_mut() else {
            return Ok(());
        };

        let (renderer, host) = window_loop.runtime_mut().renderer_and_host_mut();
        self.input
            .dispatch_pointer_event(renderer, host, phase, point, button)
    }

    fn cancel_window_pointer_interaction(&mut self) {
        if let Some(window_loop) = self.window_loop.as_mut() {
            self.input
                .cancel_pointer_interaction(window_loop.runtime_mut().renderer_mut());
        }
    }

    fn dispatch_window_focus_event(&mut self, focused: bool) -> Result<(), NativeWindowSmokeError> {
        let Some(window_loop) = self.window_loop.as_mut() else {
            self.input.record_focus_event(focused);
            return Ok(());
        };

        self.input
            .dispatch_focus_event(window_loop.runtime_mut().host_mut(), focused)
    }

    fn dispatch_window_keyboard_event(
        &mut self,
        event: &winit::event::KeyEvent,
    ) -> Result<(), NativeWindowSmokeError> {
        let Some(window_loop) = self.window_loop.as_mut() else {
            self.input.record_keyboard_event(event);
            return Ok(());
        };

        self.input
            .dispatch_keyboard_event(window_loop.runtime_mut().host_mut(), event)
    }

    fn request_redraw(&self) {
        if let Some(window) = &self.window {
            window.request_redraw();
        }
    }

    fn apply_app_loop_action(
        &mut self,
        event_loop: &ActiveEventLoop,
        action: NativeProductAppLoopAction,
    ) -> bool {
        if action.tick_host_lifecycle {
            if let Err(error) = self.tick_host_lifecycle_once() {
                self.fail_and_exit(event_loop, error);
                return false;
            }
        }
        if action.request_redraw {
            self.request_redraw();
        }
        true
    }

    fn tick_host_lifecycle_once(&mut self) -> Result<(), NativeWindowSmokeError> {
        let Some(window_loop) = self.window_loop.as_mut() else {
            return Ok(());
        };
        let report = window_loop
            .tick_host_lifecycle_with_audio_teardown()
            .map_err(|error| {
                NativeWindowSmokeError::new(format!(
                    "Native renderer smoke lifecycle tick failed: {error}."
                ))
            })?;
        self.texture_metrics.record_lifecycle_sync(&report);
        Ok(())
    }

    fn fail_and_exit(&mut self, event_loop: &ActiveEventLoop, error: NativeWindowSmokeError) {
        self.error = Some(error);
        event_loop.exit();
    }
}
