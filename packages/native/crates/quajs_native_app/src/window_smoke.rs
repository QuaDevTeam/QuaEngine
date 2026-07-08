mod app;
mod config;
mod error;
mod frame;
mod input;
mod metrics;
mod report;
mod report_builder;
mod texture_host;

use app::NativeWindowSmokeApp;
use config::{load_window_smoke_frame_source, native_window_smoke_enabled};
use winit::event_loop::EventLoop;

#[allow(unused_imports)]
pub use config::{WINDOW_SMOKE_ENV, WINDOW_SMOKE_FRAMES_ENV, WINDOW_SMOKE_FRAME_ENV};
pub use error::NativeWindowSmokeError;
pub use report::NativeWindowSmokeReport;

pub fn run_native_window_smoke_from_env(
) -> Result<Option<NativeWindowSmokeReport>, NativeWindowSmokeError> {
    if !native_window_smoke_enabled() {
        return Ok(None);
    }

    let frame_source = load_window_smoke_frame_source()?;
    let event_loop = EventLoop::new().map_err(|error| {
        NativeWindowSmokeError::new(format!(
            "Failed to create native window event loop for renderer smoke: {error}."
        ))
    })?;
    let mut app = NativeWindowSmokeApp::new(frame_source);
    event_loop.run_app(&mut app).map_err(|error| {
        NativeWindowSmokeError::new(format!(
            "Native window renderer smoke event loop failed: {error}."
        ))
    })?;

    if let Some(error) = app.error {
        return Err(error);
    }

    app.report.map(Some).ok_or_else(|| {
        NativeWindowSmokeError::new(
            "Native window renderer smoke exited before producing a report.",
        )
    })
}

#[cfg(test)]
mod tests;
