use std::fmt::{Display, Formatter};

use crate::product_window::NativeProductWindowPresentFailure;
use crate::product_window_loop::NativeProductWindowLoopError;

#[derive(Debug)]
pub struct NativeWindowSmokeError {
    message: String,
    present_failure: Option<NativeProductWindowPresentFailure>,
}

impl NativeWindowSmokeError {
    pub(super) fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            present_failure: None,
        }
    }

    pub(super) fn from_window_loop_error(error: NativeProductWindowLoopError) -> Self {
        let present_failure = error.present_failure().cloned();
        Self {
            message: format!("Native renderer smoke frame failed: {error}."),
            present_failure,
        }
    }

    pub(super) fn present_failure(&self) -> Option<&NativeProductWindowPresentFailure> {
        self.present_failure.as_ref()
    }
}

impl Display for NativeWindowSmokeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for NativeWindowSmokeError {}
