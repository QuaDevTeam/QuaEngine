use std::sync::Arc;

use winit::dpi::{LogicalSize, PhysicalSize};
use winit::event_loop::ActiveEventLoop;
use winit::window::Window;

use super::bootstrap::NativeWindowSmokeRuntime;
use super::config::load_window_smoke_target_frame_count;
use super::error::NativeWindowSmokeError;
use super::frame::{frame_json_for_window, normalized_physical_size, window_frame_dimensions};
use super::input::NativeWindowSmokeInputState;
use super::metrics::{NativeWindowSmokeAudioMetrics, NativeWindowSmokeTextureMetrics};
use super::present::present_window_smoke_frame;
use super::report::NativeWindowSmokeReport;
use super::report_builder::{build_window_smoke_report, NativeWindowSmokeReportInput};
use super::resize::NativeWindowSmokeResizeState;
use super::texture_host::create_window_smoke_texture_host;
use crate::product_frame_scheduler::NativeProductFrameScheduler;

mod events;

pub(super) struct NativeWindowSmokeApp {
    frame_source: String,
    window: Option<Arc<Window>>,
    runtime: Option<NativeWindowSmokeRuntime>,
    input: NativeWindowSmokeInputState,
    texture_metrics: NativeWindowSmokeTextureMetrics,
    frame_scheduler: NativeProductFrameScheduler,
    resize_state: NativeWindowSmokeResizeState,
    pub(super) report: Option<NativeWindowSmokeReport>,
    pub(super) error: Option<NativeWindowSmokeError>,
}

impl NativeWindowSmokeApp {
    pub(super) fn new(frame_source: String) -> Self {
        Self {
            frame_source,
            window: None,
            runtime: None,
            input: NativeWindowSmokeInputState::default(),
            texture_metrics: NativeWindowSmokeTextureMetrics::default(),
            frame_scheduler: NativeProductFrameScheduler::new(
                load_window_smoke_target_frame_count(),
            ),
            resize_state: NativeWindowSmokeResizeState::default(),
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
        let runtime =
            NativeWindowSmokeRuntime::bootstrap(&instance, surface, physical_size, texture_host)?;

        self.runtime = Some(runtime);
        self.window = Some(window.clone());
        window.request_redraw();

        Ok(())
    }

    fn render_once(
        &mut self,
        allow_occluded_report: bool,
    ) -> Result<NativeWindowSmokeReport, NativeWindowSmokeError> {
        let window = self.window.as_ref().ok_or_else(|| {
            NativeWindowSmokeError::new("Native renderer smoke window is not initialized.")
        })?;
        let runtime = self.runtime.as_mut().ok_or_else(|| {
            NativeWindowSmokeError::new("Native renderer smoke runtime is not initialized.")
        })?;

        let dimensions = window_frame_dimensions(window.inner_size(), window.scale_factor());
        let frame_json = frame_json_for_window(
            &self.frame_source,
            dimensions.logical_width,
            dimensions.logical_height,
            dimensions.device_pixel_ratio,
        )?;

        let product_frame = runtime
            .render_projection_json_with_audio_teardown(&frame_json)
            .map_err(|error| {
                NativeWindowSmokeError::new(format!("Native renderer smoke frame failed: {error}."))
            })?;
        let synced_frame = product_frame.synced_frame;
        self.texture_metrics.record_texture_sync(
            &synced_frame.frame.texture_upload_report,
            &synced_frame.frame.texture_host_cleanup_report,
            synced_frame.frame.resubmitted_after_texture_upload,
            &synced_frame.bundle_lifecycle_report,
        );
        let synced_frame = synced_frame.frame;
        let frame_result = synced_frame.frame;
        {
            let (renderer, host) = runtime.renderer_and_host_mut();
            self.input
                .run_open_settings_probe(renderer, host, &frame_json)?;
        }
        let present_outcome = present_window_smoke_frame(runtime, allow_occluded_report)?;
        let input_metrics = self.input.metrics();
        if product_frame.frame_number >= self.frame_scheduler.target_frame_count() {
            let shutdown = runtime.shutdown_with_audio_teardown().map_err(|error| {
                NativeWindowSmokeError::new(format!(
                    "Native renderer smoke shutdown failed: {error}."
                ))
            })?;
            self.texture_metrics.record_shutdown_cleanup(&shutdown);
        }
        let audio_metrics =
            NativeWindowSmokeAudioMetrics::from_null_backend(runtime.renderer().audio_backend());

        Ok(build_window_smoke_report(NativeWindowSmokeReportInput {
            adapter_name: &runtime.adapter_name,
            surface_format: &runtime.surface_format,
            present_mode: &runtime.present_mode,
            present_status: &present_outcome.present_status,
            presented: present_outcome.presented,
            present_attempt_count: self.frame_scheduler.attempt_count(),
            target_frame_count: self.frame_scheduler.target_frame_count(),
            rendered_frame_count: product_frame.frame_number,
            resize_count: self.resize_state.count(),
            surface_recovery_count: self.frame_scheduler.surface_recovery_count(),
            texture_metrics: &self.texture_metrics,
            audio_metrics: &audio_metrics,
            input_metrics,
            last_resize_physical_size: self.resize_state.last_physical_size(),
            dimensions,
            revision: frame_result.update.revision,
            pass_count: frame_result.submission.pass_count,
            batch_count: frame_result.submission.batch_count,
            command_count: frame_result.submission.command_count,
            submitted_command_buffer_count: present_outcome.submitted_command_buffer_count,
        }))
    }

    fn resize_surface(&mut self, size: PhysicalSize<u32>) -> Result<(), NativeWindowSmokeError> {
        let Some(runtime) = self.runtime.as_mut() else {
            return Ok(());
        };
        let physical_size = normalized_physical_size(size);
        let resize_report = runtime.resize_to_physical_size(physical_size)?;
        self.resize_state.record_resize(resize_report);
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
        let Some(runtime) = self.runtime.as_mut() else {
            return Ok(());
        };

        let (renderer, host) = runtime.renderer_and_host_mut();
        self.input
            .dispatch_pointer_event(renderer, host, phase, point, button)
    }

    fn cancel_window_pointer_interaction(&mut self) {
        if let Some(runtime) = self.runtime.as_mut() {
            self.input
                .cancel_pointer_interaction(runtime.renderer_mut());
        }
    }

    fn dispatch_window_focus_event(&mut self, focused: bool) -> Result<(), NativeWindowSmokeError> {
        let Some(runtime) = self.runtime.as_mut() else {
            self.input.record_focus_event(focused);
            return Ok(());
        };

        self.input.dispatch_focus_event(runtime.host_mut(), focused)
    }

    fn dispatch_window_keyboard_event(
        &mut self,
        event: &winit::event::KeyEvent,
    ) -> Result<(), NativeWindowSmokeError> {
        let Some(runtime) = self.runtime.as_mut() else {
            self.input.record_keyboard_event(event);
            return Ok(());
        };

        self.input
            .dispatch_keyboard_event(runtime.host_mut(), event)
    }

    fn recover_surface_from_window_size(&mut self) -> Result<(), NativeWindowSmokeError> {
        let size = self.window.as_ref().map(|window| window.inner_size());
        if let Some(size) = size {
            self.resize_surface(size)?;
            self.frame_scheduler.record_surface_recovery();
        }
        Ok(())
    }

    fn request_redraw(&self) {
        if let Some(window) = &self.window {
            window.request_redraw();
        }
    }

    fn fail_and_exit(&mut self, event_loop: &ActiveEventLoop, error: NativeWindowSmokeError) {
        self.error = Some(error);
        event_loop.exit();
    }
}
