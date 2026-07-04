use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub struct NativeWindowSmokeError {
    message: String,
}

impl NativeWindowSmokeError {
    pub(super) fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl Display for NativeWindowSmokeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for NativeWindowSmokeError {}
